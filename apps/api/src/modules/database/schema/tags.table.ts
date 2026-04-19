import { pgTable, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { vaultsTable } from './vaults.table.js';
import { documentsTable } from './documents.table.js';

export const tagsTable = pgTable(
  'tags',
  {
    ...createPrimaryKeyField({ prefix: 'tag' }),
    ...createTimestampColumns(),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    color: text('color'),
    description: text('description'),
  },
  (table) => [unique('tags_vault_name_unique').on(table.vaultId, table.name)],
);

export const documentTagsTable = pgTable(
  'document_tags',
  {
    documentId: text('document_id')
      .notNull()
      .references(() => documentsTable.id, { onDelete: 'cascade' }),

    tagId: text('tag_id')
      .notNull()
      .references(() => tagsTable.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.documentId, table.tagId] }),
  }),
);
