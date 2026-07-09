CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "documents_name_trgm_idx" ON "documents" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "document_versions_original_name_trgm_idx" ON "document_versions" USING gin (lower("original_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vault_folders_name_trgm_idx" ON "vault_folders" USING gin (lower("name") gin_trgm_ops);
