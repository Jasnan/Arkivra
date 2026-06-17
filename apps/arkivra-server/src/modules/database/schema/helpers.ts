import { text, timestamp } from 'drizzle-orm/pg-core';
import { init } from '@paralleldrive/cuid2';

const ID_RANDOM_PART_LENGTH = 24;
const createId = init({ length: ID_RANDOM_PART_LENGTH });

export function generateId({ prefix }: { prefix?: string } = {}) {
  const id = createId();
  return prefix !== undefined ? `${prefix}_${id}` : id;
}

export function createPrimaryKeyField({ prefix }: { prefix?: string } = {}) {
  return {
    id: text('id')
      .primaryKey()
      .$default(() => generateId({ prefix })),
  };
}

export function createTimestampColumns() {
  return {
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
  };
}

export function createCreatedAtField() {
  return {
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  };
}
