ALTER TABLE public.documents
  ADD CONSTRAINT documents_id_vault_unique UNIQUE (id, vault_id);

CREATE TABLE public.document_versions (
  id text PRIMARY KEY,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  document_id text NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  vault_id text NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  uploaded_by text REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at timestamp without time zone NOT NULL DEFAULT now(),
  original_name text NOT NULL,
  original_size integer NOT NULL DEFAULT 0,
  original_storage_key text NOT NULL,
  original_sha256_hash text NOT NULL,
  mime_type text NOT NULL,
  content text NOT NULL DEFAULT '',
  raw_text text NOT NULL DEFAULT '',
  raw_markdown text NOT NULL DEFAULT '',
  parser_structured_output jsonb,
  language_metadata jsonb,
  parser_engine text,
  parser_engine_version text,
  parser_warnings jsonb,
  processing_status text NOT NULL DEFAULT 'pending',
  file_encryption_key_wrapped text,
  file_encryption_kek_version text,
  file_encryption_algorithm text,
  restored_from_version_id text REFERENCES public.document_versions(id) ON DELETE SET NULL,
  deleted_at timestamp without time zone,
  deleted_by text REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT document_versions_document_number_unique UNIQUE (document_id, version_number),
  CONSTRAINT document_versions_id_document_vault_unique UNIQUE (id, document_id, vault_id),
  CONSTRAINT document_versions_document_vault_fkey
    FOREIGN KEY (document_id, vault_id)
    REFERENCES public.documents(id, vault_id)
    ON DELETE CASCADE,
  CONSTRAINT document_versions_version_number_positive CHECK (version_number > 0)
);

CREATE INDEX document_versions_vault_document_number_idx
  ON public.document_versions (vault_id, document_id, version_number DESC);

CREATE INDEX document_versions_vault_status_uploaded_idx
  ON public.document_versions (vault_id, processing_status, uploaded_at);

CREATE INDEX document_versions_vault_hash_idx
  ON public.document_versions (vault_id, original_sha256_hash);

CREATE INDEX document_versions_kek_version_idx
  ON public.document_versions (file_encryption_kek_version);

CREATE INDEX document_versions_deleted_idx
  ON public.document_versions (deleted_at);

ALTER TABLE public.documents
  ADD COLUMN current_version_id text;

INSERT INTO public.document_versions (
  id,
  created_at,
  updated_at,
  document_id,
  vault_id,
  version_number,
  uploaded_by,
  uploaded_at,
  original_name,
  original_size,
  original_storage_key,
  original_sha256_hash,
  mime_type,
  content,
  raw_text,
  raw_markdown,
  parser_structured_output,
  language_metadata,
  parser_engine,
  parser_engine_version,
  parser_warnings,
  processing_status,
  file_encryption_key_wrapped,
  file_encryption_kek_version,
  file_encryption_algorithm
)
SELECT
  'dvr_' || substr(md5(d.id), 1, 24),
  d.created_at,
  d.updated_at,
  d.id,
  d.vault_id,
  1,
  d.created_by,
  d.created_at,
  d.original_name,
  d.original_size,
  d.original_storage_key,
  d.original_sha256_hash,
  d.mime_type,
  d.content,
  d.raw_text,
  d.raw_markdown,
  d.parser_structured_output,
  d.language_metadata,
  d.parser_engine,
  d.parser_engine_version,
  d.parser_warnings,
  d.processing_status,
  d.file_encryption_key_wrapped,
  d.file_encryption_kek_version,
  d.file_encryption_algorithm
FROM public.documents AS d;

UPDATE public.documents AS d
SET current_version_id = dv.id
FROM public.document_versions AS dv
WHERE dv.document_id = d.id
  AND dv.version_number = 1;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_current_version_ownership_fkey
  FOREIGN KEY (current_version_id, id, vault_id)
  REFERENCES public.document_versions(id, document_id, vault_id);

CREATE INDEX documents_current_version_idx
  ON public.documents (current_version_id);

ALTER TABLE public.document_chunks
  ADD COLUMN document_version_id text,
  ADD COLUMN content_sha256 text;

