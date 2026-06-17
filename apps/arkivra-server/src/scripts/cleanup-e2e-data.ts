import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

type CleanupOptions = {
  dryRun: boolean;
  yes: boolean;
};

type CleanupResult = {
  label: string;
  count: number;
};

const DEFAULT_DATABASE_URL = 'postgres://arkivra:arkivra@localhost:5432/arkivra';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

const testEmailPatterns = [
  'e2e-%@example.com',
  'docling-fixture-%@example.com',
  'restore-%@example.com',
  'versioning-smoke-%@example.com',
  'auth-admin-%@example.com',
  'auth-owner-%@example.com',
  'auth-member-%@example.com',
  'background-%@example.com',
  'backup-%@example.com',
];

const testVaultNames = [
  'Backups Vault',
  'Background Jobs Vault',
  'Docling Fixture Vault',
  'E2E Vault',
  'Owner Vault',
  'Restore collision',
  'Restore existing',
  'Restore failure',
  'Restore full',
  'Restore partial',
  'Versioning Smoke Vault',
];

const testDocumentNames = [
  'allowed.txt',
  'arkivra-bulk-e2e.pdf',
  'arkivra-e2e.pdf',
  'arkivra-reupload.pdf',
  'backup.pdf',
  'docling-fixture.pdf',
  'expired.pdf',
  'invoice.pdf',
  'smoke.txt',
];

const tempDirectoryPrefixes = [
  'arkivra-auth-storage-',
  'arkivra-background-jobs-e2e-',
  'arkivra-backups-e2e-',
  'arkivra-backups-storage-',
  'arkivra-docling-fixture-e2e-',
  'arkivra-documents-e2e-',
  'arkivra-persist-e2e-',
];

function usage() {
  console.info(`Clean up data left behind by Arkivra e2e tests.

Usage:
  pnpm db:cleanup:e2e [--yes] [--dry-run]

Options:
  --yes      Skip the typed confirmation prompt.
  --dry-run  Print what would be removed without deleting anything.
  -h, --help Show this help message.`);
}

function parseArgs(argv: string[]): CleanupOptions {
  const options: CleanupOptions = {
    dryRun: false,
    yes: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case '--':
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--yes':
        options.yes = true;
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        usage();
        process.exit(1);
    }
  }

  return options;
}

async function confirm(options: CleanupOptions) {
  if (options.yes || options.dryRun) {
    return;
  }

  console.info('This will delete data matching Arkivra e2e test fingerprints.');
  console.info('Stop local API and worker processes before continuing.');
  console.info('Type CLEAN_E2E to continue:');

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const response = await readline.question('');
    if (response !== 'CLEAN_E2E') {
      console.info('Cleanup cancelled.');
      process.exit(0);
    }
  } finally {
    readline.close();
  }
}

