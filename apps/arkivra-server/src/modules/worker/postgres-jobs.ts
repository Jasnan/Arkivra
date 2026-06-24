import { EventEmitter } from 'node:events';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { backgroundJobsTable } from '../database/schema/index.js';
import { generateId } from '../database/schema/helpers.js';
import { getNextCronRun } from './postgres-cron.js';

export { getNextCronRun } from './postgres-cron.js';

type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
type BackoffType = 'exponential' | 'fixed';
type CountableState = 'active' | 'waiting' | 'delayed' | 'prioritized' | 'completed' | 'failed';

type JobRow<TData> = {
  id: string;
  queue_name: string;
  name: string;
  payload: TData;
  status: JobStatus;
  progress: number;
  attempts: number;
  max_attempts: number;
  backoff_type: BackoffType | null;
  backoff_delay_ms: number | null;
  repeat_pattern: string | null;
  run_at: Date | string;
  locked_by: string | null;
  locked_at: Date | string | null;
  last_error: string | null;
  result: Record<string, unknown> | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type QueueDefaultJobOptions = {
  attempts?: number;
  backoff?: {
    type: BackoffType;
    delay: number;
  };
};

type QueueAddOptions = {
  jobId?: string;
  repeat?: {
    pattern: string;
  };
};

function toDate(value: Date | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function mapRow<TData>(row: JobRow<TData>) {
  return {
    id: row.id,
    queueName: row.queue_name,
    name: row.name,
    data: row.payload,
    status: row.status,
    progress: row.progress,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    backoffType: row.backoff_type,
    backoffDelayMs: row.backoff_delay_ms,
    repeatPattern: row.repeat_pattern,
    runAt: toDate(row.run_at) ?? new Date(),
    lockedBy: row.locked_by,
    lockedAt: toDate(row.locked_at),
    lastError: row.last_error,
    result: row.result,
    completedAt: toDate(row.completed_at),
    createdAt: toDate(row.created_at) ?? new Date(),
    updatedAt: toDate(row.updated_at) ?? new Date(),
  };
}

function getRetryDelayMs({
  attempts,
  backoffType,
  backoffDelayMs,
}: {
  attempts: number;
  backoffType: BackoffType | null;
  backoffDelayMs: number | null;
}) {
  if (backoffDelayMs === null || backoffDelayMs <= 0) {
    return 0;
  }

  if (backoffType === 'exponential') {
    return backoffDelayMs * (2 ** Math.max(0, attempts - 1));
  }

  return backoffDelayMs;
}

export function getNextIdlePollIntervalMs({
  currentIntervalMs,
  activePollIntervalMs,
  maxIdlePollIntervalMs,
}: {
  currentIntervalMs: number;
  activePollIntervalMs: number;
  maxIdlePollIntervalMs: number;
}) {
  if (currentIntervalMs >= activePollIntervalMs * 4) {
    return maxIdlePollIntervalMs;
  }

  return Math.min(maxIdlePollIntervalMs, Math.max(activePollIntervalMs, currentIntervalMs * 2));
}

export function getScopedQueueName(queueName: string, appInstance?: string) {
  return appInstance === undefined ? queueName : `${appInstance}:${queueName}`;
}

export class AsyncJob<TData extends Record<string, unknown>> {
  #db: Database;
  #queueName: string;
  id: string;
  name: string;
  data: TData;
  attempts: number;
  maxAttempts: number;

  constructor({
    db,
    queueName,
    id,
    name,
    data,
    attempts = 0,
    maxAttempts = 1,
  }: {
    db: Database;
    queueName: string;
    id: string;
    name: string;
    data: TData;
    attempts?: number;
    maxAttempts?: number;
  }) {
    this.#db = db;
    this.#queueName = queueName;
    this.id = id;
    this.name = name;
    this.data = data;
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
  }

  async updateProgress(progress: number) {
    await this.#db
      .update(backgroundJobsTable)
      .set({
        progress,
        lockedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(and(
        eq(backgroundJobsTable.id, this.id),
        eq(backgroundJobsTable.queueName, this.#queueName),
      ));
  }

  async getState() {
    const [row] = await this.#db
      .select({
        status: backgroundJobsTable.status,
        runAt: backgroundJobsTable.runAt,
      })
      .from(backgroundJobsTable)
      .where(and(
        eq(backgroundJobsTable.id, this.id),
        eq(backgroundJobsTable.queueName, this.#queueName),
      ))
      .limit(1);

    if (row === undefined) {
      return 'unknown';
    }

    if (row.status === 'running') {
      return 'active';
    }

    if (row.status === 'completed') {
      return 'completed';
    }

    if (row.status === 'failed') {
      return 'failed';
    }

    return row.runAt.getTime() > Date.now() ? 'delayed' : 'waiting';
  }

  async remove() {
    await this.#db
      .delete(backgroundJobsTable)
      .where(and(
        eq(backgroundJobsTable.id, this.id),
        eq(backgroundJobsTable.queueName, this.#queueName),
      ));
  }
}

export function createPostgresQueue<TData extends Record<string, unknown>>({
  db,
  queueName,
  defaultJobOptions = {},
}: {
  db: Database;
  queueName: string;
  defaultJobOptions?: QueueDefaultJobOptions;
}) {
  async function loadJobRow(id: string) {
    const rows = await db.execute<JobRow<TData>>(sql`
      SELECT *
      FROM background_jobs
      WHERE id = ${id}
        AND queue_name = ${queueName}
      LIMIT 1
    `);

    return rows.rows[0] ? mapRow(rows.rows[0]) : null;
  }

  async function add(name: string, payload: TData, options: QueueAddOptions = {}) {
    const id = options.jobId ?? generateId({ prefix: 'job' });
    const repeatPattern = options.repeat?.pattern ?? null;
    const runAt = repeatPattern === null ? sql`now()` : getNextCronRun(repeatPattern, new Date());
    const maxAttempts = defaultJobOptions.attempts ?? 1;
    const backoffType = defaultJobOptions.backoff?.type ?? null;
    const backoffDelayMs = defaultJobOptions.backoff?.delay ?? null;

    if (options.jobId === undefined) {
      await db.insert(backgroundJobsTable).values({
        id,
        queueName,
        name,
        payload,
        status: 'pending',
        progress: 0,
        attempts: 0,
        maxAttempts,
        backoffType,
        backoffDelayMs,
        repeatPattern,
        runAt,
      });

      return new AsyncJob<TData>({ db, queueName, id, name, data: payload });
    }

    const upserted = await db.execute<JobRow<TData>>(sql`
      INSERT INTO background_jobs (
        id,
        queue_name,
        name,
        payload,
        status,
        progress,
        attempts,
        max_attempts,
        backoff_type,
        backoff_delay_ms,
        repeat_pattern,
        run_at
      )
      VALUES (
        ${id},
        ${queueName},
        ${name},
        ${JSON.stringify(payload)}::jsonb,
        'pending',
        0,
        0,
        ${maxAttempts},
        ${backoffType},
        ${backoffDelayMs},
        ${repeatPattern},
        ${runAt}
      )
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        payload = EXCLUDED.payload,
        status = 'pending',
        progress = 0,
        attempts = 0,
        max_attempts = EXCLUDED.max_attempts,
        backoff_type = EXCLUDED.backoff_type,
        backoff_delay_ms = EXCLUDED.backoff_delay_ms,
        repeat_pattern = EXCLUDED.repeat_pattern,
        run_at = EXCLUDED.run_at,
        locked_by = NULL,
        locked_at = NULL,
        last_error = NULL,
        result = NULL,
        completed_at = NULL,
        updated_at = now()
      WHERE background_jobs.queue_name = EXCLUDED.queue_name
        AND background_jobs.status NOT IN ('pending', 'running')
      RETURNING background_jobs.*
    `);

    const row = upserted.rows[0] ? mapRow(upserted.rows[0]) : await loadJobRow(id);

    if (row === null) {
      throw new Error(`Job id ${id} already exists in another queue.`);
    }

    return new AsyncJob<TData>({
      db,
      queueName,
      id: row.id,
      name: row.name,
      data: row.data,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
    });
  }

  async function getJob(id: string) {
    const row = await loadJobRow(id);
    return row === null
      ? undefined
      : new AsyncJob<TData>({ db, queueName, id: row.id, name: row.name, data: row.data });
  }

  async function getJobCounts(...states: CountableState[]) {
    const counts = {
      active: 0,
      waiting: 0,
      delayed: 0,
      prioritized: 0,
      completed: 0,
      failed: 0,
    };

    for (const state of states) {
      if (state === 'prioritized') {
        counts.prioritized = 0;
        continue;
      }

      const query = state === 'active'
        ? sql`
            SELECT COUNT(*)::int AS count
            FROM background_jobs
            WHERE queue_name = ${queueName}
              AND status = 'running'
          `
        : state === 'waiting'
          ? sql`
              SELECT COUNT(*)::int AS count
              FROM background_jobs
              WHERE queue_name = ${queueName}
                AND status = 'pending'
                AND run_at <= now()
            `
          : state === 'delayed'
            ? sql`
                SELECT COUNT(*)::int AS count
                FROM background_jobs
                WHERE queue_name = ${queueName}
                  AND status = 'pending'
                  AND run_at > now()
              `
            : sql`
                SELECT COUNT(*)::int AS count
                FROM background_jobs
                WHERE queue_name = ${queueName}
                  AND status = ${state}
              `;

      const rows = await db.execute<{ count: number }>(query);
      counts[state] = rows.rows[0]?.count ?? 0;
    }

    return counts;
  }

  async function obliterate(_options?: { force?: boolean }) {
    await db
      .delete(backgroundJobsTable)
      .where(eq(backgroundJobsTable.queueName, queueName));
  }

  return {
    add,
    close: async () => {},
    getJob,
    getJobCounts,
    obliterate,
  };
}

async function claimNextJob<TData extends Record<string, unknown>>({
  db,
  queueName,
  workerId,
}: {
  db: Database;
  queueName: string;
  workerId: string;
}) {
  const rows = await db.execute<JobRow<TData>>(sql`
    WITH next_job AS (
      SELECT id
      FROM background_jobs
      WHERE queue_name = ${queueName}
        AND status = 'pending'
        AND run_at <= now()
      ORDER BY run_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE background_jobs AS jobs
    SET
      status = 'running',
      attempts = jobs.attempts + 1,
      locked_by = ${workerId},
      locked_at = now(),
      updated_at = now(),
      last_error = NULL
    FROM next_job
    WHERE jobs.id = next_job.id
    RETURNING jobs.*
  `);

  return rows.rows[0] ? mapRow(rows.rows[0]) : null;
}

async function releaseStaleJobs({
  db,
  queueName,
  staleBefore,
}: {
  db: Database;
  queueName: string;
  staleBefore: Date;
}) {
  await db.execute(sql`
    UPDATE background_jobs
    SET
      status = 'pending',
      locked_by = NULL,
      locked_at = NULL,
      run_at = now(),
      updated_at = now()
    WHERE queue_name = ${queueName}
      AND status = 'running'
      AND locked_at IS NOT NULL
      AND locked_at < ${staleBefore}
  `);
}

async function renewLock({
  db,
  queueName,
  jobId,
  workerId,
}: {
  db: Database;
  queueName: string;
  jobId: string;
  workerId: string;
}) {
  await db.execute(sql`
    UPDATE background_jobs
    SET
      locked_at = now(),
      updated_at = now()
    WHERE id = ${jobId}
      AND queue_name = ${queueName}
      AND status = 'running'
      AND locked_by = ${workerId}
  `);
}

export async function completeJob({
  db,
  queueName,
  job,
  result,
  workerId,
}: {
  db: Database;
  queueName: string;
  job: ReturnType<typeof mapRow<Record<string, unknown>>>;
  result?: Record<string, unknown>;
  workerId: string;
}) {
  if (job.repeatPattern !== null) {
    const rows = await db.execute<{ id: string }>(sql`
      UPDATE background_jobs
      SET
        status = 'pending',
        progress = 0,
        attempts = 0,
        run_at = ${getNextCronRun(job.repeatPattern, new Date())},
        locked_by = NULL,
        locked_at = NULL,
        last_error = NULL,
        result = ${result === undefined ? null : JSON.stringify(result)}::jsonb,
        completed_at = NULL,
        updated_at = now()
      WHERE id = ${job.id}
        AND queue_name = ${queueName}
        AND status = 'running'
        AND locked_by = ${workerId}
      RETURNING id
    `);

    return rows.rows.length > 0;
  }

  const rows = await db.execute<{ id: string }>(sql`
    UPDATE background_jobs
    SET
      status = 'completed',
      progress = 100,
      locked_by = NULL,
      locked_at = NULL,
      result = ${result === undefined ? null : JSON.stringify(result)}::jsonb,
      completed_at = now(),
      updated_at = now()
    WHERE id = ${job.id}
      AND queue_name = ${queueName}
      AND status = 'running'
      AND locked_by = ${workerId}
    RETURNING id
  `);

  return rows.rows.length > 0;
}

export async function failJob({
  db,
  queueName,
  job,
  errorMessage,
  workerId,
}: {
  db: Database;
  queueName: string;
  job: ReturnType<typeof mapRow<Record<string, unknown>>>;
  errorMessage: string;
  workerId: string;
}) {
  const retryDelayMs = getRetryDelayMs({
    attempts: job.attempts,
    backoffType: job.backoffType,
    backoffDelayMs: job.backoffDelayMs,
  });
  const shouldRetry = job.attempts < job.maxAttempts;

  if (shouldRetry) {
    const rows = await db.execute<{ id: string }>(sql`
      UPDATE background_jobs
      SET
        status = 'pending',
        progress = 0,
        locked_by = NULL,
        locked_at = NULL,
        last_error = ${errorMessage},
        run_at = ${retryDelayMs === 0 ? sql`now()` : new Date(Date.now() + retryDelayMs)},
        updated_at = now()
      WHERE id = ${job.id}
        AND queue_name = ${queueName}
        AND status = 'running'
        AND locked_by = ${workerId}
      RETURNING id
    `);

    return rows.rows.length > 0;
  }

  if (job.repeatPattern !== null) {
    const rows = await db.execute<{ id: string }>(sql`
      UPDATE background_jobs
      SET
        status = 'pending',
        progress = 0,
        attempts = 0,
        locked_by = NULL,
        locked_at = NULL,
        last_error = ${errorMessage},
        run_at = ${getNextCronRun(job.repeatPattern, new Date())},
        updated_at = now()
      WHERE id = ${job.id}
        AND queue_name = ${queueName}
        AND status = 'running'
        AND locked_by = ${workerId}
      RETURNING id
    `);

    return rows.rows.length > 0;
  }

  const rows = await db.execute<{ id: string }>(sql`
    UPDATE background_jobs
    SET
      status = 'failed',
      locked_by = NULL,
      locked_at = NULL,
      last_error = ${errorMessage},
      completed_at = now(),
      updated_at = now()
    WHERE id = ${job.id}
      AND queue_name = ${queueName}
      AND status = 'running'
      AND locked_by = ${workerId}
    RETURNING id
  `);

  return rows.rows.length > 0;
}

export function createPostgresWorker<TData extends Record<string, unknown>>({
  db,
  queueName,
  concurrency,
  pollIntervalMs = 500,
  maxIdlePollIntervalMs = 5_000,
  heartbeatMs = 30_000,
  staleAfterMs = 5 * 60 * 1000,
  handler,
  autorun = true,
  pauseWhen,
}: {
  db: Database;
  queueName: string;
  concurrency: number;
  pollIntervalMs?: number;
  maxIdlePollIntervalMs?: number;
  heartbeatMs?: number;
  staleAfterMs?: number;
  handler: (job: AsyncJob<TData>) => Promise<Record<string, unknown> | void>;
  autorun?: boolean;
  pauseWhen?: () => Promise<boolean>;
}) {
  const emitter = new EventEmitter();
  const workerId = generateId({ prefix: `${queueName}-worker` });
  let closed = false;
  let started = false;
  const runners: Promise<void>[] = [];
  const pollWakeups = new Set<() => void>();

  function waitForNextPoll(ms: number) {
    if (closed) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let settled = false;
      let timeout: NodeJS.Timeout;
      const done = () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        pollWakeups.delete(done);
        resolve();
      };
      timeout = setTimeout(done, ms);
      pollWakeups.add(done);
    });
  }

  async function runLoop() {
    let lastRecoveryAt = 0;
    let idlePollIntervalMs = pollIntervalMs;

    while (true) {
      if (closed) {
        break;
      }

      if (pauseWhen !== undefined && await pauseWhen()) {
        await waitForNextPoll(pollIntervalMs);
        continue;
      }

      if (Date.now() - lastRecoveryAt >= staleAfterMs) {
        lastRecoveryAt = Date.now();
        await releaseStaleJobs({
          db,
          queueName,
          staleBefore: new Date(Date.now() - staleAfterMs),
        });
      }

      const claimed = await claimNextJob<TData>({
        db,
        queueName,
        workerId,
      });

      if (claimed === null) {
        await waitForNextPoll(idlePollIntervalMs);
        idlePollIntervalMs = getNextIdlePollIntervalMs({
          currentIntervalMs: idlePollIntervalMs,
          activePollIntervalMs: pollIntervalMs,
          maxIdlePollIntervalMs,
        });
        continue;
      }

      idlePollIntervalMs = pollIntervalMs;

      const job = new AsyncJob<TData>({
        db,
        queueName,
        id: claimed.id,
        name: claimed.name,
        data: claimed.data,
        attempts: claimed.attempts,
        maxAttempts: claimed.maxAttempts,
      });

      const heartbeat = setInterval(() => {
        void renewLock({
          db,
          queueName,
          jobId: claimed.id,
          workerId,
        });
      }, heartbeatMs);

      try {
        const result = await handler(job);
        clearInterval(heartbeat);
        const finalized = await completeJob({
          db,
          queueName,
          job: claimed,
          result: result && typeof result === 'object' ? result : undefined,
          workerId,
        });
        if (finalized) {
          emitter.emit('completed', job);
        } else {
          console.warn(
            `[postgres-jobs] skipped completion for job ${claimed.id} on ${queueName}; worker no longer owns the lock`,
          );
        }
      } catch (error) {
        clearInterval(heartbeat);
        const message = error instanceof Error ? error.message : 'Unknown job failure';
        const finalized = await failJob({
          db,
          queueName,
          job: claimed,
          errorMessage: message,
          workerId,
        });
        if (finalized) {
          emitter.emit('failed', job, error instanceof Error ? error : new Error(message));
        } else {
          console.warn(
            `[postgres-jobs] skipped failure for job ${claimed.id} on ${queueName}; worker no longer owns the lock`,
          );
        }
      }
    }
  }

  function start() {
    if (started) {
      return;
    }

    started = true;
    for (let index = 0; index < concurrency; index += 1) {
      runners.push(runLoop());
    }
  }

  if (autorun) {
    start();
  }

  return {
    on: emitter.on.bind(emitter),
    start,
    async close() {
      closed = true;
      for (const wakePoll of pollWakeups) {
        wakePoll();
      }
      await Promise.all(runners);
    },
  };
}
