import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { usersTable } from './users.table.js';

// Better Auth session table
export const authSessionsTable = pgTable('auth_sessions', {
  id: text('id').primaryKey(),

  userId: text('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),

  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),

  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});

// Better Auth account table (OAuth providers, credentials)
export const authAccountsTable = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),

    userId: text('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),

    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer').notNull(),

    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date', withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date', withTimezone: true }),

    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),

    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_accounts_issuer_account_id_unique').on(table.issuer, table.accountId),
  ],
);

// Better Auth verification table (email verification, password reset)
export const authVerificationsTable = pgTable('auth_verifications', {
  id: text('id').primaryKey(),

  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),

  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});

// Better Auth two-factor table
export const authTwoFactorTable = pgTable('auth_two_factor', {
  id: text('id').primaryKey(),

  userId: text('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),

  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),

  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
});
