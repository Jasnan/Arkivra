CREATE TABLE IF NOT EXISTS "chat_conversations" (
  "id"         text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "vault_id"   text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "created_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "title"      text NOT NULL DEFAULT 'New chat',
  "deleted_at" timestamp
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id"                text PRIMARY KEY NOT NULL,
  "created_at"        timestamp DEFAULT now() NOT NULL,
  "updated_at"        timestamp DEFAULT now() NOT NULL,
  "conversation_id"   text NOT NULL REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
  "vault_id"          text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "created_by"        text REFERENCES "users"("id") ON DELETE SET NULL,
  "role"              text NOT NULL,
  "content"           text NOT NULL,
  "citations"         jsonb,
  "generation_status" text,
  "generation_error"  text
);

CREATE INDEX IF NOT EXISTS "chat_conversations_vault_created_idx"
  ON "chat_conversations" ("vault_id", "created_at");
CREATE INDEX IF NOT EXISTS "chat_conversations_created_by_vault_idx"
  ON "chat_conversations" ("created_by", "vault_id");
CREATE INDEX IF NOT EXISTS "chat_messages_conversation_created_idx"
  ON "chat_messages" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "chat_messages_vault_created_idx"
  ON "chat_messages" ("vault_id", "created_at");
