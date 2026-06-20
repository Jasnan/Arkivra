import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ParsePipeline } from '../parsing/parse-pipeline.js';
import type { ProcessDocumentJobData } from './queue.js';
import type { createActivityServices } from '../activity/activity.services.js';
import type { EmbeddingIndexQueue } from '../ai/indexing/index.js';
import { createDocumentsServices } from '../documents/documents.services.js';
import { and, eq, isNull } from 'drizzle-orm';
import { documentsTable, documentVersionsTable, uploadSessionsTable } from '../database/schema/index.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import { persistParsedDocument } from '../parsing/persistence.js';
import { PROCESS_DOCUMENT_QUEUE } from './queue.js';
import type { AsyncJob } from './postgres-jobs.js';
import { createPostgresWorker, getScopedQueueName } from './postgres-jobs.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';

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
  } = deps;
  const documentsServices = createDocumentsServices({ db, storage, encryption });
  const logPrefix = '[document-worker]';

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
        completedAt: status === 'completed' ? new Date() : null,
        updatedAt: new Date(),
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

  async function processDocument(job: AsyncJob<ProcessDocumentJobData>) {
    const { documentId, documentVersionId, vaultId } = job.data;
    console.info(`${logPrefix} starting job=${job.id} document=${documentId} version=${documentVersionId} vault=${vaultId}`);
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

    try {
      // 1. Fetch document record
      const [doc] = await db
        .select({
          id: documentsTable.id,
          vaultId: documentsTable.vaultId,
          isDeleted: documentsTable.isDeleted,
          versionId: documentVersionsTable.id,
          originalName: documentVersionsTable.originalName,
          originalStorageKey: documentVersionsTable.originalStorageKey,
          mimeType: documentVersionsTable.mimeType,
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
      console.info(`${logPrefix} read ${rawData.length} bytes for ${documentId}`);

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
        `${logPrefix} source file ready for parsing ${documentId} bytes=${fileData.length}`,
      );

      // 4. Parse → clean → chunk via the engine-agnostic pipeline. Fresh
      //    ingestion and reprocessing both rerun the same source-file path.
      console.info(`${logPrefix} parsing started for ${documentId}`);
      const parsed = await parsePipeline.run(
        {
          documentId,
          documentVersionId,
          fileName: doc.originalName,
          mimeType: doc.mimeType,
          fileData,
        },
        stageHooks,
      );
      console.info(
        `${logPrefix} parsing finished for ${documentId} engine=${parsed.engine}@${parsed.engineVersion} chunks=${parsed.chunks.length} textChars=${parsed.text.length}`,
      );

      // 5. Persist raw + cleaned text + chunks via the parsing-module writer.
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
      });
      console.info(`${logPrefix} persistence finished for ${documentId}`);

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
      console.error(
        `${logPrefix} processing failed for ${documentId}: ${error instanceof Error ? error.message : 'Document processing failed'}`,
      );
      await documentsServices.updateDocumentVersionProcessingStatus({
        documentId,
        documentVersionId,
        vaultId,
        processingStatus: 'failed',
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
    queueName: getScopedQueueName(PROCESS_DOCUMENT_QUEUE, appInstance),
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
