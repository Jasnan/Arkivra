ALTER TABLE "document_versions" ADD COLUMN "derived_preview_status" text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "derived_preview_error_code" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "derived_preview_error_message" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "derived_preview_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "derived_preview_status" text DEFAULT 'unavailable' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "derived_preview_error_code" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "derived_preview_error_message" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "derived_preview_failed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "document_versions" SET "derived_preview_status" = 'ready' WHERE "preview_pdf_storage_key" IS NOT NULL;--> statement-breakpoint
UPDATE "documents" SET "derived_preview_status" = 'ready' WHERE "preview_pdf_storage_key" IS NOT NULL;
