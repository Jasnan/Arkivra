import { index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { usersTable } from './users.table.js';
import { vaultMembersTable } from './vaults.table.js';

export const userGlobalRolesTable = pgTable(
  'user_global_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['global_admin'] }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role], name: 'user_global_roles_pk' }),
    index('user_global_roles_role_idx').on(table.role),
  ],
);

export const vaultMemberPermissionsTable = pgTable(
  'vault_member_permissions',
  {
    vaultMemberId: text('vault_member_id')
      .notNull()
      .references(() => vaultMembersTable.id, { onDelete: 'cascade' }),
    permission: text('permission', {
      enum: [
        'documents.read',
        'documents.create',
        'documents.update',
        'documents.delete',
        'documents.download',
        'tags.manage',
        'members.invite',
        'members.manage',
      ],
    }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.vaultMemberId, table.permission],
      name: 'vault_member_permissions_pk',
    }),
    index('vault_member_permissions_permission_idx').on(table.permission),
  ],
);
