import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ParsePipeline } from '../parsing/parse-pipeline.js';
import type { ProcessDocumentJobData } from './queue.js';
import type { createActivityServices } from '../activity/activity.services.js';
import type { EmbeddingIndexQueue } from '../ai/indexing/index.js';
import { createDocumentsServices } from '../documents/documents.services.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  documentsTable,
  documentVersionsTable,
  uploadSessionsTable,
} from '../database/schema/index.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import { persistParsedDocument } from '../parsing/persistence.js';
import { getPdfPageCount, sha256Hex } from '../parsing/binary-diagnostics.js';
import { PROCESS_DOCUMENT_QUEUE } from './queue.js';
import type { AsyncJob } from './postgres-jobs.js';
import { createPostgresWorker, getScopedQueueName } from './postgres-jobs.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import type { DocumentConverter } from '../document-conversion/index.js';
import { isOfficeDocumentConvertible } from '../document-conversion/index.js';
import { documentVersionPreviewPdfStorageKey } from '../documents/document-storage-keys.js';

const WORKER_PROGRESS = {
  partitioning: 30,
  chunking: 55,
  summarising: 75,
  completed: 100,
} as const;

export type DocumentWorkerDeps = {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  parsePipeline: ParsePipeline;
  appInstance?: string;
  startPolling?: boolean;
  pauseWhen?: () => Promise<boolean>;
  concurrency?: number;
  activityServices?: ReturnType<typeof createActivityServices>;
  adminAiServices?: {
    getSettings: () => Promise<{ aiFeaturesEnabled: boolean }>;
  };
  embeddingIndexQueue?: EmbeddingIndexQueue;
  documentConverter?: DocumentConverter;
};

