import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField } from './helpers.js';
import type { ChunkBoundingBox } from './document-chunks.table.js';
import { documentChunksTable } from './document-chunks.table.js';
import { documentsTable } from './documents.table.js';
import { vaultsTable } from './vaults.table.js';

// Image / table assets referenced from a chunk. Mirrors
// drizzle/0010_chunk_assets.sql. Image bytes live in the StorageDriver
// (encrypted with the document's KEK family); table HTML may be stored
// inline via inline_payload for small payloads. Vault scoping is
// denormalised to allow authorisation without a chunk join.

export type ChunkAssetType = 'image' | 'table';

export const documentChunkAssetsTable = pgTable(
  'document_chunk_assets',
  {
    ...createPrimaryKeyField({ prefix: 'cas' }),

    chunkId: text('chunk_id')
      .notNull()
      .references(() => documentChunksTable.id, { onDelete: 'cascade' }),

    documentId: text('document_id')
      .notNull()
      .references(() => documentsTable.id, { onDelete: 'cascade' }),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    assetType: text('asset_type').$type<ChunkAssetType>().notNull(),
    mimeType: text('mime_type'),
    storageKey: text('storage_key'),
    inlinePayload: text('inline_payload'),
    pageNumber: integer('page_number'),
    bbox: jsonb('bbox').$type<ChunkBoundingBox>(),
    byteSize: integer('byte_size'),
    sha256Hash: text('sha256_hash'),

    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('document_chunk_assets_chunk_idx').on(table.chunkId),
    index('document_chunk_assets_vault_doc_idx').on(table.vaultId, table.documentId),
  ],
);
