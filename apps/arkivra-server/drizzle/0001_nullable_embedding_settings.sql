ALTER TABLE "instance_settings" ALTER COLUMN "ollama_embedding_model" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "instance_settings" ALTER COLUMN "ollama_embedding_model" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ALTER COLUMN "ollama_embedding_dimensions" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "instance_settings" ALTER COLUMN "ollama_embedding_dimensions" DROP NOT NULL;
