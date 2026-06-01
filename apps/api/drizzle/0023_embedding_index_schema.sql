CREATE TABLE public.ai_provider_configs (
  id text PRIMARY KEY,
  capability text NOT NULL,
  provider text NOT NULL,
  name text NOT NULL,
  base_url text,
  model text NOT NULL,
  dimensions integer,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  api_key_secret_ref text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_provider_configs_capability_check
    CHECK (capability IN ('chat', 'embedding')),
  CONSTRAINT ai_provider_configs_embedding_dimensions_check
    CHECK (capability <> 'embedding' OR dimensions IS NOT NULL)
);

CREATE INDEX ai_provider_configs_capability_enabled_idx
  ON public.ai_provider_configs (capability, is_enabled);

CREATE TABLE public.embedding_indexes (
  id text PRIMARY KEY,
  provider_config_id text NOT NULL REFERENCES public.ai_provider_configs(id),
  provider text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL,
  distance_metric text NOT NULL DEFAULT 'cosine',
  status text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  expected_chunk_count integer NOT NULL DEFAULT 0,
  embedded_chunk_count integer NOT NULL DEFAULT 0,
  failed_chunk_count integer NOT NULL DEFAULT 0,
  failure_message text,
  build_started_at timestamp without time zone,
  build_completed_at timestamp without time zone,
  activated_at timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT embedding_indexes_status_check
    CHECK (status IN ('building', 'ready', 'active', 'failed', 'retiring', 'retired')),
  CONSTRAINT embedding_indexes_dimensions_check
    CHECK (dimensions > 0),
  CONSTRAINT embedding_indexes_distance_metric_check
    CHECK (distance_metric IN ('cosine'))
);

CREATE UNIQUE INDEX embedding_indexes_single_active_idx
  ON public.embedding_indexes (is_active)
  WHERE is_active = true;

CREATE INDEX embedding_indexes_provider_config_idx
  ON public.embedding_indexes (provider_config_id);

CREATE TABLE public.document_chunk_embeddings (
  id text PRIMARY KEY,
  embedding_index_id text NOT NULL REFERENCES public.embedding_indexes(id) ON DELETE CASCADE,
  chunk_id text NOT NULL REFERENCES public.document_chunks(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  vault_id text NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  content_sha256 text NOT NULL,
  embedding public.vector NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT document_chunk_embeddings_index_chunk_unique
    UNIQUE (embedding_index_id, chunk_id)
);

CREATE INDEX document_chunk_embeddings_index_doc_idx
  ON public.document_chunk_embeddings (embedding_index_id, document_id);

CREATE INDEX document_chunk_embeddings_index_vault_idx
  ON public.document_chunk_embeddings (embedding_index_id, vault_id);

CREATE TABLE public.document_embedding_index_status (
  embedding_index_id text NOT NULL REFERENCES public.embedding_indexes(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  vault_id text NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  status text NOT NULL,
  expected_chunk_count integer NOT NULL DEFAULT 0,
  embedded_chunk_count integer NOT NULL DEFAULT 0,
  failure_message text,
  attempts integer NOT NULL DEFAULT 0,
  indexed_at timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (embedding_index_id, document_id),
  CONSTRAINT document_embedding_index_status_status_check
    CHECK (status IN ('pending', 'indexing', 'ready', 'failed', 'stale', 'skipped'))
);

CREATE INDEX document_embedding_index_status_vault_idx
  ON public.document_embedding_index_status (embedding_index_id, vault_id);

DROP INDEX IF EXISTS public.document_chunks_embedding_idx;

ALTER TABLE public.document_chunks
  DROP COLUMN IF EXISTS embedding;
