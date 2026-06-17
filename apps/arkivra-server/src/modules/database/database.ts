import type { Config } from '../config/config.js';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof setupDatabase>['db'];

export function setupDatabase({ config }: { config: Config }) {
  const pool = new Pool({
    connectionString: config.database.url,
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}
