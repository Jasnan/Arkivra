ALTER TABLE "chat_conversations"
  ALTER COLUMN "vault_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'vault',
  ADD COLUMN IF NOT EXISTS "document_id" text REFERENCES "documents"("id") ON DELETE CASCADE;

ALTER TABLE "chat_messages"
  ALTER COLUMN "vault_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'vault',
  ADD COLUMN IF NOT EXISTS "document_id" text REFERENCES "documents"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "chat_conversations_scope_created_idx"
  ON "chat_conversations" ("created_by", "scope", "created_at");
CREATE INDEX IF NOT EXISTS "chat_conversations_document_created_idx"
  ON "chat_conversations" ("document_id", "created_at");
CREATE INDEX IF NOT EXISTS "chat_messages_scope_created_idx"
  ON "chat_messages" ("created_by", "scope", "created_at");