UPDATE public.document_chunks AS dc
SET document_version_id = dv.id
FROM public.document_versions AS dv
WHERE dv.document_id = dc.document_id
  AND dv.version_number = 1;

ALTER TABLE public.document_chunks
  ALTER COLUMN document_version_id SET NOT NULL,
  ADD CONSTRAINT document_chunks_document_version_id_fkey
  FOREIGN KEY (document_version_id)
  REFERENCES public.document_versions(id)
  ON DELETE CASCADE;

ALTER TABLE public.document_chunks
  DROP CONSTRAINT IF EXISTS document_chunks_doc_index_unique,
  ADD CONSTRAINT document_chunks_version_index_unique UNIQUE (document_version_id, chunk_index),
  ADD CONSTRAINT document_chunks_version_document_vault_fkey
  FOREIGN KEY (document_version_id, document_id, vault_id)
  REFERENCES public.document_versions(id, document_id, vault_id)
  ON DELETE CASCADE;

CREATE INDEX document_chunks_vault_version_idx
  ON public.document_chunks (vault_id, document_version_id);

CREATE INDEX document_chunks_version_page_idx
  ON public.document_chunks (document_version_id, page_start, page_end);

ALTER TABLE public.document_chunk_assets
  ADD COLUMN document_version_id text;

UPDATE public.document_chunk_assets AS dca
SET document_version_id = dc.document_version_id
FROM public.document_chunks AS dc
WHERE dc.id = dca.chunk_id;

ALTER TABLE public.document_chunk_assets
  ALTER COLUMN document_version_id SET NOT NULL,
  ADD CONSTRAINT document_chunk_assets_document_version_id_fkey
  FOREIGN KEY (document_version_id)
  REFERENCES public.document_versions(id)
  ON DELETE CASCADE;

ALTER TABLE public.document_chunk_assets
  ADD CONSTRAINT document_chunk_assets_version_document_vault_fkey
  FOREIGN KEY (document_version_id, document_id, vault_id)
  REFERENCES public.document_versions(id, document_id, vault_id)
  ON DELETE CASCADE;

CREATE INDEX document_chunk_assets_vault_version_idx
  ON public.document_chunk_assets (vault_id, document_version_id);

ALTER TABLE public.document_chunk_embeddings
  ADD COLUMN document_version_id text;

UPDATE public.document_chunk_embeddings AS dce
SET document_version_id = dc.document_version_id
FROM public.document_chunks AS dc
WHERE dc.id = dce.chunk_id;

ALTER TABLE public.document_chunk_embeddings
  ALTER COLUMN document_version_id SET NOT NULL,
  ADD CONSTRAINT document_chunk_embeddings_document_version_id_fkey
  FOREIGN KEY (document_version_id)
  REFERENCES public.document_versions(id)
  ON DELETE CASCADE;

ALTER TABLE public.document_chunk_embeddings
  ADD CONSTRAINT document_chunk_embeddings_version_document_vault_fkey
  FOREIGN KEY (document_version_id, document_id, vault_id)
  REFERENCES public.document_versions(id, document_id, vault_id)
  ON DELETE CASCADE;

CREATE INDEX document_chunk_embeddings_index_version_idx
  ON public.document_chunk_embeddings (embedding_index_id, document_version_id);

CREATE INDEX document_chunk_embeddings_index_doc_version_idx
  ON public.document_chunk_embeddings (embedding_index_id, document_id, document_version_id);

ALTER TABLE public.document_embedding_index_status
  ADD COLUMN document_version_id text;

UPDATE public.document_embedding_index_status AS deis
SET document_version_id = dv.id
FROM public.document_versions AS dv
WHERE dv.document_id = deis.document_id
  AND dv.version_number = 1;

ALTER TABLE public.document_embedding_index_status
  ALTER COLUMN document_version_id SET NOT NULL,
  ADD CONSTRAINT document_embedding_index_status_document_version_id_fkey
  FOREIGN KEY (document_version_id)
  REFERENCES public.document_versions(id)
  ON DELETE CASCADE;

