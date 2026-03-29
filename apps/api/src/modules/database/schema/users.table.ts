import { boolean, index, pgTable, text } from 'drizzle-orm/pg-core';
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
  },
  table => [
    index('users_email_idx').on(table.email),
  ],
);
