import { beforeEach, describe, expect, test, vi } from 'vitest';

const queueAdd = vi.fn();

vi.mock('./postgres-jobs.js', () => ({
  createPostgresQueue: () => ({
    add: queueAdd,
    close: vi.fn(),
  }),
  getScopedQueueName: (queueName: string) => queueName,
}));

describe('maintenance queue', () => {
  beforeEach(() => {
    queueAdd.mockReset();
  });

  test('enqueues a hard-delete-expired-documents job', async () => {
    const { createMaintenanceQueue, HARD_DELETE_EXPIRED_DOCUMENTS_JOB } =
      await import('./maintenance.queue.js');

    const queue = createMaintenanceQueue({ db: {} as never });
    await queue.enqueueHardDeleteExpiredDocuments({ retentionDays: 7 });

    expect(queueAdd).toHaveBeenCalledWith(HARD_DELETE_EXPIRED_DOCUMENTS_JOB, { retentionDays: 7 });
  });

  test('schedules the daily hard-delete-expired-documents job', async () => {
    const { createMaintenanceQueue, HARD_DELETE_EXPIRED_DOCUMENTS_JOB } =
      await import('./maintenance.queue.js');

    const queue = createMaintenanceQueue({ db: {} as never });
    await queue.scheduleHardDeleteExpiredDocuments({
      cronPattern: '0 3 * * *',
      retentionDays: 30,
    });

    expect(queueAdd).toHaveBeenCalledWith(
      HARD_DELETE_EXPIRED_DOCUMENTS_JOB,
      { retentionDays: 30 },
      {
        jobId: 'hard-delete-expired-documents-daily',
        repeat: {
          pattern: '0 3 * * *',
        },
      },
    );
  });
});
