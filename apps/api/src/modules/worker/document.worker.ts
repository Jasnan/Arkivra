import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ParsePipeline } from '../parsing/parse-pipeline.js';
import type { ChunkEmbedder } from '../parsing/ollama-embedder.js';
import type { ProcessDocumentJobData } from './queue.js';
import { createDocumentsServices } from '../documents/documents.services.js';
import { eq, and } from 'drizzle-orm';
import { documentsTable, uploadSessionsTable } from '../database/schema/index.js';
import { persistParsedDocument } from '../parsing/persistence.js';
import { PROCESS_DOCUMENT_QUEUE } from './queue.js';
import { AsyncJob, createPostgresWorker } from './postgres-jobs.js';

const WORKER_PROGRESS = {
  partitioning: 30,
  chunking: 55,
  summarising: 75,
  vectorising: 95,
  completed: 100,
} as const;

export type DocumentWorkerDeps = {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  parsePipeline: ParsePipeline;
  chunkEmbedder?: ChunkEmbedder;
  startPolling?: boolean;
};

export function createDocumentWorker(deps: DocumentWorkerDeps) {
  const { db, storage, encryption, parsePipeline, chunkEmbedder, startPolling = true } = deps;
  const documentsServices = createDocumentsServices({ db, storage, encryption });

  async function setProcessingStage({
    documentId,
    vaultId,
    processingStatus,
    progress,
    job,
  }: {
    documentId: string;
    vaultId: string;
    processingStatus: 'partitioning' | 'chunking' | 'summarising' | 'vectorising' | 'completed';
    progress: number;
    job: AsyncJob<ProcessDocumentJobData>;
  }) {
    await documentsServices.updateDocumentProcessingStatus({
      documentId,
      vaultId,
      processingStatus,
    });
    await job.updateProgress(progress);
  }

  async function updateRelatedUploadSession({
    documentId,
    status,
    errorCode = null,
    errorMessage = null,
  }: {
    documentId: string;
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
      .where(eq(uploadSessionsTable.documentId, documentId));
  }

  async function processDocument(job: AsyncJob<ProcessDocumentJobData>) {
    const { documentId, vaultId } = job.data;
    await setProcessingStage({
      documentId,
      vaultId,
      processingStatus: 'partitioning',
      progress: WORKER_PROGRESS.partitioning,
      job,
    });
    await updateRelatedUploadSession({
      documentId,
      status: 'processing',
    });

    try {
      // 1. Fetch document record
      const [doc] = await db
        .select()
        .from(documentsTable)
        .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
        .limit(1);

      if (doc === undefined) {
        throw new Error(`Document ${documentId} not found in vault ${vaultId}`);
      }

      if (doc.isDeleted) {
        console.info(`Document ${documentId} is deleted, skipping processing`);
        return;
      }

      // 2. Read encrypted file from storage
      const rawData = await storage.read(doc.originalStorageKey);

      // 3. Decrypt if encrypted
      let fileData: Buffer;

      if (doc.fileEncryptionKeyWrapped !== null && doc.fileEncryptionKekVersion !== null) {
        fileData = encryption.decrypt({
          encryptedData: rawData,
          wrappedDek: doc.fileEncryptionKeyWrapped,
          kekVersion: doc.fileEncryptionKekVersion,
        });
      } else {
        fileData = rawData;
      }

      // 4. Parse → clean → chunk via the engine-agnostic pipeline. The worker
      //    never touches parser-specific fields; it consumes ParsedDocument.
      const parsed = await parsePipeline.run({
        documentId,
        fileName: doc.originalName,
        mimeType: doc.mimeType,
        fileData,
      }, {
        onStageChange: async (stage) => {
          if (stage === 'chunking') {
            await setProcessingStage({
              documentId,
              vaultId,
              processingStatus: 'chunking',
              progress: WORKER_PROGRESS.chunking,
              job,
            });
          }

          if (stage === 'summarising') {
            await setProcessingStage({
              documentId,
              vaultId,
              processingStatus: 'summarising',
              progress: WORKER_PROGRESS.summarising,
              job,
            });
          }
        },
      });

      // 5. Persist raw + cleaned text + chunks via the parsing-module writer.
      //    `storage` and `encryption` are forwarded so the writer can persist
      //    chunk-level image / table assets through the same KEK family as
      //    the source document.
      await persistParsedDocument({
        db,
        storage,
        encryption,
        embedder: chunkEmbedder,
        hooks: {
          onStageChange: async (stage) => {
            if (stage === 'vectorising') {
              await setProcessingStage({
                documentId,
                vaultId,
                processingStatus: 'vectorising',
                progress: WORKER_PROGRESS.vectorising,
                job,
              });
            }
          },
        },
        documentId,
        vaultId,
        parsed,
      });

      await updateRelatedUploadSession({
        documentId,
        status: 'completed',
      });

      await setProcessingStage({
        documentId,
        vaultId,
        processingStatus: 'completed',
        progress: WORKER_PROGRESS.completed,
        job,
      });

      console.info(
        `Processed document ${documentId} via ${parsed.engine}@${parsed.engineVersion}: ${parsed.chunks.length} chunks, ${parsed.text.length} chars of text content`,
      );
      if (parsed.warnings.length > 0) {
        console.info(
          `Document ${documentId} parser warnings: ${parsed.warnings.join(', ')}`,
        );
      }
    } catch (error) {
      await documentsServices.updateDocumentProcessingStatus({
        documentId,
        vaultId,
        processingStatus: 'failed',
      });
      await updateRelatedUploadSession({
        documentId,
        status: 'failed',
        errorCode: 'document.processing_failed',
        errorMessage: error instanceof Error ? error.message : 'Document processing failed',
      });
      throw error;
    }
  }

  const worker = createPostgresWorker<ProcessDocumentJobData>({
    db,
    queueName: PROCESS_DOCUMENT_QUEUE,
    concurrency: 2,
    autorun: startPolling,
    handler: async (job) => {
      await processDocument(job);
    },
  });

  worker.on('failed', (job, error) => {
    console.error(`Document processing failed for job ${job?.id ?? 'unknown'}:`, error.message);
  });

  worker.on('completed', (job) => {
    console.info(`Document processing completed for job ${job.id}`);
  });

  async function close() {
    await worker.close();
  }

  return { worker, close, processDocument };
}
