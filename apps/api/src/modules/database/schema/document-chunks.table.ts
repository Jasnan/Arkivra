import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { createPrimaryKeyField } from './helpers.js';
import { documentsTable, documentVersionsTable } from './documents.table.js';
import { vaultsTable } from './vaults.table.js';

// Note: the tsvector column is created in raw SQL migration because
// drizzle-orm/pg-core doesn't have native tsvector support. Embeddings live
// in document_chunk_embeddings so provider changes do not alter this table.

export const documentChunksTable = pgTable(
  'document_chunks',
  {
    ...createPrimaryKeyField({ prefix: 'chk' }),

    documentId: text('document_id')
      .notNull()
      .references(() => documentsTable.id, { onDelete: 'cascade' }),

    documentVersionId: text('document_version_id')
      .notNull()
      .references(() => documentVersionsTable.id, { onDelete: 'cascade' }),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    chunkIndex: integer('chunk_index').notNull(),
    chunkKey: text('chunk_key').notNull(),
    content: text('content').notNull(),
    section: text('section'),
    sectionPath: jsonb('section_path').$type<string[]>(),
    pageNumber: integer('page_number'),
    chunkType: text('chunk_type'),
    tokenCount: integer('token_count'),
    contentSha256: text('content_sha256'),
    parserEngine: text('parser_engine'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Citation-grade provenance (added in 0009_chunk_provenance.sql).
    pageStart: integer('page_start'),
    pageEnd: integer('page_end'),
    boundingBoxes: jsonb('bounding_boxes').$type<ChunkBoundingBox[]>(),
    sourceElementIds: jsonb('source_element_ids').$type<string[]>(),
    parentElementId: text('parent_element_id'),
    originalText: text('original_text'),
    tablesHtml: jsonb('tables_html').$type<string[]>(),
    citationPrecision: text('citation_precision').notNull().default('document'),

    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('document_chunks_version_index_unique').on(table.documentVersionId, table.chunkIndex),
    index('document_chunks_vault_doc_idx').on(table.vaultId, table.documentId),
    index('document_chunks_vault_version_idx').on(table.vaultId, table.documentVersionId),
    index('document_chunks_page_idx').on(table.documentId, table.pageStart, table.pageEnd),
    index('document_chunks_version_page_idx').on(
      table.documentVersionId,
      table.pageStart,
      table.pageEnd,
    ),
    foreignKey({
      name: 'document_chunks_version_document_vault_fkey',
      columns: [table.documentVersionId, table.documentId, table.vaultId],
      foreignColumns: [
        documentVersionsTable.id,
        documentVersionsTable.documentId,
        documentVersionsTable.vaultId,
      ],
    }).onDelete('cascade'),
  ],
);

export type ChunkBoundingBox = {
  pageNumber: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layoutWidth: number;
  layoutHeight: number;
  system: string;
};

export type ChunkCitationPrecision = 'box' | 'page' | 'document';
