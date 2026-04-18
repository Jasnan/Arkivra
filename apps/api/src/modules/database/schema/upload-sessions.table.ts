import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { vaultsTable } from './vaults.table.js';
import { usersTable } from './users.table.js';
import { documentsTable } from './documents.table.js';

export const uploadSessionsTable = pgTable(
  'upload_sessions',
  {
    ...createPrimaryKeyField({ prefix: 'upl' }),
    ...createTimestampColumns(),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),

    documentId: text('document_id').references(() => documentsTable.id, { onDelete: 'set null' }),

    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    totalSize: integer('total_size').notNull(),
    partSize: integer('part_size').notNull(),
    partCount: integer('part_count').notNull(),
    bytesReceived: integer('bytes_received').notNull().default(0),
    uploadedPartsJson: text('uploaded_parts_json').notNull().default('[]'),
    stagingKey: text('staging_key').notNull(),
    status: text('status').notNull().default('initialized'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    expiresAt: timestamp('expires_at', { mode: 'date' }),
    completedAt: timestamp('completed_at', { mode: 'date' }),
  },
  table => [
    index('upload_sessions_vault_user_idx').on(table.vaultId, table.userId),
    index('upload_sessions_status_idx').on(table.status),
    index('upload_sessions_document_idx').on(table.documentId),
  ],
);