function getDatabaseUrl() {
  return process.env.ARKIVRA_DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

function getAdminDatabaseUrl(databaseUrl: string) {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  return adminUrl.toString();
}

function redactedDatabaseUrl(databaseUrl: string) {
  return databaseUrl.replace(/\/\/.*@/, '//<credentials>@');
}

function parseEnvLine(line: string) {
  const trimmed = line.trim();

  if (trimmed.length === 0 || trimmed.startsWith('#')) {
    return null;
  }

  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed;
  const separatorIndex = normalized.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  const key = normalized.slice(0, separatorIndex).trim();
  let value = normalized.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

async function loadEnvFileIfExists(path: string) {
  const content = await readFile(path, 'utf8').catch(() => null);

  if (content === null) {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);

    if (parsed !== null && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

async function loadLocalEnvFiles() {
  await loadEnvFileIfExists(resolve(scriptDirectory, '../../../../.env'));
  await loadEnvFileIfExists(resolve(scriptDirectory, '../../.env'));
}

async function runQuery(
  pool: Pool,
  label: string,
  sql: string,
  dryRun: boolean,
): Promise<CleanupResult> {
  if (dryRun) {
    const result = await pool.query<{ count: string }>(
      `WITH affected AS (${sql}) SELECT count(*)::int FROM affected`,
    );
    return { label, count: Number(result.rows[0]?.count ?? 0) };
  }

  const result = await pool.query(sql);
  return { label, count: result.rowCount ?? 0 };
}

async function runQueryWithParams(
  pool: Pool,
  label: string,
  sql: string,
  values: unknown[],
  dryRun: boolean,
): Promise<CleanupResult> {
  if (dryRun) {
    const result = await pool.query<{ count: string }>(
      `WITH affected AS (${sql}) SELECT count(*)::int FROM affected`,
      values,
    );
    return { label, count: Number(result.rows[0]?.count ?? 0) };
  }

  const result = await pool.query(sql, values);
  return { label, count: result.rowCount ?? 0 };
}

async function cleanSharedDatabase(pool: Pool, dryRun: boolean) {
  await pool.query('BEGIN');

  try {
    await pool.query('CREATE TEMP TABLE e2e_cleanup_users (id text PRIMARY KEY) ON COMMIT DROP');
    await pool.query('CREATE TEMP TABLE e2e_cleanup_vaults (id text PRIMARY KEY) ON COMMIT DROP');
    await pool.query(
      'CREATE TEMP TABLE e2e_cleanup_documents (id text PRIMARY KEY) ON COMMIT DROP',
    );
    await pool.query('CREATE TEMP TABLE e2e_cleanup_tags (id text PRIMARY KEY) ON COMMIT DROP');

    await pool.query(
      `
        INSERT INTO e2e_cleanup_users (id)
        SELECT id
        FROM users
        WHERE ${testEmailPatterns.map((_, index) => `email LIKE $${index + 1}`).join(' OR ')}
        ON CONFLICT DO NOTHING
      `,
      testEmailPatterns,
    );

    await pool.query(
      `
        INSERT INTO e2e_cleanup_vaults (id)
        SELECT DISTINCT vault_id
        FROM vault_members
        WHERE user_id IN (SELECT id FROM e2e_cleanup_users)
        UNION
        SELECT id
        FROM vaults
        WHERE id LIKE 'vlt_bg_%'
           OR id LIKE 'vlt_restore-%'
           OR id LIKE 'vlt_versioning-smoke-%'
           OR name = ANY($1)
        ON CONFLICT DO NOTHING
      `,
      [testVaultNames],
    );

    await pool.query(
      `
        INSERT INTO e2e_cleanup_documents (id)
        SELECT id
        FROM documents
        WHERE vault_id IN (SELECT id FROM e2e_cleanup_vaults)
           OR created_by IN (SELECT id FROM e2e_cleanup_users)
           OR id LIKE 'doc_bg_%'
           OR id LIKE 'doc_restore-%'
           OR id LIKE 'doc_versioning-smoke-%'
           OR original_name = ANY($1)
           OR name = ANY($1)
        ON CONFLICT DO NOTHING
      `,
      [testDocumentNames],
    );

    await pool.query(
      `
        INSERT INTO e2e_cleanup_vaults (id)
        SELECT DISTINCT vault_id
        FROM documents
        WHERE id IN (SELECT id FROM e2e_cleanup_documents)
        ON CONFLICT DO NOTHING
      `,
    );

    await pool.query(
      `
        INSERT INTO e2e_cleanup_documents (id)
        SELECT id
        FROM documents
        WHERE vault_id IN (SELECT id FROM e2e_cleanup_vaults)
        ON CONFLICT DO NOTHING
      `,
    );

    await pool.query(
      `
        INSERT INTO e2e_cleanup_tags (id)
        SELECT t.id
        FROM tags t
        LEFT JOIN document_tags dt ON dt.tag_id = t.id
        WHERE t.name ~ '^Important [0-9]+-[a-z0-9]{8}$'
          AND (
            dt.document_id IS NULL
            OR dt.document_id IN (SELECT id FROM e2e_cleanup_documents)
          )
        ON CONFLICT DO NOTHING
      `,
    );

    const results: CleanupResult[] = [];

    results.push(
      await runQuery(
        pool,
        'background jobs',
        `
        DELETE FROM background_jobs
        WHERE id IN (
          SELECT id
          FROM background_jobs
          WHERE (payload->>'documentId') IN (SELECT id FROM e2e_cleanup_documents)
             OR (payload->>'vaultId') IN (SELECT id FROM e2e_cleanup_vaults)
             OR id IN (SELECT 'process-doc-' || id FROM e2e_cleanup_documents)
             OR queue_name ~ '^[0-9]+-[a-z0-9]{8}:maintenance$'
        )
        RETURNING id
      `,
        dryRun,
      ),
    );

    results.push(
      await runQuery(
        pool,
        'upload sessions',
        `
        DELETE FROM upload_sessions
        WHERE id IN (
          SELECT id
          FROM upload_sessions
          WHERE vault_id IN (SELECT id FROM e2e_cleanup_vaults)
             OR user_id IN (SELECT id FROM e2e_cleanup_users)
             OR document_id IN (SELECT id FROM e2e_cleanup_documents)
        )
        RETURNING id
      `,
        dryRun,
      ),
    );

    results.push(
      await runQuery(
        pool,
        'documents',
        `
        DELETE FROM documents
        WHERE id IN (SELECT id FROM e2e_cleanup_documents)
        RETURNING id
      `,
        dryRun,
      ),
    );

    results.push(
      await runQuery(
        pool,
        'vaults',
        `
        DELETE FROM vaults
        WHERE id IN (SELECT id FROM e2e_cleanup_vaults)
        RETURNING id
      `,
        dryRun,
      ),
    );

    results.push(
      await runQuery(
        pool,
        'users',
        `
        DELETE FROM users
        WHERE id IN (SELECT id FROM e2e_cleanup_users)
        RETURNING id
      `,
        dryRun,
      ),
    );

    results.push(
      await runQueryWithParams(
        pool,
        'auth verifications',
        `
        DELETE FROM auth_verifications
        WHERE ${testEmailPatterns.map((_, index) => `identifier LIKE $${index + 1}`).join(' OR ')}
        RETURNING id
      `,
        testEmailPatterns,
        dryRun,
      ),
    );

    results.push(
      await runQuery(
        pool,
        'tags',
        `
        DELETE FROM tags
        WHERE id IN (SELECT id FROM e2e_cleanup_tags)
          AND NOT EXISTS (
            SELECT 1
            FROM document_tags
            WHERE document_tags.tag_id = tags.id
          )
        RETURNING id
      `,
        dryRun,
      ),
    );

    if (dryRun) {
      await pool.query('ROLLBACK');
    } else {
      await pool.query('COMMIT');
    }

    return results;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function cleanIsolatedDatabases(adminPool: Pool, dryRun: boolean) {
  const { rows } = await adminPool.query<{ datname: string }>(
    `
      SELECT datname
      FROM pg_database
      WHERE datname ~ '^arkivra_(migrations|persist|backups)_e2e_[0-9]+_[a-z0-9]+$'
      ORDER BY datname
    `,
  );

  if (dryRun) {
    return rows.map(({ datname }) => datname);
  }

  for (const { datname } of rows) {
    await adminPool.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1
          AND pid <> pg_backend_pid()
      `,
      [datname],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${datname.replaceAll('"', '""')}"`);
  }

  return rows.map(({ datname }) => datname);
}

async function cleanTempDirectories(dryRun: boolean) {
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => tempDirectoryPrefixes.some((prefix) => name.startsWith(prefix)));

  if (!dryRun) {
    await Promise.all(
      directories.map((directory) =>
        rm(join(tmpdir(), directory), { recursive: true, force: true }),
      ),
    );
  }

  return directories;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadLocalEnvFiles();
  await confirm(options);

  const databaseUrl = getDatabaseUrl();
  console.info(`Database: ${redactedDatabaseUrl(databaseUrl)}`);
  console.info(options.dryRun ? 'Mode: dry run' : 'Mode: delete');

  const pool = new Pool({ connectionString: databaseUrl });
  const adminPool = new Pool({ connectionString: getAdminDatabaseUrl(databaseUrl) });

  try {
    const databaseResults = await cleanSharedDatabase(pool, options.dryRun);
    const isolatedDatabases = await cleanIsolatedDatabases(adminPool, options.dryRun);
    const tempDirectories = await cleanTempDirectories(options.dryRun);

    console.info('\nShared database rows:');
    for (const result of databaseResults) {
      console.info(`- ${result.label}: ${result.count}`);
    }

    console.info('\nIsolated e2e databases:');
    if (isolatedDatabases.length === 0) {
      console.info('- none');
    } else {
      for (const database of isolatedDatabases) {
        console.info(`- ${database}`);
      }
    }

    console.info('\nTemp directories:');
    if (tempDirectories.length === 0) {
      console.info('- none');
    } else {
      for (const directory of tempDirectories) {
        console.info(`- ${join(tmpdir(), directory)}`);
      }
    }

    console.info(options.dryRun ? '\nNo data was deleted.' : '\nE2e leftovers have been removed.');
  } finally {
    await pool.end();
    await adminPool.end();
  }
}

main().catch((error) => {
  console.error('E2e cleanup failed:', error);
  process.exit(1);
});
