import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { documentsTable, documentVersionsTable } from './documents.table.js';
import { vaultsTable } from './vaults.table.js';
import type { ChunkBoundingBox } from './document-chunks.table.js';

export const documentElementProvenanceTable = pgTable(
  'document_element_provenance',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documentsTable.id, { onDelete: 'cascade' }),
    documentVersionId: text('document_version_id')
      .notNull()
      .references(() => documentVersionsTable.id, { onDelete: 'cascade' }),
    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),
    elementId: text('element_id').notNull(),
    parentElementId: text('parent_element_id'),
    elementType: text('element_type').notNull(),
    text: text('text').notNull().default(''),
    pageNumber: integer('page_number'),
    bbox: jsonb('bbox').$type<ChunkBoundingBox>(),
    section: text('section'),
    sectionPath: jsonb('section_path').$type<string[]>(),
    sortIndex: integer('sort_index').notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.documentVersionId, table.elementId],
      name: 'document_element_provenance_pk',
    }),
    index('document_element_provenance_version_sort_idx').on(
      table.documentVersionId,
      table.sortIndex,
    ),
    index('document_element_provenance_version_page_idx').on(
      table.documentVersionId,
      table.pageNumber,
    ),
    foreignKey({
      name: 'document_element_provenance_version_document_vault_fkey',
      columns: [table.documentVersionId, table.documentId, table.vaultId],
      foreignColumns: [
        documentVersionsTable.id,
        documentVersionsTable.documentId,
        documentVersionsTable.vaultId,
      ],
    }).onDelete('cascade'),
  ],
);
