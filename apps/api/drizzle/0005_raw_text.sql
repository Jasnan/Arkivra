-- Preserve the parser's raw text output for audit / tuning.
-- Added as part of the OCR-quality pipeline (parser → cleaner → chunker).

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "raw_text" text NOT NULL DEFAULT '';
