-- Baseline schema migration generated from the live development database
-- Development-only reset on 2026-05-03
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE public.auth_accounts (
    id text NOT NULL,
    user_id text NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    access_token text,
    refresh_token text,
    access_token_expires_at timestamp without time zone,
    refresh_token_expires_at timestamp without time zone,
    scope text,
    id_token text,
    password text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.auth_sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.auth_two_factor (
    id text NOT NULL,
    user_id text NOT NULL,
    secret text NOT NULL,
    backup_codes text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.auth_verifications (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.background_jobs (
    id text NOT NULL,
    queue_name text NOT NULL,
    name text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 1 NOT NULL,
    backoff_type text,
    backoff_delay_ms integer,
    repeat_pattern text,
    run_at timestamp without time zone DEFAULT now() NOT NULL,
    locked_by text,
    locked_at timestamp without time zone,
    last_error text,
    result jsonb,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.chat_conversations (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    vault_id text,
    created_by text,
    title text DEFAULT 'New chat'::text NOT NULL,
    deleted_at timestamp without time zone,
    scope text DEFAULT 'vault'::text NOT NULL,
    document_id text
);

CREATE TABLE public.chat_messages (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    conversation_id text NOT NULL,
    vault_id text,
    created_by text,
    role text NOT NULL,
    content text NOT NULL,
    citations jsonb,
    generation_status text,
    generation_error text,
    scope text DEFAULT 'vault'::text NOT NULL,
    document_id text
);

CREATE TABLE public.document_chunk_assets (
    id text NOT NULL,
    chunk_id text NOT NULL,
    document_id text NOT NULL,
    vault_id text NOT NULL,
    asset_type text NOT NULL,
    mime_type text,
    storage_key text,
    inline_payload text,
    source_element_id text,
    page_number integer,
    bbox jsonb,
    byte_size integer,
    sha256_hash text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    file_encryption_key_wrapped text,
    file_encryption_kek_version text
);

CREATE TABLE public.document_chunks (
    id text NOT NULL,
    document_id text NOT NULL,
    vault_id text NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    page_number integer,
    chunk_type text,
    token_count integer,
    embedding public.vector(1024),
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, content)) STORED,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    chunk_key text NOT NULL,
    section text,
    section_path jsonb,
    parser_engine text,
    metadata jsonb,
    page_start integer,
    page_end integer,
    bounding_boxes jsonb,
    source_element_ids jsonb,
    parent_element_id text,
    original_text text,
    tables_html jsonb,
    citation_precision text DEFAULT 'document'::text NOT NULL
);

CREATE TABLE public.document_tags (
    document_id text NOT NULL,
    tag_id text NOT NULL
);

CREATE TABLE public.documents (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    vault_id text NOT NULL,
    created_by text,
    original_name text NOT NULL,
    original_size integer DEFAULT 0 NOT NULL,
    original_storage_key text NOT NULL,
    original_sha256_hash text NOT NULL,
    name text NOT NULL,
    mime_type text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    raw_text text DEFAULT ''::text NOT NULL,
    raw_markdown text DEFAULT ''::text NOT NULL,
    parser_structured_output jsonb,
    document_date timestamp without time zone,
    file_encryption_key_wrapped text,
    file_encryption_kek_version text,
    file_encryption_algorithm text,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp without time zone,
    deleted_by text,
    processing_status text DEFAULT 'pending'::text NOT NULL,
    parser_engine text,
    parser_engine_version text,
    parser_warnings jsonb
);

CREATE TABLE public.instance_settings (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    ai_normalization_enabled boolean DEFAULT false NOT NULL,
    ollama_host text DEFAULT 'http://127.0.0.1:11434'::text NOT NULL,
    ollama_model text DEFAULT 'gemma4:e4b'::text NOT NULL,
    ollama_glued_word_min_token_length integer DEFAULT 12 NOT NULL,
    ollama_glued_word_max_candidates integer DEFAULT 100 NOT NULL,
    ollama_glued_word_batch_size integer DEFAULT 10 NOT NULL,
    ai_summarisation_enabled boolean DEFAULT true NOT NULL,
    ollama_summarisation_model text DEFAULT 'gemma4:e4b'::text NOT NULL,
    ollama_summarisation_max_images_per_chunk integer DEFAULT 4 NOT NULL,
    ollama_embedding_enabled boolean DEFAULT true NOT NULL,
    ollama_embedding_model text DEFAULT 'bge-m3'::text NOT NULL,
    ollama_embedding_dimensions integer DEFAULT 1024 NOT NULL
);

CREATE TABLE public.tags (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    vault_id text NOT NULL,
    name text NOT NULL,
    color text,
    description text
);

CREATE TABLE public.upload_sessions (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    vault_id text NOT NULL,
    user_id text NOT NULL,
    document_id text,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    total_size integer NOT NULL,
    part_size integer NOT NULL,
    part_count integer NOT NULL,
    bytes_received integer DEFAULT 0 NOT NULL,
    uploaded_parts_json text DEFAULT '[]'::text NOT NULL,
    staging_key text NOT NULL,
    status text DEFAULT 'initialized'::text NOT NULL,
    error_code text,
    error_message text,
    expires_at timestamp without time zone,
    completed_at timestamp without time zone
);

CREATE TABLE public.user_global_roles (
    user_id text NOT NULL,
    role text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.users (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    name text,
    image text,
    two_factor_enabled boolean DEFAULT false NOT NULL,
    disabled_at timestamp without time zone
);

CREATE TABLE public.vault_member_permissions (
    vault_member_id text NOT NULL,
    permission text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vault_members (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    vault_id text NOT NULL,
    user_id text NOT NULL,
    role text NOT NULL
);

CREATE TABLE public.vaults (
    id text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    description text,
    deleted_at timestamp without time zone,
    deleted_by text
);

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_token_key UNIQUE (token);

ALTER TABLE ONLY public.auth_two_factor
    ADD CONSTRAINT auth_two_factor_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.auth_verifications
    ADD CONSTRAINT auth_verifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_chunk_assets
    ADD CONSTRAINT document_chunk_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_doc_index_unique UNIQUE (document_id, chunk_index);

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT document_tags_pkey PRIMARY KEY (document_id, tag_id);

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.instance_settings
    ADD CONSTRAINT instance_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_vault_name_unique UNIQUE (vault_id, name);

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_global_roles
    ADD CONSTRAINT user_global_roles_pk PRIMARY KEY (user_id, role);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vault_member_permissions
    ADD CONSTRAINT vault_member_permissions_pk PRIMARY KEY (vault_member_id, permission);

ALTER TABLE ONLY public.vault_members
    ADD CONSTRAINT vault_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.vault_members
    ADD CONSTRAINT vault_members_vault_user_unique UNIQUE (vault_id, user_id);

ALTER TABLE ONLY public.vaults
    ADD CONSTRAINT vaults_pkey PRIMARY KEY (id);

CREATE INDEX background_jobs_locked_at_idx ON public.background_jobs USING btree (locked_at);

CREATE INDEX background_jobs_queue_status_run_idx ON public.background_jobs USING btree (queue_name, status, run_at);

CREATE INDEX background_jobs_status_run_idx ON public.background_jobs USING btree (status, run_at);

CREATE INDEX chat_conversations_created_by_vault_idx ON public.chat_conversations USING btree (created_by, vault_id);

CREATE INDEX chat_conversations_document_created_idx ON public.chat_conversations USING btree (document_id, created_at);

CREATE INDEX chat_conversations_scope_created_idx ON public.chat_conversations USING btree (created_by, scope, created_at);

CREATE INDEX chat_conversations_vault_created_idx ON public.chat_conversations USING btree (vault_id, created_at);

CREATE INDEX chat_messages_conversation_created_idx ON public.chat_messages USING btree (conversation_id, created_at);

CREATE INDEX chat_messages_scope_created_idx ON public.chat_messages USING btree (created_by, scope, created_at);

CREATE INDEX chat_messages_vault_created_idx ON public.chat_messages USING btree (vault_id, created_at);

CREATE INDEX document_chunk_assets_chunk_idx ON public.document_chunk_assets USING btree (chunk_id);

CREATE INDEX document_chunk_assets_vault_doc_idx ON public.document_chunk_assets USING btree (vault_id, document_id);

CREATE INDEX document_chunks_embedding_idx ON public.document_chunks USING hnsw (embedding public.vector_cosine_ops);

CREATE INDEX document_chunks_fts_idx ON public.document_chunks USING gin (tsv);

CREATE INDEX document_chunks_page_idx ON public.document_chunks USING btree (document_id, page_start, page_end);

CREATE INDEX document_chunks_vault_doc_idx ON public.document_chunks USING btree (vault_id, document_id);

CREATE INDEX documents_hash_idx ON public.documents USING btree (original_sha256_hash);

CREATE INDEX documents_kek_version_idx ON public.documents USING btree (file_encryption_kek_version);

CREATE INDEX documents_parser_engine_idx ON public.documents USING btree (parser_engine);

CREATE INDEX documents_processing_status_idx ON public.documents USING btree (processing_status);

CREATE INDEX documents_vault_deleted_created_idx ON public.documents USING btree (vault_id, is_deleted, created_at);

CREATE INDEX documents_vault_deleted_idx ON public.documents USING btree (vault_id, is_deleted);

CREATE UNIQUE INDEX documents_vault_hash_unique ON public.documents USING btree (vault_id, original_sha256_hash) WHERE (is_deleted = false);

CREATE INDEX upload_sessions_document_idx ON public.upload_sessions USING btree (document_id);

CREATE INDEX upload_sessions_status_idx ON public.upload_sessions USING btree (status);

CREATE INDEX upload_sessions_vault_user_idx ON public.upload_sessions USING btree (vault_id, user_id);

CREATE INDEX user_global_roles_role_idx ON public.user_global_roles USING btree (role);

CREATE INDEX users_disabled_at_idx ON public.users USING btree (disabled_at);

CREATE INDEX users_email_idx ON public.users USING btree (email);

CREATE INDEX vault_member_permissions_permission_idx ON public.vault_member_permissions USING btree (permission);

CREATE INDEX vault_members_user_id_idx ON public.vault_members USING btree (user_id);

CREATE INDEX vaults_deleted_at_idx ON public.vaults USING btree (deleted_at);

ALTER TABLE ONLY public.auth_accounts
    ADD CONSTRAINT auth_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.auth_two_factor
    ADD CONSTRAINT auth_two_factor_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_chunk_assets
    ADD CONSTRAINT document_chunk_assets_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.document_chunks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_chunk_assets
    ADD CONSTRAINT document_chunk_assets_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_chunk_assets
    ADD CONSTRAINT document_chunk_assets_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT document_tags_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.document_tags
    ADD CONSTRAINT document_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_global_roles
    ADD CONSTRAINT user_global_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vault_member_permissions
    ADD CONSTRAINT vault_member_permissions_vault_member_id_fkey FOREIGN KEY (vault_member_id) REFERENCES public.vault_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vault_members
    ADD CONSTRAINT vault_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vault_members
    ADD CONSTRAINT vault_members_vault_id_fkey FOREIGN KEY (vault_id) REFERENCES public.vaults(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.vaults
    ADD CONSTRAINT vaults_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL;
