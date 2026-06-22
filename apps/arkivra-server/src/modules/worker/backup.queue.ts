import type { Database } from '../database/database.js';
import { createPostgresQueue, getScopedQueueName } from './postgres-jobs.js';

export const BACKUP_QUEUE = 'backups';
export const CREATE_BACKUP_JOB = 'create-backup';
export const RESTORE_BACKUP_JOB = 'restore-backup';
export const BACKUP_OPERATION_JOB_ID = 'backup-operation-active';

export function backupOperationJobId(appInstance?: string) {
  return appInstance === undefined ? BACKUP_OPERATION_JOB_ID : `${appInstance}:${BACKUP_OPERATION_JOB_ID}`;
}

export type CreateBackupJobData = Record<string, never>;

export type RestoreBackupJobData = {
  backupId: string;
};

export function createBackupQueue({ db, appInstance }: { db: Database; appInstance?: string }) {
  const operationJobId = backupOperationJobId(appInstance);
  const queue = createPostgresQueue<CreateBackupJobData | RestoreBackupJobData>({
    db,
    queueName: getScopedQueueName(BACKUP_QUEUE, appInstance),
    defaultJobOptions: {
      attempts: 1,
    },
  });

  async function enqueueCreateBackup() {
    const job = await queue.add(CREATE_BACKUP_JOB, {}, { jobId: operationJobId });
    return { jobId: String(job.id) };
  }

  async function enqueueRestoreBackup({ backupId }: { backupId: string }) {
    const job = await queue.add(
      RESTORE_BACKUP_JOB,
      { backupId },
      { jobId: operationJobId },
    );
    return { jobId: String(job.id) };
  }

  async function close() {
    await queue.close();
  }

  return {
    close,
    enqueueCreateBackup,
    enqueueRestoreBackup,
    queue,
  };
}

export type BackupQueue = ReturnType<typeof createBackupQueue>;
