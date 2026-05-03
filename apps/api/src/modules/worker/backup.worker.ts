import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Database } from '../database/database.js';
import type { Pool } from 'pg';
import { BACKUP_QUEUE, CREATE_BACKUP_JOB, RESTORE_BACKUP_JOB } from './backup.queue.js';
import { AsyncJob, createPostgresWorker } from './postgres-jobs.js';

const execFileAsync = promisify(execFile);
const BACKUP_FORMAT_VERSION = 1;
const PUBLIC_TABLES_IN_RESTORE_ORDER = [
  'users',
  'user_global_roles',
  'vaults',
  'vault_members',
  'vault_member_permissions',
  'documents',
  'document_chunks',
  'tags',
  'document_tags',
  'auth_accounts',
  'auth_two_factor',
] as const;

type BackupWorkerDeps = {
  backupDirectory: string;
  db: Database;
  maintenanceFlagPath: string;
  pool: Pool;
  storageBasePath: string;
  version: string;
  startPolling?: boolean;
};

type RestoreBackupJobData = {
  backupId: string;
};

type CreateBackupResult = {
  backupId: string;
  filePath: string;
};

type RestoreBackupResult = {
  backupId: string;
  restored: true;
};

function sqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'string') {
    return `'${value.replaceAll("'", "''")}'`;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (value instanceof Date) {
    return `'${value.toISOString().replaceAll("'", "''")}'`;
  }

  return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
}

async function createTarGzArchive({
  cwd,
  destinationPath,
}: {
  cwd: string;
  destinationPath: string;
}) {
  await execFileAsync('tar', ['-czf', destinationPath, '-C', cwd, '.']);
}

async function extractTarGzArchive({
  archivePath,
  destinationPath,
}: {
  archivePath: string;
  destinationPath: string;
}) {
  await execFileAsync('tar', ['-xzf', archivePath, '-C', destinationPath]);
}

