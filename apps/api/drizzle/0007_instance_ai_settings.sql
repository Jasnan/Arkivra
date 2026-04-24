CREATE TABLE IF NOT EXISTS "instance_settings" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "ai_normalization_enabled" boolean DEFAULT false NOT NULL,
  "ollama_host" text DEFAULT 'http://127.0.0.1:11434' NOT NULL,
  "ollama_model" text DEFAULT 'gemma4:e2b' NOT NULL,
  "ollama_glued_word_min_token_length" integer DEFAULT 12 NOT NULL,
  "ollama_glued_word_max_candidates" integer DEFAULT 100 NOT NULL,
  "ollama_glued_word_batch_size" integer DEFAULT 10 NOT NULL
);
