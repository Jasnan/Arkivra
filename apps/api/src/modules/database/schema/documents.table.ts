import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
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

    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    content: text('content').notNull().default(''),
    rawText: text('raw_text').notNull().default(''),
    rawMarkdown: text('raw_markdown').notNull().default(''),
    parserStructuredOutput: jsonb('parser_structured_output').$type<Record<string, unknown>>(),
    parserEngine: text('parser_engine'),
    parserEngineVersion: text('parser_engine_version'),
    parserWarnings: jsonb('parser_warnings').$type<string[]>(),
    processingStatus: text('processing_status').notNull().default('pending'),
    documentDate: timestamp('document_date', { mode: 'date' }),

    fileEncryptionKeyWrapped: text('file_encryption_key_wrapped'),
    fileEncryptionKekVersion: text('file_encryption_kek_version'),
    fileEncryptionAlgorithm: text('file_encryption_algorithm'),

    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
    deletedBy: text('deleted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('documents_vault_hash_unique')
      .on(table.vaultId, table.originalSha256Hash)
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
    index('documents_hash_idx').on(table.originalSha256Hash),
    index('documents_kek_version_idx').on(table.fileEncryptionKekVersion),
  ],
);