ALTER TABLE public.document_embedding_index_status
  ADD CONSTRAINT document_embedding_index_status_version_document_vault_fkey
  FOREIGN KEY (document_version_id, document_id, vault_id)
  REFERENCES public.document_versions(id, document_id, vault_id)
  ON DELETE CASCADE;

ALTER TABLE public.document_embedding_index_status
  DROP CONSTRAINT IF EXISTS document_embedding_index_status_pkey,
  ADD CONSTRAINT document_embedding_index_status_pkey
  PRIMARY KEY (embedding_index_id, document_version_id);

CREATE INDEX document_embedding_index_status_doc_version_idx
  ON public.document_embedding_index_status (embedding_index_id, document_id, document_version_id);

ALTER TABLE public.upload_sessions
  ADD COLUMN document_version_id text;

UPDATE public.upload_sessions AS us
SET document_version_id = dv.id
FROM public.document_versions AS dv
WHERE dv.document_id = us.document_id
  AND dv.version_number = 1;

ALTER TABLE public.upload_sessions
  ADD CONSTRAINT upload_sessions_document_version_id_fkey
  FOREIGN KEY (document_version_id)
  REFERENCES public.document_versions(id)
  ON DELETE SET NULL;

CREATE INDEX upload_sessions_document_version_idx
  ON public.upload_sessions (document_version_id);

ALTER TABLE public.chat_conversations
  ADD COLUMN context_frozen_at timestamp without time zone;

UPDATE public.chat_conversations AS cc
SET context_frozen_at = first_message.first_message_at
FROM (
  SELECT conversation_id, min(created_at) AS first_message_at
  FROM public.chat_messages
  GROUP BY conversation_id
) AS first_message
WHERE first_message.conversation_id = cc.id;

ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_document_id_fkey,
  ADD CONSTRAINT chat_conversations_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE SET NULL;

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_document_id_fkey,
  ADD CONSTRAINT chat_messages_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE SET NULL;

CREATE TABLE public.chat_conversation_document_versions (
  conversation_id text NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  vault_id text NOT NULL,
  document_id text NOT NULL,
  document_version_id text REFERENCES public.document_versions(id) ON DELETE SET NULL,
  included_by text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_conversation_document_versions_unique UNIQUE (conversation_id, document_version_id)
);

CREATE INDEX chat_conversation_document_versions_conversation_idx
  ON public.chat_conversation_document_versions (conversation_id);

CREATE INDEX chat_conversation_document_versions_vault_conversation_idx
  ON public.chat_conversation_document_versions (vault_id, conversation_id);

CREATE INDEX chat_conversation_document_versions_version_idx
  ON public.chat_conversation_document_versions (document_version_id);

INSERT INTO public.chat_conversation_document_versions (
  conversation_id,
  vault_id,
  document_id,
  document_version_id,
  included_by,
  created_at
)
SELECT
  cc.id,
  d.vault_id,
  d.id,
  d.current_version_id,
  'document',
  cc.context_frozen_at
FROM public.chat_conversations AS cc
JOIN public.documents AS d ON d.id = cc.document_id
JOIN public.document_versions AS dv ON dv.id = d.current_version_id
WHERE cc.context_frozen_at IS NOT NULL
  AND cc.scope = 'document'
  AND d.is_deleted = false
  AND dv.processing_status = 'completed'
  AND d.current_version_id IS NOT NULL;

INSERT INTO public.chat_conversation_document_versions (
  conversation_id,
  vault_id,
  document_id,
  document_version_id,
  included_by,
  created_at
)
SELECT
  cc.id,
  d.vault_id,
  d.id,
  d.current_version_id,
  'vault',
  cc.context_frozen_at
FROM public.chat_conversations AS cc
JOIN public.documents AS d ON d.vault_id = cc.vault_id
JOIN public.document_versions AS dv ON dv.id = d.current_version_id
WHERE cc.context_frozen_at IS NOT NULL
  AND cc.scope = 'vault'
  AND d.is_deleted = false
  AND dv.processing_status = 'completed'
  AND d.current_version_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_conversation_document_versions (
  conversation_id,
  vault_id,
  document_id,
  document_version_id,
  included_by,
  created_at
)
SELECT
  cc.id,
  d.vault_id,
  d.id,
  d.current_version_id,
  'vault',
  cc.context_frozen_at
