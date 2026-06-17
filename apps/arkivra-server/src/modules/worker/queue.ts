import type { Database } from '../database/database.js';
import { createPostgresQueue, getScopedQueueName } from './postgres-jobs.js';
import type { ProcessDocumentJobData } from './worker.types.js';

export type { ProcessDocumentJobData } from './worker.types.js';
export const PROCESS_DOCUMENT_QUEUE = 'process-document';

export function createDocumentQueue({ db, appInstance }: { db: Database; appInstance?: string }) {
  type EnqueueOptions = ProcessDocumentJobData;
  const queue = createPostgresQueue<ProcessDocumentJobData>({
    db,
    queueName: getScopedQueueName(PROCESS_DOCUMENT_QUEUE, appInstance),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  });

  async function enqueueProcessDocument({
    documentId,
    documentVersionId,
    vaultId,
    replaceExisting = false,
  }: EnqueueOptions) {
    const jobId = `process-doc-version-${documentVersionId}`;

    if (replaceExisting) {
      const existingJob = await queue.getJob(jobId);

      if (existingJob !== undefined) {
        const state = await existingJob.getState();

        if (state === 'active' || state === 'waiting' || state === 'delayed') {
          return;
        }

        await existingJob.remove();
      }
    }

    await queue.add(
      'process',
      {
        documentId,
        documentVersionId,
        vaultId,
      },
      { jobId },
    );
  }

  async function close() {
    await queue.close();
  }

  return { enqueueProcessDocument, close, queue };
}

export type DocumentQueue = ReturnType<typeof createDocumentQueue>;
