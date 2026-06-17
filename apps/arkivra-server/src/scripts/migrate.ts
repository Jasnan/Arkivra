import process from 'node:process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function runMigrations() {
  const databaseUrl =
    process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@localhost:5432/arkivra';

  console.info('Running migrations...');
  console.info(`Database: ${databaseUrl.replace(/\/\/.*@/, '//<credentials>@')}`);

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.info('Migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
