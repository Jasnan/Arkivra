import type { Redis } from 'ioredis';
import type { Job } from 'bullmq';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { DoclingClient } from '../docling/docling.client.js';
import type { ProcessDocumentJobData } from './queue.js';
import { createDocumentsServices } from '../documents/documents.services.js';
import { Worker } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { documentsTable, documentChunksTable, uploadSessionsTable } from '../database/schema/index.js';
import { chunkMarkdownContent } from '../docling/docling.chunker.js';
import { sanitizeDoclingMarkdown, sanitizeDoclingText } from '../docling/docling.text.js';
import { PROCESS_DOCUMENT_QUEUE } from './queue.js';

export type DocumentWorkerDeps = {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  doclingClient: DoclingClient;
  connection: Redis;
};

export function createDocumentWorker(deps: DocumentWorkerDeps) {
  const { db, storage, encryption, doclingClient, connection } = deps;
  const documentsServices = createDocumentsServices({ db, storage, encryption });

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

  async function processDocument(job: Job<ProcessDocumentJobData>) {
    const { documentId, vaultId } = job.data;
    await documentsServices.updateDocumentProcessingStatus({
      documentId,
      vaultId,
      processingStatus: 'processing',
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

      await job.updateProgress(20);

      // 4. Send to Docling for conversion
      const result = await doclingClient.convertFile({
        fileName: doc.originalName,
        mimeType: doc.mimeType,
        fileData,
      });

      await job.updateProgress(60);

      // 5. Parse response into chunks
      const textContent = sanitizeDoclingText(result.document.text_content || '');
      const markdownContent = sanitizeDoclingMarkdown(result.document.md_content || '');
      const chunkSource = markdownContent || textContent;
      const chunks = chunkMarkdownContent(chunkSource);

      // 6. Delete any existing chunks for this document (re-processing)
      await db.delete(documentChunksTable).where(eq(documentChunksTable.documentId, documentId));

      // 7. Insert chunks
      if (chunks.length > 0) {
        await db.insert(documentChunksTable).values(
          chunks.map((chunk) => ({
            documentId,
            vaultId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            pageNumber: chunk.pageNumber,
            chunkType: chunk.chunkType,
            tokenCount: chunk.tokenCount,
          })),
        );
      }

      await job.updateProgress(90);

      // 8. Update documents.content with full text
      await db
        .update(documentsTable)
        .set({
          content: textContent,
          processingStatus: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(documentsTable.id, documentId));
      await updateRelatedUploadSession({
        documentId,
        status: 'completed',
      });

      await job.updateProgress(100);

      console.info(
        `Processed document ${documentId}: ${chunks.length} chunks, ${textContent.length} chars of text content`,
      );
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

  const worker = new Worker<ProcessDocumentJobData>(
    PROCESS_DOCUMENT_QUEUE,
    async (job) => {
      await processDocument(job);
    },
    {
      connection,
      concurrency: 2,
    },
  );

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
