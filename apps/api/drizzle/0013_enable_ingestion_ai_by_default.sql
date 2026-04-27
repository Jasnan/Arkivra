-- Make multimodal ingestion features default-on for new and existing
-- instances. Existing rows were introduced with false defaults in 0011;
-- flip them here so local Ollama-backed summarisation and embeddings run
-- unless an admin explicitly opts out later.

ALTER TABLE "instance_settings"
  ALTER COLUMN "ai_summarisation_enabled" SET DEFAULT true,
  ALTER COLUMN "ollama_embedding_enabled" SET DEFAULT true;

UPDATE "instance_settings"
SET
  "ai_summarisation_enabled" = true,
  "ollama_embedding_enabled" = true,
  "updated_at" = now()
WHERE
  "ai_summarisation_enabled" = false
  OR "ollama_embedding_enabled" = false;
