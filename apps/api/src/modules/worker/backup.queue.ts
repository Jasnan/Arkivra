import type { Redis } from 'ioredis';
import { Queue } from 'bullmq';

export const BACKUP_QUEUE = 'backups';
export const CREATE_BACKUP_JOB = 'create-backup';
export const RESTORE_BACKUP_JOB = 'restore-backup';

export type CreateBackupJobData = Record<string, never>;

export type RestoreBackupJobData = {
  backupId: string;
};

export function createBackupQueue({ connection }: { connection: Redis }) {
  const queue = new Queue<CreateBackupJobData | RestoreBackupJobData>(BACKUP_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
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
