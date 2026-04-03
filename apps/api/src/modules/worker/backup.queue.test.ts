import { beforeEach, describe, expect, test, vi } from 'vitest';

const queueAdd = vi.fn();
const queueClose = vi.fn();

vi.mock('bullmq', () => ({
  Queue: class {
    add = queueAdd;
    close = queueClose;
  },
}));

describe('backup queue', () => {
  beforeEach(() => {
    queueAdd.mockReset();
    queueClose.mockReset();
  });

  test('enqueues create-backup jobs', async () => {
    const { createBackupQueue, CREATE_BACKUP_JOB } = await import('./backup.queue.js');

    queueAdd.mockResolvedValueOnce({ id: 'job_1' });

    const queue = createBackupQueue({ connection: {} as never });
    const result = await queue.enqueueCreateBackup();

    expect(result).toEqual({ jobId: 'job_1' });
    expect(queueAdd).toHaveBeenCalledWith(CREATE_BACKUP_JOB, {});
  });

  test('enqueues restore-backup jobs', async () => {
    const { createBackupQueue, RESTORE_BACKUP_JOB } = await import('./backup.queue.js');

    queueAdd.mockResolvedValueOnce({ id: 'job_2' });

    const queue = createBackupQueue({ connection: {} as never });
    const result = await queue.enqueueRestoreBackup({ backupId: 'arkivra-backup-test.tar.gz' });

    expect(result).toEqual({ jobId: 'job_2' });
    expect(queueAdd).toHaveBeenCalledWith(RESTORE_BACKUP_JOB, {
      backupId: 'arkivra-backup-test.tar.gz',
    });
  });
});
