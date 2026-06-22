import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Database } from '../database/database.js';
import type { Pool } from 'pg';
import { BACKUP_QUEUE, CREATE_BACKUP_JOB, RESTORE_BACKUP_JOB } from './backup.queue.js';
import { EMBEDDING_INDEX_QUEUE } from '../ai/indexing/embedding-index.queue.js';
import { MAINTENANCE_QUEUE } from './maintenance.queue.js';
import { PROCESS_DOCUMENT_QUEUE } from './queue.js';
import type { AsyncJob } from './postgres-jobs.js';
import { createPostgresWorker, getScopedQueueName } from './postgres-jobs.js';
import {
  createEncryptedBackupArchive,
  extractEncryptedBackupArchive,
  normalizeBackupEncryptionKey,
  normalizeBackupPartSizeBytes,
  readBackupManifest,
} from './backup.archive.js';
import {
  findKekByVersionFromRaw,
  getActiveKekFromRaw,
} from '../encryption/encryption.services.js';

const execFileAsync = promisify(execFile);
const BACKUP_FORMAT_VERSION = 1;
const BACKUP_DRAIN_POLL_INTERVAL_MS = 500;
const BACKUP_DRAIN_TIMEOUT_MS = 30 * 60 * 1000;
const PUBLIC_TABLES_IN_RESTORE_ORDER = [
  'users',
  'instance_settings',
  'user_ui_preferences',
  'system_capabilities',
  'auth_sessions',
  'auth_accounts',
  'auth_verifications',
  'auth_two_factor',
  'vaults',
  'vault_members',
  'vault_folders',
  'ai_provider_configs',
  'embedding_indexes',
  'permission_requests',
  'email_invitations',
  'documents',
  'document_versions',
  'upload_sessions',
  'document_chunks',
  'document_chunk_assets',
  'document_element_provenance',
  'document_chunk_embeddings',
  'document_embedding_index_status',
  'tags',
  'document_tags',
  'chat_conversations',
  'chat_messages',
  'chat_conversation_document_versions',
  'chat_message_citations',
  'audit_events',
  'activity_events',
  'background_jobs',
] as const;

const DEFERRED_RESTORE_COLUMNS: Record<string, string[]> = {
  documents: ['current_version_id'],
  document_versions: ['restored_from_version_id'],
  vault_folders: ['parent_id'],
};

