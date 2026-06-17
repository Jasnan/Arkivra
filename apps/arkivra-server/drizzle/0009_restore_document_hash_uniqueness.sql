CREATE UNIQUE INDEX IF NOT EXISTS documents_vault_hash_unique
  ON public.documents USING btree (vault_id, original_sha256_hash)
  WHERE (is_deleted = false);
