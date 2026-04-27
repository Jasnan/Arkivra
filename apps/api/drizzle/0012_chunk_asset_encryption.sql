-- Phase 2 of the multimodal RAG ingestion plan persists per-chunk image
-- bytes through the existing StorageDriver, encrypted with the same KEK
-- family as the source document. Each call to encryptionServices.encrypt()
-- generates a fresh DEK, so the wrapped DEK + the active KEK version
-- must be stored alongside every asset to permit decryption.
--
-- Both columns are nullable because:
--   * `inline_payload` rows (small table HTML stored directly in the row)
--     never go through the encryption layer.
--   * Instances running without ARKIVRA_ENCRYPTION_KEYS write image bytes
--     in the clear and leave both columns null.

ALTER TABLE "document_chunk_assets"
  ADD COLUMN IF NOT EXISTS "file_encryption_key_wrapped" text,
  ADD COLUMN IF NOT EXISTS "file_encryption_kek_version" text;
