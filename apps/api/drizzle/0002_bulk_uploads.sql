ALTER TABLE "documents"
ADD COLUMN IF NOT EXISTS "processing_status" text DEFAULT 'pending' NOT NULL;

CREATE INDEX IF NOT EXISTS "documents_processing_status_idx"
ON "documents" ("processing_status");

CREATE TABLE IF NOT EXISTS "upload_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "vault_id" text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "document_id" text REFERENCES "documents"("id") ON DELETE SET NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "total_size" integer NOT NULL,
  "part_size" integer NOT NULL,
  "part_count" integer NOT NULL,
  "bytes_received" integer DEFAULT 0 NOT NULL,
  "uploaded_parts_json" text DEFAULT '[]' NOT NULL,
  "staging_key" text NOT NULL,
  "status" text DEFAULT 'initialized' NOT NULL,
  "error_code" text,
  "error_message" text,
  "expires_at" timestamp,
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "upload_sessions_vault_user_idx"
ON "upload_sessions" ("vault_id", "user_id");

CREATE INDEX IF NOT EXISTS "upload_sessions_status_idx"
ON "upload_sessions" ("status");

CREATE INDEX IF NOT EXISTS "upload_sessions_document_idx"
ON "upload_sessions" ("document_id");
