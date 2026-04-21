DROP INDEX IF EXISTS "documents_vault_hash_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "documents_vault_hash_unique"
ON "documents" ("vault_id", "original_sha256_hash")
WHERE "is_deleted" = false;
