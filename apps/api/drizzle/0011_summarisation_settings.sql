-- Per-instance toggles for the multimodal RAG ingestion pipeline.
-- Both summarisation and embedding default to OFF so existing
-- deployments are unaffected until an admin explicitly opts in.
-- Embedding dimensions default to 768 to match the
-- document_chunks.embedding vector(768) column provisioned in 0000_init.

ALTER TABLE "instance_settings"
  ADD COLUMN IF NOT EXISTS "ai_summarisation_enabled"            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ollama_summarisation_model"          text    NOT NULL DEFAULT 'gemma4:e2b',
  ADD COLUMN IF NOT EXISTS "ollama_summarisation_max_images_per_chunk" integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS "ollama_embedding_enabled"            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ollama_embedding_model"              text    NOT NULL DEFAULT 'nomic-embed-text',
  ADD COLUMN IF NOT EXISTS "ollama_embedding_dimensions"         integer NOT NULL DEFAULT 768;
