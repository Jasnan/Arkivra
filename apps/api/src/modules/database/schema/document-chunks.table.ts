import { index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField } from './helpers.js';
import { documentsTable } from './documents.table.js';
import { vaultsTable } from './vaults.table.js';

// Note: pgvector column and tsvector column are created in raw SQL migration
// because drizzle-orm/pg-core doesn't have native pgvector/tsvector support.
// The Drizzle schema here defines all non-vector/tsvector columns.
// The migration SQL will add:
//   - embedding vector(768) (nullable, for V2 AI)
//   - tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
//   - GIN index on tsv
//   - HNSW index on embedding

export const documentChunksTable = pgTable(
  'document_chunks',
  {
    ...createPrimaryKeyField({ prefix: 'chk' }),

    documentId: text('document_id')
      .notNull()
      .references(() => documentsTable.id, { onDelete: 'cascade' }),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    chunkIndex: integer('chunk_index').notNull(),
    chunkKey: text('chunk_key').notNull(),
    content: text('content').notNull(),
    section: text('section'),
    pageNumber: integer('page_number'),
    chunkType: text('chunk_type'),
    tokenCount: integer('token_count'),
    parserEngine: text('parser_engine'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('document_chunks_doc_index_unique').on(table.documentId, table.chunkIndex),
    index('document_chunks_vault_doc_idx').on(table.vaultId, table.documentId),
  ],
);
