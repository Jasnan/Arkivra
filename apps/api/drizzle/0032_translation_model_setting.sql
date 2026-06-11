ALTER TABLE public.instance_settings
  ADD COLUMN IF NOT EXISTS ollama_translation_model text NOT NULL DEFAULT 'gemma4:e4b';

UPDATE public.instance_settings
SET ollama_translation_model = ollama_model
WHERE ollama_translation_model = 'gemma4:e4b'
  AND ollama_model <> 'gemma4:e4b';
