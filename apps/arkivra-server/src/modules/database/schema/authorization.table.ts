import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';
import { usersTable } from './users.table.js';
import { vaultMembersTable, vaultsTable } from './vaults.table.js';

export const systemCapabilitiesTable = pgTable(
  'system_capabilities',
  {
    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    capability: text('capability', { enum: ['system.create_vaults', 'system.use_ai'] }).notNull(),
    createdBy: text('created_by').references(() => usersTable.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.capability], name: 'system_capabilities_pk' }),
    index('system_capabilities_capability_idx').on(table.capability),
  ],
);

export const permissionRequestsTable = pgTable(
  'permission_requests',
  {
    ...createPrimaryKeyField({ prefix: 'perm_req' }),
    ...createTimestampColumns(),

    type: text('type', {
      enum: ['vault.create', 'vault.delete', 'vault.owner_promote', 'vault.external_invite'],
    }).notNull(),
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'cancelled'] })
      .notNull()
      .default('pending'),
    requestedBy: text('requested_by')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    reviewedBy: text('reviewed_by').references(() => usersTable.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { mode: 'date', withTimezone: true }),
    vaultId: text('vault_id').references(() => vaultsTable.id, { onDelete: 'cascade' }),
    targetUserId: text('target_user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb('result').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('permission_requests_status_created_idx').on(table.status, table.createdAt),
    index('permission_requests_requested_by_idx').on(table.requestedBy),
    index('permission_requests_vault_idx').on(table.vaultId),
  ],
);

export const emailInvitationsTable = pgTable(
  'email_invitations',
  {
    ...createPrimaryKeyField({ prefix: 'invite' }),
    ...createTimestampColumns(),

    type: text('type', { enum: ['platform_account', 'vault_member'] }).notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'revoked', 'expired'] })
      .notNull()
      .default('pending'),
    email: text('email').notNull(),
    tokenHash: text('token_hash'),
    invitedBy: text('invited_by').references(() => usersTable.id, { onDelete: 'set null' }),
    acceptedBy: text('accepted_by').references(() => usersTable.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at', { mode: 'date', withTimezone: true }),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),
    vaultId: text('vault_id').references(() => vaultsTable.id, { onDelete: 'cascade' }),
    vaultMemberId: text('vault_member_id').references(() => vaultMembersTable.id, { onDelete: 'set null' }),
    vaultRole: text('vault_role', { enum: ['owner', 'editor', 'viewer'] }),
    systemRole: text('system_role', { enum: ['admin', 'member'] }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    index('email_invitations_email_status_idx').on(table.email, table.status),
    index('email_invitations_token_hash_idx').on(table.tokenHash),
    index('email_invitations_vault_idx').on(table.vaultId),
    index('email_invitations_invited_by_idx').on(table.invitedBy),
  ],
);