async function dumpDatabaseSql({ pool }: { pool: Pool }) {
  let sqlText = 'BEGIN;\n';
  sqlText += 'CREATE EXTENSION IF NOT EXISTS vector;\n';
  sqlText += `TRUNCATE ${PUBLIC_TABLES_IN_RESTORE_ORDER.map(sqlIdentifier).join(', ')} RESTART IDENTITY CASCADE;\n`;

  for (const tableName of PUBLIC_TABLES_IN_RESTORE_ORDER) {
    const columnResult = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND is_generated = 'NEVER'
        ORDER BY ordinal_position
      `,
      [tableName],
    );

    const columns = columnResult.rows.map((row) => row.column_name as string);

    if (columns.length === 0) {
      continue;
    }

    const result = await pool.query(
      `SELECT ${columns.map(sqlIdentifier).join(', ')} FROM ${sqlIdentifier(tableName)}`,
    );

    if (result.rows.length === 0) {
      continue;
    }

    const columnList = columns.map(sqlIdentifier).join(', ');

    for (const row of result.rows) {
      const values = columns
        .map((column) => sqlLiteral((row as Record<string, unknown>)[column]))
        .join(', ');
      sqlText += `INSERT INTO ${sqlIdentifier(tableName)} (${columnList}) VALUES (${values});\n`;
    }
  }

  sqlText += 'COMMIT;\n';
  return sqlText;
}

async function verifyRestoredFiles({
  pool,
  storageBasePath,
}: {
  pool: Pool;
  storageBasePath: string;
}) {
  const result = await pool.query('SELECT original_storage_key FROM documents');

  for (const row of result.rows) {
    const key = row.original_storage_key as string;
    await readFile(join(storageBasePath, key));
  }
}

export async function createBackupArchive({
  backupDirectory,
  pool,
  storageBasePath,
  version,
}: {
  backupDirectory: string;
  pool: Pool;
  storageBasePath: string;
  version: string;
}): Promise<CreateBackupResult> {
  const createdAt = new Date();
  const backupId = `arkivra-backup-${createdAt.toISOString().replaceAll(':', '-')}.tar.gz`;
  const tempDirectory = await import('node:fs/promises').then((fs) =>
    fs.mkdtemp(join(tmpdir(), 'arkivra-backup-')),
  );
  const archivePath = join(resolve(backupDirectory), backupId);
  const databaseSql = await dumpDatabaseSql({ pool });

  await mkdir(resolve(backupDirectory), { recursive: true });

  try {
    await writeFile(join(tempDirectory, 'database.sql'), databaseSql, 'utf8');
    await writeFile(
      join(tempDirectory, 'metadata.json'),
      JSON.stringify(
        {
          id: backupId,
          arkivraVersion: version,
          createdAt: createdAt.toISOString(),
          formatVersion: BACKUP_FORMAT_VERSION,
        },
        null,
        2,
      ),
      'utf8',
    );

    await cp(storageBasePath, join(tempDirectory, 'documents'), {
      recursive: true,
      force: true,
    });

    await createTarGzArchive({
      cwd: tempDirectory,
      destinationPath: archivePath,
    });
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }

  return {
    backupId,
    filePath: archivePath,
  };
}

export async function restoreBackupArchive({
  backupDirectory,
  backupId,
  maintenanceFlagPath,
  pool,
  storageBasePath,
}: {
  backupDirectory: string;
  backupId: string;
  maintenanceFlagPath: string;
  pool: Pool;
  storageBasePath: string;
}): Promise<RestoreBackupResult> {
  const archivePath = join(resolve(backupDirectory), backupId);
  const tempDirectory = await import('node:fs/promises').then((fs) =>
    fs.mkdtemp(join(tmpdir(), 'arkivra-restore-')),
  );

  await mkdir(resolve(backupDirectory), { recursive: true });
  await writeFile(
    maintenanceFlagPath,
    JSON.stringify({ startedAt: new Date().toISOString(), backupId }),
    'utf8',
  );

  try {
    await extractTarGzArchive({
      archivePath,
      destinationPath: tempDirectory,
    });

    const metadata = JSON.parse(await readFile(join(tempDirectory, 'metadata.json'), 'utf8')) as {
      formatVersion: number;
    };

    if (metadata.formatVersion !== BACKUP_FORMAT_VERSION) {
      throw new Error(`Unsupported backup format version: ${metadata.formatVersion}`);
    }

    const databaseSql = await readFile(join(tempDirectory, 'database.sql'), 'utf8');

    await rm(storageBasePath, { recursive: true, force: true });
    await mkdir(storageBasePath, { recursive: true });

    await pool.query(databaseSql);
    await cp(join(tempDirectory, 'documents'), storageBasePath, {
      recursive: true,
      force: true,
    });

    await verifyRestoredFiles({ pool, storageBasePath });

    return {
      backupId,
      restored: true,
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
    await rm(maintenanceFlagPath, { force: true });
  }
}

export function createBackupWorker({
  backupDirectory,
  db,
  maintenanceFlagPath,
  pool,
  storageBasePath,
  version,
  startPolling = true,
}: BackupWorkerDeps) {
  async function processBackupJob(job: AsyncJob<Record<string, never> | RestoreBackupJobData>) {
    if (job.name === CREATE_BACKUP_JOB) {
      const result = await createBackupArchive({
        backupDirectory,
        pool,
        storageBasePath,
        version,
      });

      console.info(`Created backup archive ${result.backupId}`);
      return result;
    }

    if (job.name === RESTORE_BACKUP_JOB) {
      const { backupId } = job.data as RestoreBackupJobData;
      const result = await restoreBackupArchive({
        backupDirectory,
        backupId,
        maintenanceFlagPath,
        pool,
        storageBasePath,
      });

      console.info(`Restored backup archive ${backupId}`);
      return result;
    }

    throw new Error(`Unknown backup job: ${job.name}`);
  }

  const worker = createPostgresWorker<Record<string, never> | RestoreBackupJobData>({
    db,
    queueName: BACKUP_QUEUE,
    concurrency: 1,
    autorun: startPolling,
    handler: async (job) => processBackupJob(job),
  });

  worker.on('failed', (job, error) => {
    console.error(
      `Backup job failed for ${job?.name ?? 'unknown'} (${job?.id ?? 'unknown'}):`,
      error.message,
    );
  });

  worker.on('completed', (job) => {
    console.info(`Backup job completed for ${job.name} (${job.id})`);
  });

  async function close() {
    await worker.close();
  }

  return {
    close,
    processBackupJob,
    worker,
  };
}