FROM public.chat_conversations AS cc
JOIN LATERAL jsonb_array_elements_text(
  COALESCE(cc.context_snapshot->'vaultIds', '[]'::jsonb)
) AS snapshot_vault(vault_id) ON true
JOIN public.vault_members AS vm
  ON vm.user_id = cc.user_id
  AND vm.vault_id = snapshot_vault.vault_id
  AND vm.ai_access_level = 'full'
JOIN public.documents AS d ON d.vault_id = snapshot_vault.vault_id
JOIN public.document_versions AS dv ON dv.id = d.current_version_id
WHERE cc.context_frozen_at IS NOT NULL
  AND cc.scope = 'global'
  AND d.is_deleted = false
  AND dv.processing_status = 'completed'
  AND d.current_version_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_conversation_document_versions (
  conversation_id,
  vault_id,
  document_id,
  document_version_id,
  included_by,
  created_at
)
SELECT
  cc.id,
  d.vault_id,
  d.id,
  d.current_version_id,
  'selection',
  cc.context_frozen_at
FROM public.chat_conversations AS cc
JOIN LATERAL jsonb_array_elements(
  COALESCE(cc.context_snapshot->'vaults', '[]'::jsonb)
) AS selected_vault(ref) ON true
JOIN public.vault_members AS vm
  ON vm.user_id = cc.user_id
  AND vm.vault_id = selected_vault.ref->>'vaultId'
  AND vm.ai_access_level = 'full'
JOIN public.documents AS d ON d.vault_id = selected_vault.ref->>'vaultId'
JOIN public.document_versions AS dv ON dv.id = d.current_version_id
WHERE cc.context_frozen_at IS NOT NULL
  AND cc.context_snapshot->>'type' = 'selection'
  AND d.is_deleted = false
  AND dv.processing_status = 'completed'
  AND d.current_version_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_conversation_document_versions (
  conversation_id,
  vault_id,
  document_id,
  document_version_id,
  included_by,
  created_at
)
SELECT
  cc.id,
  d.vault_id,
  d.id,
  d.current_version_id,
  'selection',
  cc.context_frozen_at
FROM public.chat_conversations AS cc
JOIN LATERAL jsonb_array_elements(
  COALESCE(cc.context_snapshot->'documents', '[]'::jsonb)
) AS selected_document(ref) ON true
JOIN public.vault_members AS vm
  ON vm.user_id = cc.user_id
  AND vm.vault_id = selected_document.ref->>'vaultId'
  AND vm.ai_access_level = 'full'
JOIN public.documents AS d
  ON d.id = selected_document.ref->>'documentId'
  AND d.vault_id = selected_document.ref->>'vaultId'
JOIN public.document_versions AS dv ON dv.id = d.current_version_id
WHERE cc.context_frozen_at IS NOT NULL
  AND cc.context_snapshot->>'type' = 'selection'
  AND d.is_deleted = false
  AND dv.processing_status = 'completed'
  AND d.current_version_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE public.chat_message_citations (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id text NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  vault_id text NOT NULL,
  document_id text NOT NULL,
  document_version_id text REFERENCES public.document_versions(id) ON DELETE SET NULL,
  chunk_id text REFERENCES public.document_chunks(id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  page_start integer,
  page_end integer,
  citation_precision text,
  snippet text,
  locator_json jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX chat_message_citations_conversation_message_idx
  ON public.chat_message_citations (conversation_id, message_id);

CREATE INDEX chat_message_citations_version_idx
  ON public.chat_message_citations (document_version_id);

CREATE INDEX chat_message_citations_chunk_idx
  ON public.chat_message_citations (chunk_id);

CREATE INDEX chat_message_citations_document_version_idx
  ON public.chat_message_citations (document_id, document_version_id);
