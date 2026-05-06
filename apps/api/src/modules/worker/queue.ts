import type { Database } from '../database/database.js';
import { createPostgresQueue } from './postgres-jobs.js';

export type { ProcessDocumentJobData } from './worker.types.js';
export const PROCESS_DOCUMENT_QUEUE = 'process-document';

export function createDocumentQueue({ db }: { db: Database }) {
  type JobData = {
    documentId: string;
    vaultId: string;
    reprocessFromStoredArtifacts?: boolean;
  };
  type EnqueueOptions = JobData & { replaceExisting?: boolean };
  const queue = createPostgresQueue<JobData>({
    db,
    queueName: PROCESS_DOCUMENT_QUEUE,
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
    vaultId,
    replaceExisting = false,
    reprocessFromStoredArtifacts = false,
  }: EnqueueOptions) {
    const jobId = `process-doc-${documentId}`;

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
        vaultId,
        reprocessFromStoredArtifacts,
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
