import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createPrimaryKeyField, createTimestampColumns } from './helpers.js';

export const usersTable = pgTable(
  'users',
  {
    ...createPrimaryKeyField({ prefix: 'usr' }),
    ...createTimestampColumns(),

    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name'),
    image: text('image'),
    twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
    systemRole: text('system_role', { enum: ['admin', 'member'] }).notNull().default('member'),
    disabledAt: timestamp('disabled_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_disabled_at_idx').on(table.disabledAt),
  ],
);
