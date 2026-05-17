ALTER TABLE "chat_conversations" RENAME COLUMN "created_by" TO "user_id";
ALTER TABLE "chat_messages" RENAME COLUMN "created_by" TO "user_id";

ALTER INDEX IF EXISTS "chat_conversations_created_by_vault_idx" RENAME TO "chat_conversations_user_id_vault_idx";
ALTER INDEX IF EXISTS "chat_conversations_scope_created_idx" RENAME TO "chat_conversations_scope_user_idx";
ALTER INDEX IF EXISTS "chat_messages_scope_created_idx" RENAME TO "chat_messages_scope_user_idx";
