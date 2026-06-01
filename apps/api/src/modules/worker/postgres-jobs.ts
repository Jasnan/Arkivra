import { EventEmitter } from 'node:events';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { backgroundJobsTable } from '../database/schema/index.js';
import { generateId } from '../database/schema/helpers.js';

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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function addCronValues({
  values,
  start,
  end,
  token,
}: {
  values: Set<number>;
  start: number;
  end: number;
  token: string;
}) {
  const [base, stepRaw] = token.split('/');
  const step = stepRaw === undefined ? 1 : Number.parseInt(stepRaw, 10);

  if (!Number.isInteger(step) || step <= 0) {
    throw new Error(`Invalid cron step "${token}"`);
  }

  const normalizedBase = (base ?? '').trim();

  if (normalizedBase.length === 0) {
    throw new TypeError(`Invalid cron token "${token}"`);
  }
  let rangeStart = start;
  let rangeEnd = end;

  if (normalizedBase !== '*') {
    const [rangeStartRaw, rangeEndRaw] = normalizedBase.split('-');
    rangeStart = Number.parseInt(rangeStartRaw ?? '', 10);
    rangeEnd = rangeEndRaw === undefined ? rangeStart : Number.parseInt(rangeEndRaw, 10);

    if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd)) {
      throw new TypeError(`Invalid cron range "${token}"`);
    }
  }

  if (rangeStart < start || rangeEnd > end || rangeStart > rangeEnd) {
    throw new TypeError(`Cron range "${token}" is out of bounds`);
  }

  for (let value = rangeStart; value <= rangeEnd; value += step) {
    values.add(value === 7 && end === 7 ? 0 : value);
  }
}

function parseCronField(field: string, min: number, max: number) {
  const trimmed = field.trim();

  if (trimmed.length === 0) {
    throw new Error('Empty cron field');
  }

  if (trimmed === '*') {
    return { isWildcard: true, values: null as Set<number> | null };
  }

  const values = new Set<number>();
  for (const token of trimmed.split(',')) {
    addCronValues({
      values,
      start: min,
      end: max,
      token: token.trim(),
    });
  }

  return { isWildcard: false, values };
}

