ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info' NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_category_occurred_idx
  ON public.audit_events USING btree (event_category, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_severity_occurred_idx
  ON public.audit_events USING btree (severity, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.activity_events (
  id text PRIMARY KEY,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  occurred_at timestamp without time zone DEFAULT now() NOT NULL,
  activity_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  vault_id text,
  document_id text,
  actor_id text,
  actor_type text DEFAULT 'unknown' NOT NULL,
  actor_display_name text,
  target_type text,
  target_id text,
  target_display_name text,
  source text DEFAULT 'api' NOT NULL,
  visibility text DEFAULT 'vault_members' NOT NULL,
  metadata_json jsonb,
  audit_event_id text,
  schema_version integer DEFAULT 1 NOT NULL
);

CREATE INDEX IF NOT EXISTS activity_events_vault_occurred_idx
  ON public.activity_events USING btree (vault_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_document_occurred_idx
  ON public.activity_events USING btree (document_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_actor_occurred_idx
  ON public.activity_events USING btree (actor_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_type_occurred_idx
  ON public.activity_events USING btree (activity_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_entity_occurred_idx
  ON public.activity_events USING btree (entity_type, entity_id, occurred_at DESC);
