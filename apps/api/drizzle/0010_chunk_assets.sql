-- Image / table assets referenced from chunks. Image bytes live in the
-- existing StorageDriver (encrypted with the same KEK family as the
-- source document). Table HTML may be stored inline for small payloads
-- via inline_payload; large tables can use storage_key like images.
-- Vault scoping is denormalised onto the row so retrieval can authorise
-- without a chunk join.

CREATE TABLE IF NOT EXISTS "document_chunk_assets" (
  "id"             text PRIMARY KEY NOT NULL,
  "chunk_id"       text NOT NULL REFERENCES "document_chunks"("id") ON DELETE CASCADE,
  "document_id"    text NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "vault_id"       text NOT NULL REFERENCES "vaults"("id") ON DELETE CASCADE,
  "asset_type"     text NOT NULL,
  "mime_type"      text,
  "storage_key"    text,
  "inline_payload" text,
  "page_number"    integer,
  "bbox"           jsonb,
  "byte_size"      integer,
  "sha256_hash"    text,
  "created_at"     timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "document_chunk_assets_chunk_idx"
  ON "document_chunk_assets" ("chunk_id");
CREATE INDEX IF NOT EXISTS "document_chunk_assets_vault_doc_idx"
  ON "document_chunk_assets" ("vault_id", "document_id");
