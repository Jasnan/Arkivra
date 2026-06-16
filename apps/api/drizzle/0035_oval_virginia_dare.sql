ALTER TABLE public.instance_settings
  ADD COLUMN chat_provider text DEFAULT 'ollama' NOT NULL,
  ADD COLUMN chat_base_url text,
  ADD COLUMN chat_api_key_secret_ref text,
  ADD COLUMN chat_model text,
  ADD COLUMN chat_allowed_models jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
UPDATE public.instance_settings
SET
  chat_provider = 'ollama',
  chat_base_url = ollama_host,
  chat_model = ollama_model,
  chat_allowed_models = jsonb_build_array(ollama_model)
WHERE chat_base_url IS NULL
  OR chat_model IS NULL
  OR chat_allowed_models = '[]'::jsonb;
