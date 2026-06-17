import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { usersTable } from './users.table.js';
import { vaultsTable } from './vaults.table.js';

export const vaultFoldersTable = pgTable(
  'vault_folders',
  {
    ...createPrimaryKeyField({ prefix: 'fld' }),
    ...createTimestampColumns(),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    parentId: text('parent_id').references(
      (): AnyPgColumn => vaultFoldersTable.id,
      { onDelete: 'cascade' },
    ),

    createdBy: text('created_by').references(() => usersTable.id, { onDelete: 'set null' }),

    name: text('name').notNull(),

    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
    deletedBy: text('deleted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('vault_folders_vault_parent_deleted_name_idx').on(
      table.vaultId,
      table.parentId,
      table.isDeleted,
      table.name,
    ),
    index('vault_folders_parent_idx').on(table.parentId),
    index('vault_folders_deleted_idx').on(table.vaultId, table.isDeleted),
    uniqueIndex('vault_folders_active_sibling_name_unique')
      .using('btree', table.vaultId, sql`coalesce(${table.parentId}, '__root__')`, sql`lower(${table.name})`)
      .where(sql`${table.isDeleted} = false`),
  ],
);
