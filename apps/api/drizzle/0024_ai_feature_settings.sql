ALTER TABLE public.instance_settings
  ADD COLUMN IF NOT EXISTS ai_features_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ollama_embedding_host text NOT NULL DEFAULT 'http://127.0.0.1:11434';
