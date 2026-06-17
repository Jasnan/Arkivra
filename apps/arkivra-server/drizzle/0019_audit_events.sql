CREATE TABLE IF NOT EXISTS public.audit_events (
  id text PRIMARY KEY,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  occurred_at timestamp without time zone DEFAULT now() NOT NULL,
  event_type text NOT NULL,
  event_category text NOT NULL,
  outcome text NOT NULL,
  actor_id text,
  actor_type text DEFAULT 'unknown' NOT NULL,
  actor_display_name text,
  vault_id text,
  document_id text,
  target_type text,
  target_id text,
  target_display_name text,
  source text DEFAULT 'api' NOT NULL,
  ip_address text,
  user_agent text,
  request_id text,
  metadata_json jsonb,
  before_json jsonb,
  after_json jsonb,
  schema_version integer DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_events_vault_occurred_idx
  ON public.audit_events USING btree (vault_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_document_occurred_idx
  ON public.audit_events USING btree (document_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_actor_occurred_idx
  ON public.audit_events USING btree (actor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_type_occurred_idx
  ON public.audit_events USING btree (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_outcome_occurred_idx
  ON public.audit_events USING btree (outcome, occurred_at DESC);