function createCronMatcher(pattern: string) {
  const parts = pattern.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Unsupported cron pattern "${pattern}"`);
  }

  const minute = parseCronField(parts[0] ?? '', 0, 59);
  const hour = parseCronField(parts[1] ?? '', 0, 23);
  const dayOfMonth = parseCronField(parts[2] ?? '', 1, 31);
  const month = parseCronField(parts[3] ?? '', 1, 12);
  const dayOfWeek = parseCronField(parts[4] ?? '', 0, 7);

  function includes(field: { isWildcard: boolean; values: Set<number> | null }, value: number) {
    return field.isWildcard || field.values?.has(value) === true;
  }

  return {
    matches(date: Date) {
      const minuteMatches = includes(minute, date.getMinutes());
      const hourMatches = includes(hour, date.getHours());
      const monthMatches = includes(month, date.getMonth() + 1);
      const dayOfMonthMatches = includes(dayOfMonth, date.getDate());
      const dayOfWeekMatches = includes(dayOfWeek, date.getDay());

      const dayMatches = dayOfMonth.isWildcard || dayOfWeek.isWildcard
        ? dayOfMonthMatches && dayOfWeekMatches
        : dayOfMonthMatches || dayOfWeekMatches;

      return minuteMatches && hourMatches && monthMatches && dayMatches;
    },
  };
}

export function getNextCronRun(pattern: string, after = new Date()) {
  const matcher = createCronMatcher(pattern);
  const candidate = new Date(after.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let index = 0; index < 60 * 24 * 366 * 5; index += 1) {
    if (matcher.matches(candidate)) {
      return new Date(candidate.getTime());
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`Could not find the next run for cron pattern "${pattern}"`);
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
        lockedAt: new Date(),
        updatedAt: new Date(),
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
    const runAt = repeatPattern === null ? new Date() : getNextCronRun(repeatPattern, new Date());
    const maxAttempts = defaultJobOptions.attempts ?? 1;
    const backoffType = defaultJobOptions.backoff?.type ?? null;
    const backoffDelayMs = defaultJobOptions.backoff?.delay ?? null;
    const existing = await loadJobRow(id);

    if (existing !== null && (existing.status === 'pending' || existing.status === 'running')) {
      return new AsyncJob<TData>({ db, queueName, id: existing.id, name: existing.name, data: existing.data });
    }

    if (existing !== null) {
      await db
        .update(backgroundJobsTable)
        .set({
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
          lockedBy: null,
          lockedAt: null,
          lastError: null,
          result: null,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(backgroundJobsTable.id, id),
          eq(backgroundJobsTable.queueName, queueName),
        ));

      return new AsyncJob<TData>({ db, queueName, id, name, data: payload });
    }

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

    const now = new Date();

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
                AND run_at <= ${now}
            `
          : state === 'delayed'
            ? sql`
                SELECT COUNT(*)::int AS count
                FROM background_jobs
                WHERE queue_name = ${queueName}
                  AND status = 'pending'
                  AND run_at > ${now}
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

async function completeJob({
  db,
  queueName,
  job,
  result,
}: {
  db: Database;
  queueName: string;
  job: ReturnType<typeof mapRow<Record<string, unknown>>>;
  result?: Record<string, unknown>;
}) {
  if (job.repeatPattern !== null) {
    await db
      .update(backgroundJobsTable)
      .set({
        status: 'pending',
        progress: 0,
        attempts: 0,
        runAt: getNextCronRun(job.repeatPattern, new Date()),
        lockedBy: null,
        lockedAt: null,
        lastError: null,
        result: result ?? null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(backgroundJobsTable.id, job.id),
        eq(backgroundJobsTable.queueName, queueName),
      ));

    return;
  }

  await db
    .update(backgroundJobsTable)
    .set({
      status: 'completed',
      progress: 100,
      lockedBy: null,
      lockedAt: null,
      result: result ?? null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(backgroundJobsTable.id, job.id),
      eq(backgroundJobsTable.queueName, queueName),
    ));
}

async function failJob({
  db,
  queueName,
  job,
  errorMessage,
}: {
  db: Database;
  queueName: string;
  job: ReturnType<typeof mapRow<Record<string, unknown>>>;
  errorMessage: string;
}) {
  const retryDelayMs = getRetryDelayMs({
    attempts: job.attempts,
    backoffType: job.backoffType,
    backoffDelayMs: job.backoffDelayMs,
  });
  const shouldRetry = job.attempts < job.maxAttempts;

  if (shouldRetry) {
    await db
      .update(backgroundJobsTable)
      .set({
        status: 'pending',
        progress: 0,
        lockedBy: null,
        lockedAt: null,
        lastError: errorMessage,
        runAt: new Date(Date.now() + retryDelayMs),
        updatedAt: new Date(),
      })
      .where(and(
        eq(backgroundJobsTable.id, job.id),
        eq(backgroundJobsTable.queueName, queueName),
      ));

    return;
  }

  if (job.repeatPattern !== null) {
    await db
      .update(backgroundJobsTable)
      .set({
        status: 'pending',
        progress: 0,
        attempts: 0,
        lockedBy: null,
        lockedAt: null,
        lastError: errorMessage,
        runAt: getNextCronRun(job.repeatPattern, new Date()),
        updatedAt: new Date(),
      })
      .where(and(
        eq(backgroundJobsTable.id, job.id),
        eq(backgroundJobsTable.queueName, queueName),
      ));

    return;
  }

  await db
    .update(backgroundJobsTable)
    .set({
      status: 'failed',
      lockedBy: null,
      lockedAt: null,
      lastError: errorMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(backgroundJobsTable.id, job.id),
      eq(backgroundJobsTable.queueName, queueName),
    ));
}

export function createPostgresWorker<TData extends Record<string, unknown>>({
  db,
  queueName,
  concurrency,
  pollIntervalMs = 500,
  heartbeatMs = 30_000,
  staleAfterMs = 5 * 60 * 1000,
  handler,
  autorun = true,
}: {
  db: Database;
  queueName: string;
  concurrency: number;
  pollIntervalMs?: number;
  heartbeatMs?: number;
  staleAfterMs?: number;
  handler: (job: AsyncJob<TData>) => Promise<Record<string, unknown> | void>;
  autorun?: boolean;
}) {
  const emitter = new EventEmitter();
  const workerId = generateId({ prefix: `${queueName}-worker` });
  let closed = false;
  let started = false;
  const runners: Promise<void>[] = [];

  async function runLoop() {
    let lastRecoveryAt = 0;

    while (true) {
      if (closed) {
        break;
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
        await sleep(pollIntervalMs);
        continue;
      }

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
        await completeJob({
          db,
          queueName,
          job: claimed,
          result: result && typeof result === 'object' ? result : undefined,
        });
        emitter.emit('completed', job);
      } catch (error) {
        clearInterval(heartbeat);
        const message = error instanceof Error ? error.message : 'Unknown job failure';
        await failJob({
          db,
          queueName,
          job: claimed,
          errorMessage: message,
        });
        emitter.emit('failed', job, error instanceof Error ? error : new Error(message));
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
      await Promise.all(runners);
    },
  };
}
