import { index, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { usersTable } from './users.table.js';

export const vaultsTable = pgTable(
  'vaults',
  {
    ...createPrimaryKeyField({ prefix: 'vlt' }),
    ...createTimestampColumns(),

    name: text('name').notNull(),
    description: text('description'),

    createdBy: text('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    deletedBy: text('deleted_by').references(() => usersTable.id, { onDelete: 'set null' }),
  },
  (table) => [index('vaults_deleted_at_idx').on(table.deletedAt)],
);

export const vaultMembersTable = pgTable(
  'vault_members',
  {
    ...createPrimaryKeyField({ prefix: 'vlt_mbr' }),
    ...createTimestampColumns(),

    vaultId: text('vault_id')
      .notNull()
      .references(() => vaultsTable.id, { onDelete: 'cascade' }),

    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),

    role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
  },
  (table) => [
    unique('vault_members_vault_user_unique').on(table.vaultId, table.userId),
    index('vault_members_user_id_idx').on(table.userId),
  ],
);
