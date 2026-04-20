import type { Redis } from 'ioredis';
import { Queue } from 'bullmq';

export type { ProcessDocumentJobData } from './worker.types.js';
export const PROCESS_DOCUMENT_QUEUE = 'process-document';

export function createDocumentQueue({ connection }: { connection: Redis }) {
  type JobData = { documentId: string; vaultId: string };
  type EnqueueOptions = JobData & { replaceExisting?: boolean };
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
    replaceExisting = false,
  }: EnqueueOptions) {
    const jobId = `process-doc-${documentId}`;

    if (replaceExisting) {
      const existingJob = await queue.getJob(jobId);

      if (existingJob !== undefined && existingJob !== null) {
        const state = await existingJob.getState();

        if (state === 'active' || state === 'waiting' || state === 'delayed' || state === 'prioritized') {
          return;
        }

        await existingJob.remove();
      }
    }

    await queue.add('process', { documentId, vaultId }, { jobId });
  }

  async function close() {
    await queue.close();
  }

  return { enqueueProcessDocument, close, queue };
}

export type DocumentQueue = ReturnType<typeof createDocumentQueue>;
