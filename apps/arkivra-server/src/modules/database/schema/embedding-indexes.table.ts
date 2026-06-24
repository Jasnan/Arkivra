import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { createCreatedAtField, createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { aiProviderConfigsTable } from './ai-provider-configs.table.js';
import { documentChunksTable } from './document-chunks.table.js';
import { documentsTable, documentVersionsTable } from './documents.table.js';
import { vaultsTable } from './vaults.table.js';

export type EmbeddingIndexStatus =
  | 'building'
  | 'ready'
  | 'active'
  | 'failed'
  | 'retiring'
  | 'retired';

export type DocumentEmbeddingIndexStatus =
  | 'pending'
  | 'indexing'
  | 'ready'
  | 'failed'
  | 'stale'
  | 'skipped';

export const embeddingIndexesTable = pgTable(
  'embedding_indexes',
  {
    ...createPrimaryKeyField({ prefix: 'eix' }),
    providerConfigId: text('provider_config_id')
      .notNull()
      .references(() => aiProviderConfigsTable.id),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    dimensions: integer('dimensions').notNull(),
    distanceMetric: text('distance_metric').notNull().default('cosine'),
    status: text('status').$type<EmbeddingIndexStatus>().notNull(),
    isActive: boolean('is_active').notNull().default(false),
    expectedChunkCount: integer('expected_chunk_count').notNull().default(0),
    embeddedChunkCount: integer('embedded_chunk_count').notNull().default(0),
    failedChunkCount: integer('failed_chunk_count').notNull().default(0),
    failureMessage: text('failure_message'),
    buildStartedAt: timestamp('build_started_at', { mode: 'date', withTimezone: true }),
    buildCompletedAt: timestamp('build_completed_at', { mode: 'date', withTimezone: true }),
    activatedAt: timestamp('activated_at', { mode: 'date', withTimezone: true }),
    ...createTimestampColumns(),
  },
  (table) => [index('embedding_indexes_provider_config_idx').on(table.providerConfigId)],
);

// The pgvector `embedding` column is managed by SQL migrations. Drizzle
// tracks the relational metadata used by service helpers.
export const documentChunkEmbeddingsTable = pgTable(
  'document_chunk_embeddings',
  {
    ...createPrimaryKeyField({ prefix: 'dce' }),
    embeddingIndexId: text('embedding_index_id')
      .notNull()
      .references(() => embeddingIndexesTable.id, { onDelete: 'cascade' }),
    chunkId: text('chunk_id')
      .notNull()
      .references(() => documentChunksTable.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documentsTable.id, { onDelete: 'cascade' }),
    documentVersionId: text('document_version_id')
      .notNull()
      .references(() => documentVersionsTable.id, { onDelete: 'cascade' }),
    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),
    contentSha256: text('content_sha256').notNull(),
    ...createCreatedAtField(),
  },
  (table) => [
    unique('document_chunk_embeddings_index_chunk_unique').on(
      table.embeddingIndexId,
      table.chunkId,
    ),
    index('document_chunk_embeddings_index_doc_idx').on(table.embeddingIndexId, table.documentId),
    index('document_chunk_embeddings_index_version_idx').on(
      table.embeddingIndexId,
      table.documentVersionId,
    ),
    index('document_chunk_embeddings_index_doc_version_idx').on(
      table.embeddingIndexId,
      table.documentId,
      table.documentVersionId,
    ),
    index('document_chunk_embeddings_index_vault_idx').on(table.embeddingIndexId, table.vaultId),
    foreignKey({
      name: 'document_chunk_embeddings_version_document_vault_fkey',
      columns: [table.documentVersionId, table.documentId, table.vaultId],
      foreignColumns: [
        documentVersionsTable.id,
        documentVersionsTable.documentId,
        documentVersionsTable.vaultId,
      ],
    }).onDelete('cascade'),
  ],
);

export const documentEmbeddingIndexStatusTable = pgTable(
  'document_embedding_index_status',
  {
    embeddingIndexId: text('embedding_index_id')
      .notNull()
      .references(() => embeddingIndexesTable.id, { onDelete: 'cascade' }),
    documentId: text('document_id')
      .notNull()
      .references(() => documentsTable.id, { onDelete: 'cascade' }),
    documentVersionId: text('document_version_id')
      .notNull()
      .references(() => documentVersionsTable.id, { onDelete: 'cascade' }),
    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),
    status: text('status').$type<DocumentEmbeddingIndexStatus>().notNull(),
    expectedChunkCount: integer('expected_chunk_count').notNull().default(0),
    embeddedChunkCount: integer('embedded_chunk_count').notNull().default(0),
    failureMessage: text('failure_message'),
    attempts: integer('attempts').notNull().default(0),
    indexedAt: timestamp('indexed_at', { mode: 'date', withTimezone: true }),
    ...createTimestampColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.embeddingIndexId, table.documentVersionId] }),
    index('document_embedding_index_status_vault_idx').on(table.embeddingIndexId, table.vaultId),
    index('document_embedding_index_status_doc_version_idx').on(
      table.embeddingIndexId,
      table.documentId,
      table.documentVersionId,
    ),
    foreignKey({
      name: 'document_embedding_index_status_version_document_vault_fkey',
      columns: [table.documentVersionId, table.documentId, table.vaultId],
      foreignColumns: [
        documentVersionsTable.id,
        documentVersionsTable.documentId,
        documentVersionsTable.vaultId,
      ],
    }).onDelete('cascade'),
  ],
);
