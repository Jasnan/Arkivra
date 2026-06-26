ALTER TABLE "instance_settings" ADD COLUMN "embedding_provider" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "embedding_base_url" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "embedding_api_key_secret_ref" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "embedding_dimensions" integer;--> statement-breakpoint
UPDATE "instance_settings"
SET
  "embedding_provider" = CASE
    WHEN "ollama_embedding_model" IS NOT NULL
      AND "ollama_embedding_dimensions" IS NOT NULL
    THEN 'ollama'
    ELSE NULL
  END,
  "embedding_base_url" = CASE
    WHEN "ollama_embedding_model" IS NOT NULL
      AND "ollama_embedding_dimensions" IS NOT NULL
    THEN "ollama_embedding_host"
    ELSE NULL
  END,
  "embedding_model" = "ollama_embedding_model",
  "embedding_dimensions" = "ollama_embedding_dimensions";
