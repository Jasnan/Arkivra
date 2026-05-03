CREATE TABLE IF NOT EXISTS "background_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "queue_name" text NOT NULL,
  "name" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending',
  "progress" integer NOT NULL DEFAULT 0,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 1,
  "backoff_type" text,
  "backoff_delay_ms" integer,
  "repeat_pattern" text,
  "run_at" timestamp NOT NULL DEFAULT now(),
  "locked_by" text,
  "locked_at" timestamp,
  "last_error" text,
  "result" jsonb,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "background_jobs_queue_status_run_idx"
  ON "background_jobs" ("queue_name", "status", "run_at");

CREATE INDEX IF NOT EXISTS "background_jobs_status_run_idx"
  ON "background_jobs" ("status", "run_at");

CREATE INDEX IF NOT EXISTS "background_jobs_locked_at_idx"
  ON "background_jobs" ("locked_at");
