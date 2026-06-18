ALTER TABLE "instance_settings" ADD COLUMN "translation_provider" text DEFAULT 'ollama' NOT NULL;
ALTER TABLE "instance_settings" ADD COLUMN "translation_base_url" text;
ALTER TABLE "instance_settings" ADD COLUMN "translation_api_key_secret_ref" text;
