import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import { backgroundJobsTable } from '../database/schema/index.js';
import { CREATE_BACKUP_JOB, RESTORE_BACKUP_JOB, backupOperationJobId, createBackupQueue } from './backup.queue.js';
import { completeJob, createPostgresQueue, failJob, getScopedQueueName } from './postgres-jobs.js';

type DatabaseHandle = ReturnType<typeof setupDatabase>;

describe.sequential('postgres background jobs', () => {
  const uniquePrefix = `jobs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let database: DatabaseHandle | null = null;

  beforeAll(() => {
    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARKIVRA_PROCESS_ROLE: 'worker',
        ARKIVRA_ENCRYPTION_KEYS: process.env.ARKIVRA_ENCRYPTION_KEYS ?? `1:${'a'.repeat(64)}`,
        ARKIVRA_DOCLING_URL: process.env.ARKIVRA_DOCLING_URL ?? 'http://127.0.0.1:5001',
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
      },
    });

    database = setupDatabase({ config });
  });

  afterAll(async () => {
    if (database !== null) {
      await database.db.execute(sql`
        DELETE FROM background_jobs
        WHERE id LIKE ${`${uniquePrefix}%`}
           OR queue_name LIKE ${`${uniquePrefix}%`}
           OR id LIKE ${`${uniquePrefix}%:backup-operation-active`}
      `);
    }
    await database?.pool.end();
  });

  test('atomically coalesces concurrent deterministic job ids', async () => {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const queueName = `${uniquePrefix}:atomic`;
    const queue = createPostgresQueue<{ value: number }>({
      db: database.db,
      queueName,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 100 } },
    });
    const jobId = `${uniquePrefix}-job-atomic`;

    const jobs = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        queue.add('atomic-job', { value: index }, { jobId })),
    );

    expect(new Set(jobs.map(job => job.id))).toEqual(new Set([jobId]));

    const rows = await database.db
      .select()
      .from(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, jobId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('pending');

    const timingRows = await database.db.execute<{
      claimable: boolean;
      run_created_delta_seconds: string;
    }>(sql`
      SELECT
        run_at <= now() AS claimable,
        abs(extract(epoch from (run_at - created_at))) AS run_created_delta_seconds
      FROM background_jobs
      WHERE id = ${jobId}
    `);

    expect(timingRows.rows[0]?.claimable).toBe(true);
    expect(Number(timingRows.rows[0]?.run_created_delta_seconds)).toBeLessThan(5);
  });

  test('does not let a stale old worker complete over the current owner', async () => {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const queueName = `${uniquePrefix}:ownership-complete`;
    const queue = createPostgresQueue<Record<string, never>>({
      db: database.db,
      queueName,
      defaultJobOptions: { attempts: 2 },
    });
    const jobId = `${uniquePrefix}-job-complete`;
    await queue.add('ownership', {}, { jobId });
    await database.db
      .update(backgroundJobsTable)
      .set({
        status: 'running',
        attempts: 2,
        lockedBy: 'worker-b',
        lockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobsTable.id, jobId));

    const finalized = await completeJob({
      db: database.db,
      queueName,
      workerId: 'worker-a',
      result: { worker: 'a' },
      job: {
        id: jobId,
        queueName,
        name: 'ownership',
        data: {},
        status: 'running',
        progress: 0,
        attempts: 1,
        maxAttempts: 2,
        backoffType: null,
        backoffDelayMs: null,
        repeatPattern: null,
        runAt: new Date(),
        lockedBy: 'worker-a',
        lockedAt: new Date(Date.now() - 10_000),
        lastError: null,
        result: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const [whileWorkerBRunning] = await database.db
      .select({
        status: backgroundJobsTable.status,
        result: backgroundJobsTable.result,
        lockedBy: backgroundJobsTable.lockedBy,
      })
      .from(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, jobId));

    expect(finalized).toBe(false);
    expect(whileWorkerBRunning?.status).toBe('running');
    expect(whileWorkerBRunning?.result).toBeNull();
    expect(whileWorkerBRunning?.lockedBy).toBe('worker-b');

    const currentOwnerFinalized = await completeJob({
      db: database.db,
      queueName,
      workerId: 'worker-b',
      result: { worker: 'b' },
      job: {
        id: jobId,
        queueName,
        name: 'ownership',
        data: {},
        status: 'running',
        progress: 0,
        attempts: 2,
        maxAttempts: 2,
        backoffType: null,
        backoffDelayMs: null,
        repeatPattern: null,
        runAt: new Date(),
        lockedBy: 'worker-b',
        lockedAt: new Date(),
        lastError: null,
        result: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const [completed] = await database.db
      .select({
        status: backgroundJobsTable.status,
        result: backgroundJobsTable.result,
      })
      .from(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, jobId));

    expect(currentOwnerFinalized).toBe(true);
    expect(completed?.status).toBe('completed');
    expect(completed?.result).toEqual({ worker: 'b' });
  });

  test('does not let a stale old worker fail over the current owner', async () => {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const queueName = `${uniquePrefix}:ownership-fail`;
    const queue = createPostgresQueue<Record<string, never>>({
      db: database.db,
      queueName,
      defaultJobOptions: { attempts: 2 },
    });
    const jobId = `${uniquePrefix}-job-fail`;
    await queue.add('ownership', {}, { jobId });
    await database.db
      .update(backgroundJobsTable)
      .set({
        status: 'running',
        attempts: 2,
        lockedBy: 'worker-b',
        lockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobsTable.id, jobId));

    const finalized = await failJob({
      db: database.db,
      queueName,
      workerId: 'worker-a',
      errorMessage: 'stale failure',
      job: {
        id: jobId,
        queueName,
        name: 'ownership',
        data: {},
        status: 'running',
        progress: 0,
        attempts: 1,
        maxAttempts: 2,
        backoffType: null,
        backoffDelayMs: null,
        repeatPattern: null,
        runAt: new Date(),
        lockedBy: 'worker-a',
        lockedAt: new Date(Date.now() - 10_000),
        lastError: null,
        result: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const [whileWorkerBRunning] = await database.db
      .select({
        status: backgroundJobsTable.status,
        lastError: backgroundJobsTable.lastError,
      })
      .from(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, jobId));

    expect(finalized).toBe(false);
    expect(whileWorkerBRunning?.status).toBe('running');
    expect(whileWorkerBRunning?.lastError).toBeNull();

    const [stillOwned] = await database.db
      .select({
        status: backgroundJobsTable.status,
        lockedBy: backgroundJobsTable.lockedBy,
        lastError: backgroundJobsTable.lastError,
      })
      .from(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, jobId));

    expect(stillOwned?.status).toBe('running');
    expect(stillOwned?.lockedBy).toBe('worker-b');
    expect(stillOwned?.lastError).toBeNull();
  });

  test('coalesces active backup and restore operations without blocking later operations', async () => {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    await database.db
      .delete(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, backupOperationJobId(`${uniquePrefix}:backup`)));

    const appInstance = `${uniquePrefix}:backup`;
    const queueName = getScopedQueueName('backups', appInstance);
    const backupJobId = backupOperationJobId(appInstance);
    const backupQueue = createBackupQueue({ db: database.db, appInstance });

    const createResult = await backupQueue.enqueueCreateBackup();
    const secondCreateResult = await backupQueue.enqueueCreateBackup();
    const restoreWhilePendingResult = await backupQueue.enqueueRestoreBackup({
      backupId: 'arkivra-backup-a.manifest.json',
    });

    expect(createResult).toEqual({ jobId: backupJobId });
    expect(secondCreateResult).toEqual(createResult);
    expect(restoreWhilePendingResult).toEqual(createResult);

    let rows = await database.db
      .select()
      .from(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, backupJobId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.queueName).toBe(queueName);
    expect(rows[0]?.name).toBe(CREATE_BACKUP_JOB);
    expect(rows[0]?.status).toBe('pending');

    await database.db
      .update(backgroundJobsTable)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(backgroundJobsTable.id, backupJobId));

    const restoreAfterCompletedResult = await backupQueue.enqueueRestoreBackup({
      backupId: 'arkivra-backup-b.manifest.json',
    });
    const duplicateRestoreResult = await backupQueue.enqueueRestoreBackup({
      backupId: 'arkivra-backup-b.manifest.json',
    });
    const createWhileRestorePendingResult = await backupQueue.enqueueCreateBackup();

    expect(restoreAfterCompletedResult).toEqual({ jobId: backupJobId });
    expect(duplicateRestoreResult).toEqual({ jobId: backupJobId });
    expect(createWhileRestorePendingResult).toEqual({ jobId: backupJobId });

    rows = await database.db
      .select()
      .from(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, backupJobId));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe(RESTORE_BACKUP_JOB);
    expect(rows[0]?.payload).toEqual({ backupId: 'arkivra-backup-b.manifest.json' });
    expect(rows[0]?.status).toBe('pending');

    await database.db
      .update(backgroundJobsTable)
      .set({ status: 'running', lockedBy: 'test-worker', lockedAt: new Date(), updatedAt: new Date() })
      .where(eq(backgroundJobsTable.id, backupJobId));

    const restoreWhileRunningResult = await backupQueue.enqueueRestoreBackup({
      backupId: 'arkivra-backup-c.manifest.json',
    });

    expect(restoreWhileRunningResult).toEqual({ jobId: backupJobId });

    rows = await database.db
      .select()
      .from(backgroundJobsTable)
      .where(eq(backgroundJobsTable.id, backupJobId));

    expect(rows[0]?.name).toBe(RESTORE_BACKUP_JOB);
    expect(rows[0]?.payload).toEqual({ backupId: 'arkivra-backup-b.manifest.json' });
    expect(rows[0]?.status).toBe('running');
  });
});