export function createDocumentWorker(deps: DocumentWorkerDeps) {
  const {
    db,
    storage,
    encryption,
    parsePipeline,
    appInstance,
    startPolling = true,
    pauseWhen,
    concurrency = 1,
    activityServices,
    adminAiServices,
    embeddingIndexQueue,
    documentConverter,
  } = deps;
  const documentsServices = createDocumentsServices({ db, storage, encryption });
  const logPrefix = '[document-worker]';
  const queueName = getScopedQueueName(PROCESS_DOCUMENT_QUEUE, appInstance);

  class DocumentProcessingRunSupersededError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'DocumentProcessingRunSupersededError';
    }
  }

  function isSupersededProcessingRunError(error: unknown) {
    return (
      error instanceof DocumentProcessingRunSupersededError ||
      (error instanceof Error && /was superseded before/.test(error.message))
    );
  }

  async function assertCurrentProcessingRun({
    job,
    documentId,
    documentVersionId,
    stage,
  }: {
    job: AsyncJob<ProcessDocumentJobData>;
    documentId: string;
    documentVersionId: string;
    stage: string;
  }) {
    const processingRunId = job.data.processingRunId;
    if (processingRunId === undefined) {
      return;
    }

    const rows = await db.execute<{
      status: string;
      payload: { processingRunId?: unknown } | null;
    }>(sql`
      SELECT status, payload
      FROM background_jobs
      WHERE id = ${job.id}
        AND queue_name = ${queueName}
      LIMIT 1
    `);
    const row = rows.rows[0];
    const currentRunId = row?.payload?.processingRunId;

    if (row?.status !== 'running' || currentRunId !== processingRunId) {
      throw new DocumentProcessingRunSupersededError(
        `Document processing run ${processingRunId} for ${documentId}/${documentVersionId} was superseded before ${stage}`,
      );
    }
  }

  async function setProcessingStage({
    documentId,
    documentVersionId,
    vaultId,
    processingStatus,
    progress,
    job,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    processingStatus: 'partitioning' | 'chunking' | 'summarising' | 'completed';
    progress: number;
    job: AsyncJob<ProcessDocumentJobData>;
  }) {
    await assertCurrentProcessingRun({
      job,
      documentId,
      documentVersionId,
      stage: `status:${processingStatus}`,
    });
    console.info(`${logPrefix} ${documentId} -> stage=${processingStatus} progress=${progress}%`);
    await documentsServices.updateDocumentVersionProcessingStatus({
      documentId,
      documentVersionId,
      vaultId,
      processingStatus,
    });
    await activityServices?.emitActivityEvent({
      activityType: ACTIVITY_EVENT_TYPES.documentProcessingStatusChanged,
      entityType: 'document',
      entityId: documentId,
      actor: { type: 'system', displayName: 'System' },
      vaultId,
      documentId,
      target: { type: 'document', id: documentId },
      source: 'background',
      metadata: { processing_status: processingStatus, progress },
    });
    await job.updateProgress(progress);
  }

  async function updateRelatedUploadSession({
    documentId,
    documentVersionId,
    status,
    errorCode = null,
    errorMessage = null,
  }: {
    documentId: string;
    documentVersionId: string;
    status: 'processing' | 'completed' | 'failed';
    errorCode?: string | null;
    errorMessage?: string | null;
  }) {
    await db
      .update(uploadSessionsTable)
      .set({
        status,
        errorCode,
        errorMessage,
        completedAt: status === 'completed' ? sql`now()` : null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(uploadSessionsTable.documentId, documentId),
          eq(uploadSessionsTable.documentVersionId, documentVersionId),
        ),
      );
  }

  async function enqueueEmbeddingIndexingForCompletedDocument({
    documentId,
    documentVersionId,
  }: {
    documentId: string;
    documentVersionId: string;
  }) {
    if (adminAiServices === undefined || embeddingIndexQueue === undefined) {
      return;
    }

    try {
      const settings = await adminAiServices.getSettings();
      if (!settings.aiFeaturesEnabled) {
        return;
      }

      const activeIndex = await createEmbeddingIndexServices({ db }).getActiveEmbeddingIndex();
      if (activeIndex === null) {
        return;
      }

      await embeddingIndexQueue.enqueueDocumentIndexing({
        embeddingIndexId: activeIndex.id,
        documentVersionId,
      });
    } catch (error) {
      console.error(
        `${logPrefix} could not enqueue semantic indexing for ${documentId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  async function storePreviewPdf({
    documentId,
    documentVersionId,
    vaultId,
    pdfData,
    converter,
    converterVersion,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    pdfData: Buffer;
    converter: string;
    converterVersion: string | null;
  }) {
    const storageKey = documentVersionPreviewPdfStorageKey({ documentVersionId });
    const sha256Hash = sha256Hex(pdfData);
    let dataToStore = pdfData;
    let wrappedDek: string | null = null;
    let kekVersion: string | null = null;
    let algorithm: string | null = null;

    if (encryption.isEnabled()) {
      const encrypted = encryption.encrypt(pdfData);
      dataToStore = encrypted.encryptedData;
      wrappedDek = encrypted.wrappedDek;
      kekVersion = encrypted.kekVersion;
      algorithm = encrypted.algorithm;
    }

    await storage.write(storageKey, dataToStore);

    const previewFields = {
      previewPdfStorageKey: storageKey,
      previewPdfSize: pdfData.length,
      previewPdfSha256Hash: sha256Hash,
      previewPdfConverter: converter,
      previewPdfConverterVersion: converterVersion,
      previewPdfCreatedAt: sql`now()`,
      previewPdfEncryptionKeyWrapped: wrappedDek,
      previewPdfEncryptionKekVersion: kekVersion,
      previewPdfEncryptionAlgorithm: algorithm,
      updatedAt: sql`now()`,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(documentVersionsTable)
        .set(previewFields)
        .where(
          and(
            eq(documentVersionsTable.id, documentVersionId),
            eq(documentVersionsTable.documentId, documentId),
            eq(documentVersionsTable.vaultId, vaultId),
          ),
        );

      await tx
        .update(documentsTable)
        .set(previewFields)
        .where(
          and(
            eq(documentsTable.id, documentId),
            eq(documentsTable.vaultId, vaultId),
            eq(documentsTable.currentVersionId, documentVersionId),
          ),
        );
    });

    return {
      storageKey,
      sha256Hash,
      encryptionKeyWrapped: wrappedDek,
      encryptionKekVersion: kekVersion,
    };
  }

  async function readStoredPreviewPdf({
    storageKey,
    wrappedDek,
    kekVersion,
  }: {
    storageKey: string;
    wrappedDek: string | null;
    kekVersion: string | null;
  }) {
    const rawData = await storage.read(storageKey);

    if (wrappedDek !== null && kekVersion !== null) {
      return encryption.decrypt({ encryptedData: rawData, wrappedDek, kekVersion });
    }

    return rawData;
  }

  async function processDocument(job: AsyncJob<ProcessDocumentJobData>) {
    const { documentId, documentVersionId, vaultId } = job.data;
    console.info(`${logPrefix} starting job=${job.id} document=${documentId} version=${documentVersionId} vault=${vaultId} run=${job.data.processingRunId ?? 'legacy'}`);

    try {
      await setProcessingStage({
        documentId,
        documentVersionId,
        vaultId,
        processingStatus: 'partitioning',
        progress: WORKER_PROGRESS.partitioning,
        job,
      });
      await updateRelatedUploadSession({
        documentId,
        documentVersionId,
        status: 'processing',
      });

      // 1. Fetch document record
      const [doc] = await db
        .select({
          id: documentsTable.id,
          vaultId: documentsTable.vaultId,
          isDeleted: documentsTable.isDeleted,
          versionId: documentVersionsTable.id,
          originalName: documentVersionsTable.originalName,
          originalStorageKey: documentVersionsTable.originalStorageKey,
          originalSha256Hash: documentVersionsTable.originalSha256Hash,
          mimeType: documentVersionsTable.mimeType,
          previewPdfStorageKey: documentVersionsTable.previewPdfStorageKey,
          previewPdfSha256Hash: documentVersionsTable.previewPdfSha256Hash,
          previewPdfEncryptionKeyWrapped: documentVersionsTable.previewPdfEncryptionKeyWrapped,
          previewPdfEncryptionKekVersion: documentVersionsTable.previewPdfEncryptionKekVersion,
          fileEncryptionKeyWrapped: documentVersionsTable.fileEncryptionKeyWrapped,
          fileEncryptionKekVersion: documentVersionsTable.fileEncryptionKekVersion,
        })
        .from(documentVersionsTable)
        .innerJoin(
          documentsTable,
          and(
            eq(documentVersionsTable.documentId, documentsTable.id),
            eq(documentVersionsTable.vaultId, documentsTable.vaultId),
          ),
        )
        .where(
          and(
            eq(documentVersionsTable.id, documentVersionId),
            eq(documentVersionsTable.documentId, documentId),
            eq(documentVersionsTable.vaultId, vaultId),
            isNull(documentVersionsTable.deletedAt),
            eq(documentsTable.id, documentId),
            eq(documentsTable.vaultId, vaultId),
          ),
        )
        .limit(1);

      if (doc === undefined) {
        throw new Error(`Document ${documentId} not found in vault ${vaultId}`);
      }

      console.info(
        `${logPrefix} loaded document=${documentId} name="${doc.originalName}" mime=${doc.mimeType} storageKey=${doc.originalStorageKey}`,
      );

      if (doc.isDeleted) {
        console.info(`Document ${documentId} is deleted, skipping processing`);
        return;
      }

      const stageHooks = {
        onStageChange: async (stage: 'chunking' | 'summarising') => {
          if (stage === 'chunking') {
            await setProcessingStage({
              documentId,
              documentVersionId,
              vaultId,
              processingStatus: 'chunking',
              progress: WORKER_PROGRESS.chunking,
              job,
            });
          }

          if (stage === 'summarising') {
            await setProcessingStage({
              documentId,
              documentVersionId,
              vaultId,
              processingStatus: 'summarising',
              progress: WORKER_PROGRESS.summarising,
              job,
            });
          }
        },
      } as const;

      // 2. Read encrypted file from storage
      console.info(`${logPrefix} reading source file for ${documentId}`);
      const rawData = await storage.read(doc.originalStorageKey);
      console.info(
        `${logPrefix} source encrypted document=${documentId} version=${documentVersionId} storageKey=${doc.originalStorageKey} bytes=${rawData.length} sha256=${sha256Hex(rawData)}`,
      );

      // 3. Decrypt if encrypted
      let fileData: Buffer;

      if (doc.fileEncryptionKeyWrapped !== null && doc.fileEncryptionKekVersion !== null) {
        console.info(`${logPrefix} decrypting source file for ${documentId}`);
        fileData = encryption.decrypt({
          encryptedData: rawData,
          wrappedDek: doc.fileEncryptionKeyWrapped,
          kekVersion: doc.fileEncryptionKekVersion,
        });
      } else {
        fileData = rawData;
      }
      console.info(
        `${logPrefix} source decrypted document=${documentId} version=${documentVersionId} bytes=${fileData.length} sha256=${sha256Hex(fileData)} expectedSha256=${doc.originalSha256Hash} pdfPages=${await getPdfPageCount({ fileData, fileName: doc.originalName, mimeType: doc.mimeType }) ?? 'n/a'} tempFiles=none`,
      );

      const actualSha256Hash = sha256Hex(fileData);
      if (actualSha256Hash !== doc.originalSha256Hash) {
        throw new Error(
          `Document source integrity check failed for version ${documentVersionId}: expected ${doc.originalSha256Hash}, got ${actualSha256Hash}`,
        );
      }

      await assertCurrentProcessingRun({
        job,
        documentId,
        documentVersionId,
        stage: 'parse',
      });

      let parseFileName = doc.originalName;
      let parseMimeType = doc.mimeType;
      let parseFileData = fileData;

      if (doc.previewPdfStorageKey !== null) {
        console.info(
          `${logPrefix} using existing preview PDF for document=${documentId} version=${documentVersionId}`,
        );
        parseFileName = `${doc.originalName}.preview.pdf`;
        parseMimeType = 'application/pdf';
        parseFileData = await readStoredPreviewPdf({
          storageKey: doc.previewPdfStorageKey,
          wrappedDek: doc.previewPdfEncryptionKeyWrapped,
          kekVersion: doc.previewPdfEncryptionKekVersion,
        });
      } else if (
        documentConverter !== undefined &&
        isOfficeDocumentConvertible({ fileName: doc.originalName, mimeType: doc.mimeType })
      ) {
        const health = await documentConverter.checkHealth();

        if (health.healthy) {
          try {
            console.info(
              `${logPrefix} converting Office document=${documentId} version=${documentVersionId} with ${documentConverter.provider}`,
            );
            const converted = await documentConverter.convertToPdf({
              fileName: doc.originalName,
              mimeType: doc.mimeType,
              fileData,
            });
            const stored = await storePreviewPdf({
              documentId,
              documentVersionId,
              vaultId,
              pdfData: converted.fileData,
              converter: converted.converter,
              converterVersion: converted.converterVersion,
            });
            parseFileName = converted.fileName;
            parseMimeType = converted.mimeType;
            parseFileData = converted.fileData;
            console.info(
              `${logPrefix} stored preview PDF for document=${documentId} version=${documentVersionId} bytes=${converted.fileData.length} sha256=${stored.sha256Hash}`,
            );
          } catch (error) {
            console.error(
              `${logPrefix} Office conversion failed for ${documentId}; continuing with original: ${error instanceof Error ? error.message : error}`,
            );
          }
        } else {
          console.warn(
            `${logPrefix} Office converter unavailable for ${documentId}; continuing with original${health.error === null ? '' : `: ${health.error}`}`,
          );
        }
      }

      // 4. Parse → select canonical text → chunk via the engine-agnostic
      //    pipeline. Fresh ingestion and reprocessing both rerun the same
      //    source-file path.
      console.info(`${logPrefix} parsing started for ${documentId}`);
      const parsed = await parsePipeline.run(
        {
          documentId,
          documentVersionId,
          fileName: parseFileName,
          displayFileName: doc.originalName,
          mimeType: parseMimeType,
          fileData: parseFileData,
        },
        stageHooks,
      );
      console.info(
        `${logPrefix} parsing finished for ${documentId} engine=${parsed.engine}@${parsed.engineVersion} chunks=${parsed.chunks.length} textChars=${parsed.text.length}`,
      );

      await assertCurrentProcessingRun({
        job,
        documentId,
        documentVersionId,
        stage: 'persistence',
      });

      // 5. Persist raw parser text, canonical text, and chunks via the parsing-module writer.
      //    `storage` and `encryption` are forwarded so the writer can persist
      //    chunk-level image / table assets through the same KEK family as
      //    the source document.
      console.info(`${logPrefix} persistence started for ${documentId}`);
      await persistParsedDocument({
        db,
        storage,
        encryption,
        documentId,
        documentVersionId,
        vaultId,
        parsed,
        expectedOriginalSha256Hash: doc.originalSha256Hash,
        expectedProcessingRun:
          job.data.processingRunId === undefined
            ? undefined
            : {
                jobId: job.id,
                queueName,
                processingRunId: job.data.processingRunId,
              },
      });
      console.info(`${logPrefix} persistence finished for ${documentId}`);

      await assertCurrentProcessingRun({
        job,
        documentId,
        documentVersionId,
        stage: 'completion',
      });

      await updateRelatedUploadSession({
        documentId,
        documentVersionId,
        status: 'completed',
      });

      await setProcessingStage({
        documentId,
        documentVersionId,
        vaultId,
        processingStatus: 'completed',
        progress: WORKER_PROGRESS.completed,
        job,
      });

      await enqueueEmbeddingIndexingForCompletedDocument({ documentId, documentVersionId });

      console.info(
        `Processed document ${documentId} via ${parsed.engine}@${parsed.engineVersion}: ${parsed.chunks.length} chunks, ${parsed.text.length} chars of text content`,
      );
      if (parsed.warnings.length > 0) {
        console.info(`Document ${documentId} parser warnings: ${parsed.warnings.join(', ')}`);
      }
    } catch (error) {
      if (isSupersededProcessingRunError(error)) {
        console.warn(`${logPrefix} ${error instanceof Error ? error.message : 'processing run superseded'}`);
        return;
      }

      console.error(
        `${logPrefix} processing failed for ${documentId}: ${error instanceof Error ? error.message : 'Document processing failed'}`,
      );
      await documentsServices.updateDocumentVersionProcessingStatus({
        documentId,
        documentVersionId,
        vaultId,
        processingStatus: 'failed',
        processingErrorCode: 'document.processing_failed',
        processingErrorMessage: error instanceof Error ? error.message : 'Document processing failed',
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.documentProcessingStatusChanged,
        entityType: 'document',
        entityId: documentId,
        actor: { type: 'system', displayName: 'System' },
        vaultId,
        documentId,
        target: { type: 'document', id: documentId },
        source: 'background',
        metadata: {
          processing_status: 'failed',
          error_message: error instanceof Error ? error.message : 'Document processing failed',
        },
      });
      await updateRelatedUploadSession({
        documentId,
        documentVersionId,
        status: 'failed',
        errorCode: 'document.processing_failed',
        errorMessage: error instanceof Error ? error.message : 'Document processing failed',
      });
      throw error;
    }
  }

  const worker = createPostgresWorker<ProcessDocumentJobData>({
    db,
    queueName,
    concurrency,
    autorun: startPolling,
    pauseWhen,
    handler: async (job) => {
      await processDocument(job);
    },
  });

  worker.on('failed', (job, error) => {
    console.error(`${logPrefix} job failed id=${job?.id ?? 'unknown'} error=${error.message}`);
  });

  worker.on('completed', (job) => {
    console.info(`${logPrefix} job completed id=${job.id}`);
  });

  async function close() {
    await worker.close();
  }

  return { worker, close, processDocument };
}
