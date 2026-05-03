import type { Database } from '../database/database.js';
import { createPostgresQueue } from './postgres-jobs.js';

export const BACKUP_QUEUE = 'backups';
export const CREATE_BACKUP_JOB = 'create-backup';
export const RESTORE_BACKUP_JOB = 'restore-backup';

export type CreateBackupJobData = Record<string, never>;

export type RestoreBackupJobData = {
  backupId: string;
};

export function createBackupQueue({ db }: { db: Database }) {
  const queue = createPostgresQueue<CreateBackupJobData | RestoreBackupJobData>({
    db,
    queueName: BACKUP_QUEUE,
    defaultJobOptions: {
      attempts: 1,
    },
  });

  async function enqueueCreateBackup() {
    const job = await queue.add(CREATE_BACKUP_JOB, {});
    return { jobId: String(job.id) };
  }

  async function enqueueRestoreBackup({ backupId }: { backupId: string }) {
    const job = await queue.add(RESTORE_BACKUP_JOB, { backupId });
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
