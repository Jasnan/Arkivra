ALTER TABLE public.instance_settings
  ALTER COLUMN ai_summarisation_enabled SET DEFAULT false,
  ALTER COLUMN ollama_embedding_enabled SET DEFAULT false;
