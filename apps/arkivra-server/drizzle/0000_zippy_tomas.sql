CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activity_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"vault_id" text,
	"document_id" text,
	"actor_id" text,
	"actor_type" text DEFAULT 'unknown' NOT NULL,
	"actor_display_name" text,
	"target_type" text,
	"target_id" text,
	"target_display_name" text,
	"source" text DEFAULT 'api' NOT NULL,
	"visibility" text DEFAULT 'vault_members' NOT NULL,
	"metadata_json" jsonb,
	"audit_event_id" text,
	"schema_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"capability" text NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text,
	"model" text NOT NULL,
	"dimensions" integer,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"api_key_secret_ref" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"event_category" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"outcome" text NOT NULL,
	"actor_id" text,
	"actor_type" text DEFAULT 'unknown' NOT NULL,
	"actor_display_name" text,
	"vault_id" text,
	"document_id" text,
	"target_type" text,
	"target_id" text,
	"target_display_name" text,
	"source" text DEFAULT 'api' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"request_id" text,
	"metadata_json" jsonb,
	"before_json" jsonb,
	"after_json" jsonb,
	"schema_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue_name" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"backoff_type" text,
	"backoff_delay_ms" integer,
	"repeat_pattern" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"result" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversation_document_versions" (
	"conversation_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text,
	"included_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversation_document_versions_unique" UNIQUE("conversation_id","document_version_id")
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" text,
	"user_id" text,
	"scope" text DEFAULT 'vault' NOT NULL,
	"document_id" text,
	"context_snapshot" jsonb NOT NULL,
	"context_frozen_at" timestamp with time zone,
	"title" text DEFAULT 'New chat' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_message_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text,
	"chunk_id" text,
	"version_number" integer NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"citation_precision" text,
	"snippet" text,
	"locator_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" text NOT NULL,
	"vault_id" text,
	"user_id" text,
	"scope" text DEFAULT 'vault' NOT NULL,
	"document_id" text,
	"message" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunk_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"chunk_id" text NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"asset_type" text NOT NULL,
	"mime_type" text,
	"storage_key" text,
	"inline_payload" text,
	"source_element_id" text,
	"page_number" integer,
	"bbox" jsonb,
	"byte_size" integer,
	"sha256_hash" text,
	"file_encryption_key_wrapped" text,
	"file_encryption_kek_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunk_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"embedding_index_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"content_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_chunk_embeddings_index_chunk_unique" UNIQUE("embedding_index_id","chunk_id")
);
--> statement-breakpoint
ALTER TABLE "document_chunk_embeddings" ADD COLUMN "embedding" vector NOT NULL;
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_key" text NOT NULL,
	"content" text NOT NULL,
	"section" text,
	"section_path" jsonb,
	"page_number" integer,
	"chunk_type" text,
	"token_count" integer,
	"content_sha256" text,
	"parser_engine" text,
	"metadata" jsonb,
	"page_start" integer,
	"page_end" integer,
	"bounding_boxes" jsonb,
	"source_element_ids" jsonb,
	"parent_element_id" text,
	"original_text" text,
	"tables_html" jsonb,
	"citation_precision" text DEFAULT 'document' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_chunks_version_index_unique" UNIQUE("document_version_id","chunk_index")
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content", ''))) STORED;
--> statement-breakpoint
CREATE TABLE "document_element_provenance" (
	"document_id" text NOT NULL,
	"document_version_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"element_id" text NOT NULL,
	"parent_element_id" text,
	"element_type" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"page_number" integer,
	"bbox" jsonb,
	"section" text,
	"section_path" jsonb,
	"sort_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_element_provenance_pk" PRIMARY KEY("document_version_id","element_id")
);
--> statement-breakpoint
CREATE TABLE "document_embedding_index_status" (
	"embedding_index_id" text NOT NULL,
	"document_id" text NOT NULL,
	"document_version_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"status" text NOT NULL,
	"expected_chunk_count" integer DEFAULT 0 NOT NULL,
	"embedded_chunk_count" integer DEFAULT 0 NOT NULL,
	"failure_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"indexed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_embedding_index_status_pkey" PRIMARY KEY("embedding_index_id","document_version_id")
);
--> statement-breakpoint
CREATE TABLE "document_tags" (
	"document_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "document_tags_document_id_tag_id_pk" PRIMARY KEY("document_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"original_name" text NOT NULL,
	"original_size" integer DEFAULT 0 NOT NULL,
	"original_storage_key" text NOT NULL,
	"original_sha256_hash" text NOT NULL,
	"mime_type" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"raw_text" text DEFAULT '' NOT NULL,
	"raw_markdown" text DEFAULT '' NOT NULL,
	"parser_structured_output" jsonb,
	"language_metadata" jsonb,
	"parser_engine" text,
	"parser_engine_version" text,
	"parser_warnings" jsonb,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"file_encryption_key_wrapped" text,
	"file_encryption_kek_version" text,
	"file_encryption_algorithm" text,
	"restored_from_version_id" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "document_versions_document_number_unique" UNIQUE("document_id","version_number"),
	CONSTRAINT "document_versions_id_document_vault_unique" UNIQUE("id","document_id","vault_id"),
	CONSTRAINT "document_versions_version_number_positive" CHECK ("document_versions"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" text NOT NULL,
	"folder_id" text,
	"created_by" text,
	"original_name" text NOT NULL,
	"original_size" integer DEFAULT 0 NOT NULL,
	"original_storage_key" text NOT NULL,
	"original_sha256_hash" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"raw_text" text DEFAULT '' NOT NULL,
	"raw_markdown" text DEFAULT '' NOT NULL,
	"parser_structured_output" jsonb,
	"language_metadata" jsonb,
	"parser_engine" text,
	"parser_engine_version" text,
	"parser_warnings" jsonb,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"file_encryption_key_wrapped" text,
	"file_encryption_kek_version" text,
	"file_encryption_algorithm" text,
	"current_version_id" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "documents_id_vault_unique" UNIQUE("id","vault_id")
);
--> statement-breakpoint
CREATE TABLE "email_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"email" text NOT NULL,
	"invited_by" text,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"vault_id" text,
	"vault_member_id" text,
	"vault_role" text,
	"ai_access_level" text DEFAULT 'none' NOT NULL,
	"system_role" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_indexes" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_config_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"distance_metric" text DEFAULT 'cosine' NOT NULL,
	"status" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"expected_chunk_count" integer DEFAULT 0 NOT NULL,
	"embedded_chunk_count" integer DEFAULT 0 NOT NULL,
	"failed_chunk_count" integer DEFAULT 0 NOT NULL,
	"failure_message" text,
	"build_started_at" timestamp with time zone,
	"build_completed_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ai_features_enabled" boolean DEFAULT false NOT NULL,
	"chat_provider" text DEFAULT 'ollama' NOT NULL,
	"chat_base_url" text,
	"chat_api_key_secret_ref" text,
	"chat_model" text,
	"chat_allowed_models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gemini_api_key_secret_ref" text,
	"ollama_host" text DEFAULT 'http://127.0.0.1:11434' NOT NULL,
	"ollama_model" text DEFAULT 'gemma4:e4b' NOT NULL,
	"ollama_translation_model" text DEFAULT 'gemma4:e4b' NOT NULL,
	"translation_provider" text DEFAULT 'ollama' NOT NULL,
	"translation_base_url" text,
	"translation_api_key_secret_ref" text,
	"ollama_embedding_enabled" boolean DEFAULT false NOT NULL,
	"ollama_embedding_host" text DEFAULT 'http://127.0.0.1:11434' NOT NULL,
	"ollama_embedding_model" text DEFAULT 'bge-m3' NOT NULL,
	"ollama_embedding_dimensions" integer DEFAULT 1024 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"vault_id" text,
	"target_user_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb
);
--> statement-breakpoint
CREATE TABLE "system_capabilities" (
	"user_id" text NOT NULL,
	"capability" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_capabilities_pk" PRIMARY KEY("user_id","capability")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" text NOT NULL,
	"user_id" text NOT NULL,
	"document_id" text,
	"document_version_id" text,
	"folder_id" text,
	"file_name" text NOT NULL,
	"relative_path" text,
	"mime_type" text NOT NULL,
	"total_size" integer NOT NULL,
	"part_size" integer NOT NULL,
	"part_count" integer NOT NULL,
	"bytes_received" integer DEFAULT 0 NOT NULL,
	"uploaded_parts_json" text DEFAULT '[]' NOT NULL,
	"staging_key" text NOT NULL,
	"status" text DEFAULT 'initialized' NOT NULL,
	"error_code" text,
	"error_message" text,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_ui_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accent_color" text DEFAULT 'blue' NOT NULL,
	"density" text DEFAULT 'comfortable' NOT NULL,
	"font_family" text DEFAULT 'inter' NOT NULL,
	"font_size" text DEFAULT 'md' NOT NULL,
	"radius" text DEFAULT 'md' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"date_format" text,
	"show_extracted_text_tab" boolean DEFAULT false NOT NULL,
	"default_file_browser_view" text DEFAULT 'list' NOT NULL,
	"default_chat_answer_mode" text DEFAULT 'text' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"system_role" text DEFAULT 'member' NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vault_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" text NOT NULL,
	"parent_id" text,
	"created_by" text,
	"name" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
CREATE TABLE "vault_members" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vault_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"ai_access_level" text DEFAULT 'none' NOT NULL,
	CONSTRAINT "vault_members_vault_user_unique" UNIQUE("vault_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" text
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_two_factor" ADD CONSTRAINT "auth_two_factor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation_document_versions" ADD CONSTRAINT "chat_conversation_document_versions_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation_document_versions" ADD CONSTRAINT "chat_conversation_document_versions_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_citations" ADD CONSTRAINT "chat_message_citations_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_citations" ADD CONSTRAINT "chat_message_citations_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_citations" ADD CONSTRAINT "chat_message_citations_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_citations" ADD CONSTRAINT "chat_message_citations_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_assets" ADD CONSTRAINT "document_chunk_assets_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_assets" ADD CONSTRAINT "document_chunk_assets_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_assets" ADD CONSTRAINT "document_chunk_assets_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_assets" ADD CONSTRAINT "document_chunk_assets_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_assets" ADD CONSTRAINT "document_chunk_assets_version_document_vault_fkey" FOREIGN KEY ("document_version_id","document_id","vault_id") REFERENCES "public"."document_versions"("id","document_id","vault_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_embeddings" ADD CONSTRAINT "document_chunk_embeddings_embedding_index_id_embedding_indexes_id_fk" FOREIGN KEY ("embedding_index_id") REFERENCES "public"."embedding_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_embeddings" ADD CONSTRAINT "document_chunk_embeddings_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_embeddings" ADD CONSTRAINT "document_chunk_embeddings_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_embeddings" ADD CONSTRAINT "document_chunk_embeddings_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_embeddings" ADD CONSTRAINT "document_chunk_embeddings_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk_embeddings" ADD CONSTRAINT "document_chunk_embeddings_version_document_vault_fkey" FOREIGN KEY ("document_version_id","document_id","vault_id") REFERENCES "public"."document_versions"("id","document_id","vault_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_version_document_vault_fkey" FOREIGN KEY ("document_version_id","document_id","vault_id") REFERENCES "public"."document_versions"("id","document_id","vault_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_element_provenance" ADD CONSTRAINT "document_element_provenance_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_element_provenance" ADD CONSTRAINT "document_element_provenance_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_element_provenance" ADD CONSTRAINT "document_element_provenance_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_element_provenance" ADD CONSTRAINT "document_element_provenance_version_document_vault_fkey" FOREIGN KEY ("document_version_id","document_id","vault_id") REFERENCES "public"."document_versions"("id","document_id","vault_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embedding_index_status" ADD CONSTRAINT "document_embedding_index_status_embedding_index_id_embedding_indexes_id_fk" FOREIGN KEY ("embedding_index_id") REFERENCES "public"."embedding_indexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embedding_index_status" ADD CONSTRAINT "document_embedding_index_status_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embedding_index_status" ADD CONSTRAINT "document_embedding_index_status_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embedding_index_status" ADD CONSTRAINT "document_embedding_index_status_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_embedding_index_status" ADD CONSTRAINT "document_embedding_index_status_version_document_vault_fkey" FOREIGN KEY ("document_version_id","document_id","vault_id") REFERENCES "public"."document_versions"("id","document_id","vault_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_restored_from_version_id_document_versions_id_fk" FOREIGN KEY ("restored_from_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_vault_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."vault_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_invitations" ADD CONSTRAINT "email_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_invitations" ADD CONSTRAINT "email_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_invitations" ADD CONSTRAINT "email_invitations_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_invitations" ADD CONSTRAINT "email_invitations_vault_member_id_vault_members_id_fk" FOREIGN KEY ("vault_member_id") REFERENCES "public"."vault_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_indexes" ADD CONSTRAINT "embedding_indexes_provider_config_id_ai_provider_configs_id_fk" FOREIGN KEY ("provider_config_id") REFERENCES "public"."ai_provider_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_requests" ADD CONSTRAINT "permission_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_requests" ADD CONSTRAINT "permission_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_requests" ADD CONSTRAINT "permission_requests_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_requests" ADD CONSTRAINT "permission_requests_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_capabilities" ADD CONSTRAINT "system_capabilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_capabilities" ADD CONSTRAINT "system_capabilities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_folder_id_vault_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."vault_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ui_preferences" ADD CONSTRAINT "user_ui_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_parent_id_vault_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."vault_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_vault_occurred_idx" ON "activity_events" USING btree ("vault_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_document_occurred_idx" ON "activity_events" USING btree ("document_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_actor_occurred_idx" ON "activity_events" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_type_occurred_idx" ON "activity_events" USING btree ("activity_type","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_entity_occurred_idx" ON "activity_events" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ai_provider_configs_capability_enabled_idx" ON "ai_provider_configs" USING btree ("capability","is_enabled");--> statement-breakpoint
CREATE INDEX "audit_events_vault_occurred_idx" ON "audit_events" USING btree ("vault_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_document_occurred_idx" ON "audit_events" USING btree ("document_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_occurred_idx" ON "audit_events" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_type_occurred_idx" ON "audit_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_category_occurred_idx" ON "audit_events" USING btree ("event_category","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_severity_occurred_idx" ON "audit_events" USING btree ("severity","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_outcome_occurred_idx" ON "audit_events" USING btree ("outcome","occurred_at");--> statement-breakpoint
CREATE INDEX "background_jobs_queue_status_run_idx" ON "background_jobs" USING btree ("queue_name","status","run_at");--> statement-breakpoint
CREATE INDEX "background_jobs_status_run_idx" ON "background_jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "background_jobs_locked_at_idx" ON "background_jobs" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "chat_conversation_document_versions_conversation_idx" ON "chat_conversation_document_versions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_conversation_document_versions_vault_conversation_idx" ON "chat_conversation_document_versions" USING btree ("vault_id","conversation_id");--> statement-breakpoint
CREATE INDEX "chat_conversation_document_versions_version_idx" ON "chat_conversation_document_versions" USING btree ("document_version_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_vault_created_idx" ON "chat_conversations" USING btree ("vault_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_conversations_user_id_vault_idx" ON "chat_conversations" USING btree ("user_id","vault_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_scope_user_idx" ON "chat_conversations" USING btree ("user_id","scope","created_at");--> statement-breakpoint
CREATE INDEX "chat_conversations_document_created_idx" ON "chat_conversations" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_message_citations_conversation_message_idx" ON "chat_message_citations" USING btree ("conversation_id","message_id");--> statement-breakpoint
CREATE INDEX "chat_message_citations_version_idx" ON "chat_message_citations" USING btree ("document_version_id");--> statement-breakpoint
CREATE INDEX "chat_message_citations_chunk_idx" ON "chat_message_citations" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "chat_message_citations_document_version_idx" ON "chat_message_citations" USING btree ("document_id","document_version_id");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_vault_created_idx" ON "chat_messages" USING btree ("vault_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_scope_user_idx" ON "chat_messages" USING btree ("user_id","scope","created_at");--> statement-breakpoint
CREATE INDEX "document_chunk_assets_chunk_idx" ON "document_chunk_assets" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "document_chunk_assets_vault_doc_idx" ON "document_chunk_assets" USING btree ("vault_id","document_id");--> statement-breakpoint
CREATE INDEX "document_chunk_assets_vault_version_idx" ON "document_chunk_assets" USING btree ("vault_id","document_version_id");--> statement-breakpoint
CREATE INDEX "document_chunk_embeddings_index_doc_idx" ON "document_chunk_embeddings" USING btree ("embedding_index_id","document_id");--> statement-breakpoint
CREATE INDEX "document_chunk_embeddings_index_version_idx" ON "document_chunk_embeddings" USING btree ("embedding_index_id","document_version_id");--> statement-breakpoint
CREATE INDEX "document_chunk_embeddings_index_doc_version_idx" ON "document_chunk_embeddings" USING btree ("embedding_index_id","document_id","document_version_id");--> statement-breakpoint
CREATE INDEX "document_chunk_embeddings_index_vault_idx" ON "document_chunk_embeddings" USING btree ("embedding_index_id","vault_id");--> statement-breakpoint
CREATE INDEX "document_chunks_vault_doc_idx" ON "document_chunks" USING btree ("vault_id","document_id");--> statement-breakpoint
CREATE INDEX "document_chunks_vault_version_idx" ON "document_chunks" USING btree ("vault_id","document_version_id");--> statement-breakpoint
CREATE INDEX "document_chunks_page_idx" ON "document_chunks" USING btree ("document_id","page_start","page_end");--> statement-breakpoint
CREATE INDEX "document_chunks_version_page_idx" ON "document_chunks" USING btree ("document_version_id","page_start","page_end");--> statement-breakpoint
CREATE INDEX "document_element_provenance_version_sort_idx" ON "document_element_provenance" USING btree ("document_version_id","sort_index");--> statement-breakpoint
CREATE INDEX "document_element_provenance_version_page_idx" ON "document_element_provenance" USING btree ("document_version_id","page_number");--> statement-breakpoint
CREATE INDEX "document_embedding_index_status_vault_idx" ON "document_embedding_index_status" USING btree ("embedding_index_id","vault_id");--> statement-breakpoint
CREATE INDEX "document_embedding_index_status_doc_version_idx" ON "document_embedding_index_status" USING btree ("embedding_index_id","document_id","document_version_id");--> statement-breakpoint
CREATE INDEX "document_versions_vault_document_number_idx" ON "document_versions" USING btree ("vault_id","document_id","version_number" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "document_versions_vault_status_uploaded_idx" ON "document_versions" USING btree ("vault_id","processing_status","uploaded_at");--> statement-breakpoint
CREATE INDEX "document_versions_vault_hash_idx" ON "document_versions" USING btree ("vault_id","original_sha256_hash");--> statement-breakpoint
CREATE INDEX "document_versions_kek_version_idx" ON "document_versions" USING btree ("file_encryption_kek_version");--> statement-breakpoint
CREATE INDEX "document_versions_deleted_idx" ON "document_versions" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_active_folder_filename_unique" ON "documents" USING btree ("vault_id",coalesce("folder_id", ''),lower("original_name")) WHERE "documents"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "documents_vault_deleted_created_idx" ON "documents" USING btree ("vault_id","is_deleted","created_at");--> statement-breakpoint
CREATE INDEX "documents_vault_deleted_idx" ON "documents" USING btree ("vault_id","is_deleted");--> statement-breakpoint
CREATE INDEX "documents_vault_folder_deleted_created_idx" ON "documents" USING btree ("vault_id","folder_id","is_deleted","created_at");--> statement-breakpoint
CREATE INDEX "documents_processing_status_idx" ON "documents" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "documents_language_metadata_gin_idx" ON "documents" USING gin ("language_metadata");--> statement-breakpoint
CREATE INDEX "documents_language_code_idx" ON "documents" USING btree (("language_metadata"->>'code')) WHERE "documents"."language_metadata" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "documents_hash_idx" ON "documents" USING btree ("original_sha256_hash");--> statement-breakpoint
CREATE INDEX "documents_kek_version_idx" ON "documents" USING btree ("file_encryption_kek_version");--> statement-breakpoint
CREATE INDEX "documents_current_version_idx" ON "documents" USING btree ("current_version_id");--> statement-breakpoint
CREATE INDEX "email_invitations_email_status_idx" ON "email_invitations" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "email_invitations_vault_idx" ON "email_invitations" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "email_invitations_invited_by_idx" ON "email_invitations" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "embedding_indexes_provider_config_idx" ON "embedding_indexes" USING btree ("provider_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_indexes_single_active_idx" ON "embedding_indexes" USING btree ("is_active") WHERE "embedding_indexes"."is_active" = true;--> statement-breakpoint
CREATE INDEX "permission_requests_status_created_idx" ON "permission_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "permission_requests_requested_by_idx" ON "permission_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "permission_requests_vault_idx" ON "permission_requests" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "system_capabilities_capability_idx" ON "system_capabilities" USING btree ("capability");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_unique" ON "tags" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "upload_sessions_vault_user_idx" ON "upload_sessions" USING btree ("vault_id","user_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_status_idx" ON "upload_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "upload_sessions_document_idx" ON "upload_sessions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_document_version_idx" ON "upload_sessions" USING btree ("document_version_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_folder_idx" ON "upload_sessions" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_disabled_at_idx" ON "users" USING btree ("disabled_at");--> statement-breakpoint
CREATE INDEX "vault_folders_vault_parent_deleted_name_idx" ON "vault_folders" USING btree ("vault_id","parent_id","is_deleted","name");--> statement-breakpoint
CREATE INDEX "vault_folders_parent_idx" ON "vault_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "vault_folders_deleted_idx" ON "vault_folders" USING btree ("vault_id","is_deleted");--> statement-breakpoint
CREATE UNIQUE INDEX "vault_folders_active_sibling_name_unique" ON "vault_folders" USING btree ("vault_id",coalesce("parent_id", '__root__'),lower("name")) WHERE "vault_folders"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "vault_members_user_id_idx" ON "vault_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vaults_deleted_at_idx" ON "vaults" USING btree ("deleted_at");
