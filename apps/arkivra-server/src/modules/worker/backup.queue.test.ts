import { beforeEach, describe, expect, test, vi } from 'vitest';

const queueAdd = vi.fn();

vi.mock('./postgres-jobs.js', () => ({
  createPostgresQueue: () => ({
    add: queueAdd,
    close: vi.fn(),
  }),
  getScopedQueueName: (queueName: string) => queueName,
}));

describe('backup queue', () => {
  beforeEach(() => {
    queueAdd.mockReset();
  });

  test('enqueues create-backup jobs', async () => {
    const { createBackupQueue, CREATE_BACKUP_JOB, BACKUP_OPERATION_JOB_ID } = await import('./backup.queue.js');

    queueAdd.mockResolvedValueOnce({ id: BACKUP_OPERATION_JOB_ID });

    const queue = createBackupQueue({ db: {} as never });
    const result = await queue.enqueueCreateBackup();

    expect(result).toEqual({ jobId: BACKUP_OPERATION_JOB_ID });
    expect(queueAdd).toHaveBeenCalledWith(CREATE_BACKUP_JOB, {}, { jobId: BACKUP_OPERATION_JOB_ID });
  });

  test('enqueues restore-backup jobs', async () => {
    const { createBackupQueue, RESTORE_BACKUP_JOB, BACKUP_OPERATION_JOB_ID } = await import('./backup.queue.js');

    queueAdd.mockResolvedValueOnce({ id: BACKUP_OPERATION_JOB_ID });

    const queue = createBackupQueue({ db: {} as never });
    const result = await queue.enqueueRestoreBackup({ backupId: 'arkivra-backup-test.tar.gz' });

    expect(result).toEqual({ jobId: BACKUP_OPERATION_JOB_ID });
    expect(queueAdd).toHaveBeenCalledWith(
      RESTORE_BACKUP_JOB,
      { backupId: 'arkivra-backup-test.tar.gz' },
      { jobId: BACKUP_OPERATION_JOB_ID },
    );
  });
});
