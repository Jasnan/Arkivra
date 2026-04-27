-- Citation-grade provenance on document_chunks.
-- Adds page span, bounding boxes, source element ids, parent element id,
-- the verbatim chunk text, table HTML payloads, and a citation precision
-- enum-like string ('box' | 'page' | 'document'). All columns are
-- additive and nullable (or default-backfilled) so existing rows remain
-- valid; retrieval treats NULL original_text as "fall back to content".

ALTER TABLE "document_chunks"
  ADD COLUMN IF NOT EXISTS "page_start"          integer,
  ADD COLUMN IF NOT EXISTS "page_end"            integer,
  ADD COLUMN IF NOT EXISTS "bounding_boxes"      jsonb,
  ADD COLUMN IF NOT EXISTS "source_element_ids"  jsonb,
  ADD COLUMN IF NOT EXISTS "parent_element_id"   text,
  ADD COLUMN IF NOT EXISTS "original_text"       text,
  ADD COLUMN IF NOT EXISTS "tables_html"         jsonb,
  ADD COLUMN IF NOT EXISTS "citation_precision"  text NOT NULL DEFAULT 'document';

CREATE INDEX IF NOT EXISTS "document_chunks_page_idx"
  ON "document_chunks" ("document_id", "page_start", "page_end");
