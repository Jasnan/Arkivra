-- Arkivra initial schema migration
-- Includes all core tables for V1 + AI-ready columns for V2

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean DEFAULT false NOT NULL,
  "name" text,
  "image" text,
  "two_factor_enabled" boolean DEFAULT false NOT NULL,
  "disabled_at" timestamp
);

CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "users_disabled_at_idx" ON "users" ("disabled_at");

-- ============================================================
-- Vaults
-- ============================================================
CREATE TABLE IF NOT EXISTS "vaults" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "name" text NOT NULL,
  "deleted_at" timestamp,
  "deleted_by" text REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "vaults_deleted_at_idx" ON "vaults" ("deleted_at");

-- ============================================================
-- Vault Members
-- ============================================================
CREATE TABLE IF NOT EXISTS "vault_members" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "vault_id" text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  CONSTRAINT "vault_members_vault_user_unique" UNIQUE("vault_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "vault_members_user_id_idx" ON "vault_members" ("user_id");

-- ============================================================
-- Authorization
-- ============================================================
CREATE TABLE IF NOT EXISTS "user_global_roles" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_global_roles_pk" PRIMARY KEY ("user_id", "role")
);

CREATE INDEX IF NOT EXISTS "user_global_roles_role_idx" ON "user_global_roles" ("role");

CREATE TABLE IF NOT EXISTS "vault_member_permissions" (
  "vault_member_id" text NOT NULL REFERENCES "vault_members"("id") ON DELETE CASCADE,
  "permission" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "vault_member_permissions_pk" PRIMARY KEY ("vault_member_id", "permission")
);

CREATE INDEX IF NOT EXISTS "vault_member_permissions_permission_idx" ON "vault_member_permissions" ("permission");

-- ============================================================
-- Documents
-- ============================================================
CREATE TABLE IF NOT EXISTS "documents" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "vault_id" text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "original_name" text NOT NULL,
  "original_size" integer DEFAULT 0 NOT NULL,
  "original_storage_key" text NOT NULL,
  "original_sha256_hash" text NOT NULL,
  "name" text NOT NULL,
  "mime_type" text NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "document_date" timestamp,
  "file_encryption_key_wrapped" text,
  "file_encryption_kek_version" text,
  "file_encryption_algorithm" text,
  "is_deleted" boolean DEFAULT false NOT NULL,
  "deleted_at" timestamp,
  "deleted_by" text REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "documents_vault_hash_unique" ON "documents" ("vault_id", "original_sha256_hash");
CREATE INDEX IF NOT EXISTS "documents_vault_deleted_created_idx" ON "documents" ("vault_id", "is_deleted", "created_at");
CREATE INDEX IF NOT EXISTS "documents_vault_deleted_idx" ON "documents" ("vault_id", "is_deleted");
CREATE INDEX IF NOT EXISTS "documents_hash_idx" ON "documents" ("original_sha256_hash");
CREATE INDEX IF NOT EXISTS "documents_kek_version_idx" ON "documents" ("file_encryption_kek_version");

-- ============================================================
-- Document Chunks (with tsvector FTS + pgvector embedding)
-- ============================================================
CREATE TABLE IF NOT EXISTS "document_chunks" (
  "id" text PRIMARY KEY NOT NULL,
  "document_id" text NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "vault_id" text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "page_number" integer,
  "chunk_type" text,
  "token_count" integer,
  "embedding" vector(768),
  "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "document_chunks_doc_index_unique" UNIQUE("document_id", "chunk_index")
);

CREATE INDEX IF NOT EXISTS "document_chunks_fts_idx" ON "document_chunks" USING GIN ("tsv");
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "document_chunks_vault_doc_idx" ON "document_chunks" ("vault_id", "document_id");

-- ============================================================
-- Tags
-- ============================================================
CREATE TABLE IF NOT EXISTS "tags" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "vault_id" text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text,
  CONSTRAINT "tags_vault_name_unique" UNIQUE("vault_id", "name")
);

-- ============================================================
-- Document Tags (junction)
-- ============================================================
CREATE TABLE IF NOT EXISTS "document_tags" (
  "document_id" text NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "tag_id" text NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  PRIMARY KEY ("document_id", "tag_id")
);

-- ============================================================
-- Better Auth: Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- Better Auth: Accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS "auth_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "id_token" text,
  "password" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- Better Auth: Verifications
-- ============================================================
CREATE TABLE IF NOT EXISTS "auth_verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ============================================================
-- Better Auth: Two Factor
-- ============================================================
CREATE TABLE IF NOT EXISTS "auth_two_factor" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
