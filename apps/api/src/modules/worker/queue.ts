import type { Redis } from 'ioredis';
import { Queue } from 'bullmq';

export type { ProcessDocumentJobData } from './worker.types.js';
export const PROCESS_DOCUMENT_QUEUE = 'process-document';

export function createDocumentQueue({ connection }: { connection: Redis }) {
  type JobData = { documentId: string; vaultId: string };
  const queue = new Queue<JobData>(PROCESS_DOCUMENT_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });

  async function enqueueProcessDocument({
    documentId,
    vaultId,
  }: JobData) {
    await queue.add(
      'process',
      { documentId, vaultId },
      { jobId: `process-doc-${documentId}` },
    );
  }

  async function close() {
    await queue.close();
  }

  return { enqueueProcessDocument, close, queue };
}

export type DocumentQueue = ReturnType<typeof createDocumentQueue>;
