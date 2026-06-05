ALTER TABLE "chat_messages" ADD COLUMN "message" jsonb;

UPDATE "chat_messages"
SET "message" = jsonb_build_object(
  'id', "id",
  'role', "role",
  'metadata', coalesce("metadata", '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'conversationId', "conversation_id",
    'vaultId', "vault_id",
    'documentId', "document_id",
    'scope', "scope",
    'userId', "user_id",
    'citations', coalesce("citations", '[]'::jsonb),
    'generationMetrics', "generation_metrics",
    'generationStatus', "generation_status",
    'generationError', "generation_error",
    'createdAt', "created_at",
    'updatedAt', "updated_at"
  )),
  'parts', jsonb_build_array(jsonb_build_object('type', 'text', 'text', "content"))
    || CASE
      WHEN "role" = 'assistant' AND jsonb_array_length(coalesce("citations", '[]'::jsonb)) > 0 THEN
        jsonb_build_array(jsonb_build_object('type', 'data-citations', 'data', "citations"))
      ELSE '[]'::jsonb
    END
    || CASE
      WHEN "role" = 'assistant' AND "generation_metrics" IS NOT NULL THEN
        jsonb_build_array(jsonb_build_object('type', 'data-metrics', 'data', "generation_metrics"))
      ELSE '[]'::jsonb
    END
);

ALTER TABLE "chat_messages" ALTER COLUMN "message" SET NOT NULL;

ALTER TABLE "chat_messages"
  DROP COLUMN "role",
  DROP COLUMN "content",
  DROP COLUMN "metadata",
  DROP COLUMN "citations",
  DROP COLUMN "generation_metrics",
  DROP COLUMN "generation_status",
  DROP COLUMN "generation_error";
