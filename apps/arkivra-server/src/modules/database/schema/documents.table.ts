import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { usersTable } from './users.table.js';
import { vaultFoldersTable } from './vault-folders.table.js';
import { vaultsTable } from './vaults.table.js';

export const documentsTable = pgTable(
  'documents',
  {
    ...createPrimaryKeyField({ prefix: 'doc' }),
    ...createTimestampColumns(),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    folderId: text('folder_id').references(() => vaultFoldersTable.id, { onDelete: 'set null' }),

    createdBy: text('created_by').references(() => usersTable.id, { onDelete: 'set null' }),

    originalName: text('original_name').notNull(),
    originalSize: integer('original_size').notNull().default(0),
    originalStorageKey: text('original_storage_key').notNull(),
    originalSha256Hash: text('original_sha256_hash').notNull(),

    previewPdfStorageKey: text('preview_pdf_storage_key'),
    previewPdfSize: integer('preview_pdf_size'),
    previewPdfSha256Hash: text('preview_pdf_sha256_hash'),
    previewPdfConverter: text('preview_pdf_converter'),
    previewPdfConverterVersion: text('preview_pdf_converter_version'),
    previewPdfCreatedAt: timestamp('preview_pdf_created_at', { mode: 'date', withTimezone: true }),
    previewPdfEncryptionKeyWrapped: text('preview_pdf_encryption_key_wrapped'),
    previewPdfEncryptionKekVersion: text('preview_pdf_encryption_kek_version'),
    previewPdfEncryptionAlgorithm: text('preview_pdf_encryption_algorithm'),

    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    content: text('content').notNull().default(''),
    rawText: text('raw_text').notNull().default(''),
    rawMarkdown: text('raw_markdown').notNull().default(''),
    parserStructuredOutput: jsonb('parser_structured_output').$type<Record<string, unknown>>(),
    language: jsonb('language_metadata').$type<DocumentVersionLanguageMetadata>(),
    parserEngine: text('parser_engine'),
    parserEngineVersion: text('parser_engine_version'),
    parserWarnings: jsonb('parser_warnings').$type<string[]>(),
    processingStatus: text('processing_status')
      .$type<DocumentVersionProcessingStatus>()
      .notNull()
      .default('pending'),
    processingErrorCode: text('processing_error_code'),
    processingErrorMessage: text('processing_error_message'),
    processingFailedAt: timestamp('processing_failed_at', { mode: 'date', withTimezone: true }),

    fileEncryptionKeyWrapped: text('file_encryption_key_wrapped'),
    fileEncryptionKekVersion: text('file_encryption_kek_version'),
    fileEncryptionAlgorithm: text('file_encryption_algorithm'),

    currentVersionId: text('current_version_id'),

    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    deletedBy: text('deleted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [
    unique('documents_id_vault_unique').on(table.id, table.vaultId),
    uniqueIndex('documents_active_folder_filename_unique')
      .using(
        'btree',
        table.vaultId,
        sql`coalesce(${table.folderId}, '')`,
        sql`lower(${table.originalName})`,
      )
      .where(sql`${table.isDeleted} = false`),
    index('documents_vault_deleted_created_idx').on(
      table.vaultId,
      table.isDeleted,
      table.createdAt,
    ),
    index('documents_vault_deleted_idx').on(table.vaultId, table.isDeleted),
    index('documents_vault_folder_deleted_created_idx').on(
      table.vaultId,
      table.folderId,
      table.isDeleted,
      table.createdAt,
    ),
    index('documents_processing_status_idx').on(table.processingStatus),
    index('documents_language_metadata_gin_idx').using('gin', table.language),
    index('documents_language_code_idx')
      .using('btree', sql`(${table.language}->>'code')`)
      .where(sql`${table.language} IS NOT NULL`),
    index('documents_hash_idx').on(table.originalSha256Hash),
    index('documents_kek_version_idx').on(table.fileEncryptionKekVersion),
    index('documents_current_version_idx').on(table.currentVersionId),
  ],
);

export type DocumentVersionLanguageMetadata = {
  code: string;
  name: string;
  confidence?: number | null;
  source: 'docling' | 'heuristic' | 'user';
};

export type DocumentVersionProcessingStatus =
  | 'pending'
  | 'queued'
  | 'partitioning'
  | 'chunking'
  | 'summarising'
  | 'completed'
  | 'failed';

export const documentVersionsTable = pgTable(
  'document_versions',
  {
    ...createPrimaryKeyField({ prefix: 'dvr' }),
    ...createTimestampColumns(),

    documentId: text('document_id')
      .notNull()
      .references((): AnyPgColumn => documentsTable.id, { onDelete: 'cascade' }),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    versionNumber: integer('version_number').notNull(),

    uploadedBy: text('uploaded_by').references(() => usersTable.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),

    originalName: text('original_name').notNull(),
    originalSize: integer('original_size').notNull().default(0),
    originalStorageKey: text('original_storage_key').notNull(),
    originalSha256Hash: text('original_sha256_hash').notNull(),
    mimeType: text('mime_type').notNull(),

    previewPdfStorageKey: text('preview_pdf_storage_key'),
    previewPdfSize: integer('preview_pdf_size'),
    previewPdfSha256Hash: text('preview_pdf_sha256_hash'),
    previewPdfConverter: text('preview_pdf_converter'),
    previewPdfConverterVersion: text('preview_pdf_converter_version'),
    previewPdfCreatedAt: timestamp('preview_pdf_created_at', { mode: 'date', withTimezone: true }),
    previewPdfEncryptionKeyWrapped: text('preview_pdf_encryption_key_wrapped'),
    previewPdfEncryptionKekVersion: text('preview_pdf_encryption_kek_version'),
    previewPdfEncryptionAlgorithm: text('preview_pdf_encryption_algorithm'),

    content: text('content').notNull().default(''),
    rawText: text('raw_text').notNull().default(''),
    rawMarkdown: text('raw_markdown').notNull().default(''),
    parserStructuredOutput: jsonb('parser_structured_output').$type<Record<string, unknown>>(),
    language: jsonb('language_metadata').$type<DocumentVersionLanguageMetadata>(),
    parserEngine: text('parser_engine'),
    parserEngineVersion: text('parser_engine_version'),
    parserWarnings: jsonb('parser_warnings').$type<string[]>(),
    processingStatus: text('processing_status')
      .$type<DocumentVersionProcessingStatus>()
      .notNull()
      .default('pending'),
    processingErrorCode: text('processing_error_code'),
    processingErrorMessage: text('processing_error_message'),
    processingFailedAt: timestamp('processing_failed_at', { mode: 'date', withTimezone: true }),

    fileEncryptionKeyWrapped: text('file_encryption_key_wrapped'),
    fileEncryptionKekVersion: text('file_encryption_kek_version'),
    fileEncryptionAlgorithm: text('file_encryption_algorithm'),

    restoredFromVersionId: text('restored_from_version_id').references(
      (): AnyPgColumn => documentVersionsTable.id,
      { onDelete: 'set null' },
    ),

    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    deletedBy: text('deleted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [
    unique('document_versions_document_number_unique').on(table.documentId, table.versionNumber),
    unique('document_versions_id_document_vault_unique').on(
      table.id,
      table.documentId,
      table.vaultId,
    ),
    index('document_versions_vault_document_number_idx').on(
      table.vaultId,
      table.documentId,
      table.versionNumber.desc(),
    ),
    index('document_versions_vault_status_uploaded_idx').on(
      table.vaultId,
      table.processingStatus,
      table.uploadedAt,
    ),
    index('document_versions_vault_hash_idx').on(table.vaultId, table.originalSha256Hash),
    index('document_versions_kek_version_idx').on(table.fileEncryptionKekVersion),
    index('document_versions_deleted_idx').on(table.deletedAt),
    check('document_versions_version_number_positive', sql`${table.versionNumber} > 0`),
  ],
);
