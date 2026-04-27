-- Drop documents.markdown_content.
-- The column was redundant: documents.content already stores the
-- plainified markdown (parse-pipeline plainifies normalized.markdown
-- before writing), and the only reader (getDocument) plainified it
-- again, producing the same string. Structural fidelity (headings,
-- tables, bboxes, images) lives on document_chunks going forward.

ALTER TABLE "documents"
  DROP COLUMN IF EXISTS "markdown_content";
