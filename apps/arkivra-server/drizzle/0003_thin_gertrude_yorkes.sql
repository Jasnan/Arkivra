ALTER TABLE "document_versions" ADD COLUMN "processing_error_code" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "processing_error_message" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "processing_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processing_error_code" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processing_error_message" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "processing_failed_at" timestamp with time zone;
