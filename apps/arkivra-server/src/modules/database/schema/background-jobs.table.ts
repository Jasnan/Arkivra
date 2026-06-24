import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const backgroundJobsTable = pgTable(
  'background_jobs',
  {
    id: text('id').primaryKey(),
    queueName: text('queue_name').notNull(),
    name: text('name').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('pending'),
    progress: integer('progress').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(1),
    backoffType: text('backoff_type'),
    backoffDelayMs: integer('backoff_delay_ms'),
    repeatPattern: text('repeat_pattern'),
    runAt: timestamp('run_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    lockedBy: text('locked_by'),
    lockedAt: timestamp('locked_at', { mode: 'date', withTimezone: true }),
    lastError: text('last_error'),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('background_jobs_queue_status_run_idx').on(table.queueName, table.status, table.runAt),
    index('background_jobs_status_run_idx').on(table.status, table.runAt),
    index('background_jobs_locked_at_idx').on(table.lockedAt),
  ],
);
