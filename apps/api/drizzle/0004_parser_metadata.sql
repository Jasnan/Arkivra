-- Parser-engine provenance + RAG-ready chunk metadata
-- Phase 1: decoupling ingestion from a single parser implementation.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "markdown_content" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "parser_engine" text,
  ADD COLUMN IF NOT EXISTS "parser_engine_version" text,
  ADD COLUMN IF NOT EXISTS "parser_warnings" jsonb;

ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "chunk_key" text,
  ADD COLUMN IF NOT EXISTS "section" text,
  ADD COLUMN IF NOT EXISTS "parser_engine" text,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

-- Backfill chunk_key for existing rows using documentId:chunkIndex convention
-- so the NOT NULL constraint below can be applied safely.
UPDATE "document_chunks"
SET "chunk_key" = "document_id" || ':' || "chunk_index"
WHERE "chunk_key" IS NULL;

ALTER TABLE "document_chunks"
  ALTER COLUMN "chunk_key" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "documents_parser_engine_idx"
  ON "documents" ("parser_engine");
