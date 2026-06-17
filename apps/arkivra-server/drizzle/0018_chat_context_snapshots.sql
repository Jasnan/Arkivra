ALTER TABLE "chat_conversations" ADD COLUMN "context_snapshot" jsonb;

UPDATE "chat_conversations"
SET "context_snapshot" = CASE
  WHEN "scope" = 'document' THEN jsonb_build_object(
    'type', 'document',
    'vaultId', "vault_id",
    'documentId', "document_id"
  )
  WHEN "scope" = 'vault' THEN jsonb_build_object(
    'type', 'vault',
    'vaultId', "vault_id"
  )
  ELSE jsonb_build_object(
    'type', 'global',
    'vaultIds', COALESCE((
      SELECT jsonb_agg(vm.vault_id ORDER BY vm.vault_id)
      FROM vault_members AS vm
      WHERE vm.user_id = "chat_conversations"."user_id"
        AND vm.ai_access_level = 'full'
    ), '[]'::jsonb)
  )
END
WHERE "context_snapshot" IS NULL;

ALTER TABLE "chat_conversations" ALTER COLUMN "context_snapshot" SET NOT NULL;
