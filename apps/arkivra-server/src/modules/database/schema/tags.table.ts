import { sql } from 'drizzle-orm';
import { pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { documentsTable } from './documents.table.js';

export const tagsTable = pgTable(
  'tags',
  {
    ...createPrimaryKeyField({ prefix: 'tag' }),
    ...createTimestampColumns(),

    name: text('name').notNull(),
    color: text('color'),
    description: text('description'),
  },
  (table) => [
    uniqueIndex('tags_name_unique').using('btree', sql`lower(${table.name})`),
  ],
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
