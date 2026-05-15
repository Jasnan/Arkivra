ALTER TABLE public.instance_settings
DROP COLUMN IF EXISTS ai_normalization_enabled,
DROP COLUMN IF EXISTS ollama_glued_word_min_token_length,
DROP COLUMN IF EXISTS ollama_glued_word_max_candidates,
DROP COLUMN IF EXISTS ollama_glued_word_batch_size;