type BackupWorkerDeps = {
  backupDirectory: string;
  db: Database;
  maintenanceFlagPath: string;
  pool: Pool;
  storageBasePath: string;
  version: string;
  documentEncryptionKeysRaw?: string;
  backupEncryptionKeyRaw?: string;
  backupPartSizeBytes: number;
  appInstance?: string;
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

async function extractTarGzArchive({
  archivePath,
  destinationPath,
}: {
  archivePath: string;
  destinationPath: string;
}) {
  await execFileAsync('tar', ['-xzf', archivePath, '-C', destinationPath]);
}

function backupManifestFileName(backupId: string) {
  return backupId.endsWith('.manifest.json') ? backupId : `${backupId}.manifest.json`;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getBackupMutationQueueNames(appInstance?: string) {
  return [
    getScopedQueueName(PROCESS_DOCUMENT_QUEUE, appInstance),
    getScopedQueueName(MAINTENANCE_QUEUE, appInstance),
    getScopedQueueName(EMBEDDING_INDEX_QUEUE, appInstance),
  ];
}

async function countRunningJobs({
  pool,
  queueNames,
}: {
  pool: Pool;
  queueNames: string[];
}) {
  const result = await pool.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM background_jobs
      WHERE queue_name = ANY($1::text[])
        AND status = 'running'
    `,
    [queueNames],
  );

  return result.rows[0]?.count ?? 0;
}

async function waitForBackupMutationJobsToDrain({
  appInstance,
  pool,
}: {
  appInstance?: string;
  pool: Pool;
}) {
  const queueNames = getBackupMutationQueueNames(appInstance);
  const startedAt = Date.now();

  while (true) {
    const runningCount = await countRunningJobs({ pool, queueNames });

    if (runningCount === 0) {
      return;
    }

    if (Date.now() - startedAt > BACKUP_DRAIN_TIMEOUT_MS) {
      throw new Error('Timed out waiting for background jobs to pause before backup.');
    }

    await sleep(BACKUP_DRAIN_POLL_INTERVAL_MS);
  }
}

async function writeMaintenanceFlag({
  backupId,
  maintenanceFlagPath,
  mode,
}: {
  backupId: string;
  maintenanceFlagPath: string;
  mode: 'backup' | 'restore';
}) {
  await writeFile(
    maintenanceFlagPath,
    JSON.stringify({ mode, startedAt: new Date().toISOString(), backupId }),
    {
      encoding: 'utf8',
      flag: 'wx',
    },
  );
}

async function dumpDatabaseSql({ pool }: { pool: Pool }) {
  let sqlText = 'BEGIN;\n';
  sqlText += 'CREATE EXTENSION IF NOT EXISTS vector;\n';
  sqlText += `TRUNCATE ${PUBLIC_TABLES_IN_RESTORE_ORDER.map(sqlIdentifier).join(', ')} RESTART IDENTITY CASCADE;\n`;
  const deferredUpdates: string[] = [];

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
    const deferredColumns = DEFERRED_RESTORE_COLUMNS[tableName] ?? [];
    const insertColumns = columns.filter(column => !deferredColumns.includes(column));

    if (insertColumns.length === 0) {
      continue;
    }

    const result = await pool.query(
      `SELECT ${columns.map(sqlIdentifier).join(', ')} FROM ${sqlIdentifier(tableName)}`,
    );

    if (result.rows.length === 0) {
      continue;
    }

    const columnList = insertColumns.map(sqlIdentifier).join(', ');

    for (const row of result.rows) {
      const values = insertColumns
        .map((column) => sqlLiteral((row as Record<string, unknown>)[column]))
        .join(', ');
      sqlText += `INSERT INTO ${sqlIdentifier(tableName)} (${columnList}) VALUES (${values});\n`;

      const rowValues = row as Record<string, unknown>;
      const deferredAssignments = deferredColumns
        .filter(column => rowValues[column] !== null && rowValues[column] !== undefined)
        .map(column => `${sqlIdentifier(column)} = ${sqlLiteral(rowValues[column])}`);

      if (deferredAssignments.length > 0 && typeof rowValues.id === 'string') {
        deferredUpdates.push(
          `UPDATE ${sqlIdentifier(tableName)} SET ${deferredAssignments.join(', ')} WHERE "id" = ${sqlLiteral(rowValues.id)};`,
        );
      }
    }
  }

  if (deferredUpdates.length > 0) {
    sqlText += `${deferredUpdates.join('\n')}\n`;
  }

  sqlText += 'COMMIT;\n';
  return sqlText;
}

async function verifyReferencedStorageFiles({
  pool,
  storageBasePath,
}: {
  pool: Pool;
  storageBasePath: string;
}) {
  const result = await pool.query(`
    SELECT original_storage_key AS storage_key
    FROM document_versions
    WHERE original_storage_key IS NOT NULL
    UNION
    SELECT storage_key
    FROM document_chunk_assets
    WHERE storage_key IS NOT NULL
  `);

  for (const row of result.rows) {
    const key = row.storage_key as string;
    await readFile(join(storageBasePath, key));
  }
}

export async function createBackupArchive({
  backupDirectory,
  documentEncryptionKeysRaw,
  backupPartSizeBytes,
  maintenanceFlagPath,
  pool,
  storageBasePath,
  version,
  appInstance,
}: {
  backupDirectory: string;
  documentEncryptionKeysRaw?: string;
  backupPartSizeBytes: number;
  maintenanceFlagPath: string;
  pool: Pool;
  storageBasePath: string;
  version: string;
  appInstance?: string;
}): Promise<CreateBackupResult> {
  const createdAt = new Date();
  const backupId = `arkivra-backup-${createdAt.toISOString().replaceAll(':', '-')}`;
  const tempDirectory = await mkdtemp(
    join(
      tmpdir(),
      appInstance === undefined ? 'arkivra-backup-' : `arkivra-${appInstance}-backup-`,
    ),
  );
  const archivePath = join(resolve(backupDirectory), backupManifestFileName(backupId));
  const activeKek = getActiveKekFromRaw(documentEncryptionKeysRaw);
  const partSizeBytes = normalizeBackupPartSizeBytes(backupPartSizeBytes);
  let maintenanceFlagOwned = false;

  await mkdir(resolve(backupDirectory), { recursive: true });

  try {
    await writeMaintenanceFlag({ backupId, maintenanceFlagPath, mode: 'backup' });
    maintenanceFlagOwned = true;
    await waitForBackupMutationJobsToDrain({ appInstance, pool });
    const databaseSql = await dumpDatabaseSql({ pool });
    await verifyReferencedStorageFiles({ pool, storageBasePath });

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

    await mkdir(resolve(storageBasePath), { recursive: true });
    await symlink(resolve(storageBasePath), join(tempDirectory, 'documents'), 'dir');
    const result = await createEncryptedBackupArchive({
      backupDirectory: resolve(backupDirectory),
      backupId,
      createdAt,
      encryptionKey: activeKek.key,
      kekVersion: activeKek.version,
      partSizeBytes,
      sourceDirectory: tempDirectory,
      version,
    });

    return {
      backupId: result.manifestFileName,
      filePath: archivePath,
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
    if (maintenanceFlagOwned) {
      await rm(maintenanceFlagPath, { force: true });
    }
  }
}

export async function restoreBackupArchive({
  backupDirectory,
  documentEncryptionKeysRaw,
  backupEncryptionKeyRaw,
  backupId,
  maintenanceFlagPath,
  pool,
  storageBasePath,
  appInstance,
}: {
  backupDirectory: string;
  documentEncryptionKeysRaw?: string;
  backupEncryptionKeyRaw?: string;
  backupId: string;
  maintenanceFlagPath: string;
  pool: Pool;
  storageBasePath: string;
  appInstance?: string;
}): Promise<RestoreBackupResult> {
  const archivePath = join(resolve(backupDirectory), backupId);
  const manifestBackup = backupId.endsWith('.manifest.json');
  let storageStagingPath: string | null = null;
  let previousStoragePath: string | null = null;
  const tempDirectory = await mkdtemp(
    join(
      tmpdir(),
      appInstance === undefined ? 'arkivra-restore-' : `arkivra-${appInstance}-restore-`,
    ),
  );
  let maintenanceFlagOwned = false;

  await mkdir(resolve(backupDirectory), { recursive: true });

  try {
    await writeMaintenanceFlag({ backupId, maintenanceFlagPath, mode: 'restore' });
    maintenanceFlagOwned = true;
    if (manifestBackup) {
      const manifest = await readBackupManifest({
        backupDirectory: resolve(backupDirectory),
        manifestFileName: backupId,
      });
      const backupEncryptionKey = manifest.archive.kekVersion
        ? findKekByVersionFromRaw({
            kekKeysRaw: documentEncryptionKeysRaw,
            version: manifest.archive.kekVersion,
          }).key
        : normalizeBackupEncryptionKey(backupEncryptionKeyRaw);

      if (backupEncryptionKey === null) {
        throw new Error(
          'Legacy backup archive encryption key is not configured. Set ARKIVRA_BACKUP_ENCRYPTION_KEY to restore this older backup set.',
        );
      }

      await extractEncryptedBackupArchive({
        backupDirectory: resolve(backupDirectory),
        destinationPath: tempDirectory,
        encryptionKey: backupEncryptionKey,
        manifest,
      });
    } else {
      await extractTarGzArchive({
        archivePath,
        destinationPath: tempDirectory,
      });
    }

    const metadata = JSON.parse(await readFile(join(tempDirectory, 'metadata.json'), 'utf8')) as {
      formatVersion: number;
    };

    if (metadata.formatVersion !== BACKUP_FORMAT_VERSION) {
      throw new Error(`Unsupported backup format version: ${metadata.formatVersion}`);
    }

    const databaseSql = await readFile(join(tempDirectory, 'database.sql'), 'utf8');
    storageStagingPath = `${resolve(storageBasePath)}.restore-staging-${Date.now()}`;
    previousStoragePath = `${resolve(storageBasePath)}.restore-previous-${Date.now()}`;

    await rm(storageStagingPath, { recursive: true, force: true });
    await cp(join(tempDirectory, 'documents'), storageStagingPath, {
      recursive: true,
      force: true,
    });

    await pool.query(databaseSql);

    await verifyReferencedStorageFiles({ pool, storageBasePath: storageStagingPath });

    await rm(previousStoragePath, { recursive: true, force: true });
    await rename(resolve(storageBasePath), previousStoragePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });
    try {
      await rename(storageStagingPath, resolve(storageBasePath));
      storageStagingPath = null;
    }
    catch (error) {
      await rename(previousStoragePath, resolve(storageBasePath)).catch(() => undefined);
      previousStoragePath = null;
      throw error;
    }
    await rm(previousStoragePath, { recursive: true, force: true });
    previousStoragePath = null;

    return {
      backupId,
      restored: true,
    };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
    if (storageStagingPath !== null) {
      await rm(storageStagingPath, { recursive: true, force: true }).catch(() => undefined);
    }
    if (previousStoragePath !== null) {
      await rm(previousStoragePath, { recursive: true, force: true }).catch(() => undefined);
    }
    if (maintenanceFlagOwned) {
      await rm(maintenanceFlagPath, { force: true });
    }
  }
}

export function createBackupWorker({
  backupDirectory,
  db,
  maintenanceFlagPath,
  pool,
  storageBasePath,
  version,
  documentEncryptionKeysRaw,
  backupEncryptionKeyRaw,
  backupPartSizeBytes,
  appInstance,
  startPolling = true,
}: BackupWorkerDeps) {
  async function processBackupJob(job: AsyncJob<Record<string, never> | RestoreBackupJobData>) {
    if (job.name === CREATE_BACKUP_JOB) {
      const result = await createBackupArchive({
        backupDirectory,
        documentEncryptionKeysRaw,
        backupPartSizeBytes,
        maintenanceFlagPath,
        pool,
        storageBasePath,
        version,
        appInstance,
      });

      console.info(`Created backup archive ${result.backupId}`);
      return result;
    }

    if (job.name === RESTORE_BACKUP_JOB) {
      const { backupId } = job.data as RestoreBackupJobData;
      const result = await restoreBackupArchive({
        backupDirectory,
        documentEncryptionKeysRaw,
        backupEncryptionKeyRaw,
        backupId,
        maintenanceFlagPath,
        pool,
        storageBasePath,
        appInstance,
      });

      console.info(`Restored backup archive ${backupId}`);
      return result;
    }

    throw new Error(`Unknown backup job: ${job.name}`);
  }

  const worker = createPostgresWorker<Record<string, never> | RestoreBackupJobData>({
    db,
    queueName: getScopedQueueName(BACKUP_QUEUE, appInstance),
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
