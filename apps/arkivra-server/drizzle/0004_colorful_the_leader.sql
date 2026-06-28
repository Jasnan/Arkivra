ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_storage_key" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_size" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_sha256_hash" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_converter" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_converter_version" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_encryption_key_wrapped" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_encryption_kek_version" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "preview_pdf_encryption_algorithm" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_storage_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_size" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_sha256_hash" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_converter" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_converter_version" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_encryption_key_wrapped" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_encryption_kek_version" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "preview_pdf_encryption_algorithm" text;