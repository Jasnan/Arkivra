import type { Database } from '../database/database.js';
import { createPostgresQueue, getScopedQueueName } from './postgres-jobs.js';

export const MAINTENANCE_QUEUE = 'maintenance';
export const HARD_DELETE_EXPIRED_DOCUMENTS_JOB = 'hard-delete-expired-documents';

export type HardDeleteExpiredDocumentsJobData = {
  retentionDays?: number;
};

export function createMaintenanceQueue({
  db,
  appInstance,
}: {
  db: Database;
  appInstance?: string;
}) {
  const queue = createPostgresQueue<HardDeleteExpiredDocumentsJobData>({
    db,
    queueName: getScopedQueueName(MAINTENANCE_QUEUE, appInstance),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  });

  async function enqueueHardDeleteExpiredDocuments(data: HardDeleteExpiredDocumentsJobData = {}) {
    await queue.add(HARD_DELETE_EXPIRED_DOCUMENTS_JOB, data);
  }

  async function scheduleHardDeleteExpiredDocuments({
    cronPattern,
    retentionDays,
  }: {
    cronPattern: string;
    retentionDays: number;
  }) {
    await queue.add(
      HARD_DELETE_EXPIRED_DOCUMENTS_JOB,
      { retentionDays },
      {
        jobId: 'hard-delete-expired-documents-daily',
        repeat: {
          pattern: cronPattern,
        },
      },
    );
  }

  async function close() {
    await queue.close();
  }

  return {
    close,
    enqueueHardDeleteExpiredDocuments,
    queue,
    scheduleHardDeleteExpiredDocuments,
  };
}

export type MaintenanceQueue = ReturnType<typeof createMaintenanceQueue>;
