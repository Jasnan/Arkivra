import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createAuth } from '../../auth/auth.services.js';
import { parseConfig } from '../../config/config.js';
import { setupDatabase } from '../../database/database.js';
import {
  documentChunksTable,
  documentVersionsTable,
  documentsTable,
  usersTable,
  vaultsTable,
} from '../../database/schema/index.js';
import { createEncryptionServices } from '../../encryption/encryption.services.js';
import { createServer } from '../../server/server.js';
import { createStorageDriver } from '../../storage/storage.services.js';
import { createBackupServices } from './backups.services.js';
import { createBackupQueue } from '../../worker/backup.queue.js';
import { createBackupWorker } from '../../worker/backup.worker.js';

const drizzleFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../drizzle');

describe.sequential('backups e2e', () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `backup-${uniqueSuffix}@example.com`;
  const password = 'Passw0rd!123';

  let backupDirectory = '';
  let storagePath = '';
  let backupQueue: ReturnType<typeof createBackupQueue> | null = null;
  let backupWorker: ReturnType<typeof createBackupWorker> | null = null;
  let pool: ReturnType<typeof setupDatabase>['pool'] | null = null;
  let db: ReturnType<typeof setupDatabase>['db'] | null = null;
  let app: ReturnType<typeof createServer>['app'] | null = null;
  let adminPool: Pool | null = null;
  let userId: string | null = null;
  let vaultId: string | null = null;
  let documentId: string | null = null;
  let backupId: string | null = null;
  let isolatedDatabaseUrl = '';
  let isolatedDatabaseName = '';

  async function createIsolatedDatabase(baseDatabaseUrl: string) {
    const adminUrl = new URL(baseDatabaseUrl);
    adminUrl.pathname = '/postgres';

    isolatedDatabaseName = `arkivra_backups_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    isolatedDatabaseUrl = new URL(baseDatabaseUrl)
      .toString()
      .replace(/\/[^/?]+(\?.*)?$/, `/${isolatedDatabaseName}$1`);

    adminPool = new Pool({ connectionString: adminUrl.toString() });
    await adminPool.query(`CREATE DATABASE "${isolatedDatabaseName}"`);

    const migrationPool = new Pool({ connectionString: isolatedDatabaseUrl });
    const migrationDb = drizzle(migrationPool);

    try {
      await migrate(migrationDb, {
        migrationsFolder: drizzleFolder,
      });
    } finally {
      await migrationPool.end();
    }
  }

  beforeAll(async () => {
    backupDirectory = await mkdtemp(join(tmpdir(), 'arkivra-backups-e2e-'));
    storagePath = await mkdtemp(join(tmpdir(), 'arkivra-backups-storage-'));
    const baseDatabaseUrl =
      process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra';

    await createIsolatedDatabase(baseDatabaseUrl);

    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PROCESS_MODE: 'all',
        ARKIVRA_ENCRYPTION_KEYS: process.env.ARKIVRA_ENCRYPTION_KEYS ?? `1:${'a'.repeat(64)}`,
        ARKIVRA_DOCLING_URL: process.env.ARKIVRA_DOCLING_URL ?? 'http://127.0.0.1:5001',
        ARKIVRA_DATABASE_URL: isolatedDatabaseUrl,
        ARKIVRA_STORAGE_FS_PATH: storagePath,
        ARKIVRA_BACKUPS_PATH: backupDirectory,
        ARKIVRA_SERVER_BASE_URL: 'http://localhost:1221',
        ARKIVRA_CORS_ORIGINS: 'http://localhost:1221',
        ARKIVRA_AUTH_TRUSTED_ORIGINS: 'http://localhost:1221',
        ARKIVRA_BACKUP_ENCRYPTION_KEY: 'b'.repeat(64),
      },
    });

    const database = setupDatabase({ config });
    db = database.db;
    pool = database.pool;

    const { auth } = createAuth({ db, config });
    const encryption = createEncryptionServices({ kekKeysRaw: config.encryption.keys });
    const storage = createStorageDriver({ config });
    const backupServices = createBackupServices({ config });

    backupQueue = createBackupQueue({ db });
    backupWorker = createBackupWorker({
      backupDirectory: backupServices.backupDirectory,
      backupEncryptionKeyRaw: config.backups.archiveEncryptionKey,
      backupPartSizeBytes: config.backups.partSizeBytes,
      db,
      maintenanceFlagPath: backupServices.maintenanceFlagPath,
      pool,
      storageBasePath: config.storage.filesystem.basePath,
      version: config.version,
    });

    app = createServer({
      config,
      auth,
      db,
      storage,
      encryption,
      backupQueue,
    }).app;
  });

  afterAll(async () => {
    if (documentId !== null && db !== null) {
      await db
        .delete(documentsTable)
        .where(eq(documentsTable.id, documentId))
        .catch(() => undefined);
    }

    if (vaultId !== null && db !== null) {
      await db
        .delete(vaultsTable)
        .where(eq(vaultsTable.id, vaultId))
        .catch(() => undefined);
    }

    if (userId !== null && db !== null) {
      await db
        .delete(usersTable)
        .where(eq(usersTable.id, userId))
        .catch(() => undefined);
    }

    if (backupQueue !== null) {
      await backupQueue.queue.obliterate({ force: true }).catch(() => undefined);
      await backupQueue.close();
    }

    if (backupWorker !== null) {
      await backupWorker.close();
    }

    if (pool !== null) {
      await pool.end();
    }

    if (adminPool !== null && isolatedDatabaseName.length > 0) {
      await adminPool.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()
        `,
        [isolatedDatabaseName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS "${isolatedDatabaseName}"`);
      await adminPool.end();
    }

    await rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined);
    await rm(storagePath, { recursive: true, force: true }).catch(() => undefined);
  });

  test('creates, lists, downloads, and restores backups', async () => {
    if (app === null || db === null) {
      throw new Error('Backups e2e dependencies were not initialized');
    }

    const signUpResponse = await app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:1221',
      },
      body: JSON.stringify({
        name: 'Backup Tester',
        email,
        password,
      }),
    });

    expect(signUpResponse.status).toBe(200);
    const sessionCookie = signUpResponse.headers.get('set-cookie')!.split(';', 1)[0];
    const signUpBody = (await signUpResponse.json()) as { user: { id: string } };
    userId = signUpBody.user.id;
    await db.update(usersTable).set({ systemRole: 'admin' }).where(eq(usersTable.id, userId));

    const createVaultResponse = await app.request('/api/vaults', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Backups Vault' }),
    });

    const createVaultBody = (await createVaultResponse.json()) as { vault: { id: string } };
    vaultId = createVaultBody.vault.id;
    documentId = `doc_backup_${uniqueSuffix}`;
    const documentVersionId = `dvr_backup_${uniqueSuffix}`;

    const storageKey = `${vaultId}/${documentVersionId}`;
    await mkdir(join(storagePath, vaultId), { recursive: true });
    await writeFile(join(storagePath, storageKey), Buffer.from('backup-file'));

    await db.insert(documentsTable).values({
      id: documentId,
      vaultId,
      createdBy: userId,
      originalName: 'backup.pdf',
      originalSize: 11,
      originalStorageKey: storageKey,
      originalSha256Hash: `sha-${uniqueSuffix}`,
      name: 'backup.pdf',
      mimeType: 'application/pdf',
      content: 'Backed up content',
    });

    await db.insert(documentVersionsTable).values({
      id: documentVersionId,
      documentId,
      vaultId,
      versionNumber: 1,
      uploadedBy: userId,
      originalName: 'backup.pdf',
      originalSize: 11,
      originalStorageKey: storageKey,
      originalSha256Hash: `sha-${uniqueSuffix}`,
      mimeType: 'application/pdf',
      content: 'Backed up content',
      processingStatus: 'completed',
    });

    await db
      .update(documentsTable)
      .set({ currentVersionId: documentVersionId })
      .where(eq(documentsTable.id, documentId));

    await db.insert(documentChunksTable).values({
      documentId,
      documentVersionId,
      vaultId,
      chunkIndex: 0,
      chunkKey: `${documentId}:0`,
      content: 'Backed up chunk',
      chunkType: 'paragraph',
      pageNumber: 1,
      tokenCount: 3,
    });

    const createBackupResponse = await app.request('/api/admin/backups', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(createBackupResponse.status).toBe(202);

    const startedAt = Date.now();

    while (Date.now() - startedAt < 15_000) {
      const backupsListResponse = await app.request('/api/admin/backups', {
        headers: { cookie: sessionCookie },
      });
      const backupsListBody = (await backupsListResponse.json()) as {
        backups: Array<{ id: string }>;
      };

      backupId = backupsListBody.backups[0]?.id ?? null;

      if (backupId !== null) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(backupId).not.toBeNull();

    const downloadResponse = await app.request(`/api/admin/backups/${backupId}/download`, {
      headers: { cookie: sessionCookie },
    });

    expect(downloadResponse.status).toBe(200);
    expect((await downloadResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);

    await db.delete(documentsTable).where(eq(documentsTable.id, documentId));
    await rm(join(storagePath, storageKey), { force: true });

    const restoreResponse = await app.request('/api/admin/backups/restore', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ backupId }),
    });

    expect(restoreResponse.status).toBe(202);

    const restoreStartedAt = Date.now();

    while (Date.now() - restoreStartedAt < 15_000) {
      const counts = await backupQueue!.queue.getJobCounts(
        'active',
        'waiting',
        'delayed',
        'prioritized',
      );
      const [document] = await db
        .select({ id: documentsTable.id, content: documentsTable.content })
        .from(documentsTable)
        .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
        .limit(1);

      const restoredFileExists = await access(join(storagePath, storageKey))
        .then(() => true)
        .catch(() => false);

      const queueIsIdle =
        counts.active === 0 &&
        counts.waiting === 0 &&
        counts.delayed === 0 &&
        counts.prioritized === 0;

      if (document !== undefined && restoredFileExists && queueIsIdle) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const [restoredDocument] = await db
      .select({
        id: documentsTable.id,
        content: documentsTable.content,
        currentVersionId: documentsTable.currentVersionId,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1);

    const [restoredVersion] = await db
      .select({
        id: documentVersionsTable.id,
        documentId: documentVersionsTable.documentId,
        content: documentVersionsTable.content,
        processingStatus: documentVersionsTable.processingStatus,
      })
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.id, documentVersionId))
      .limit(1);

    const [restoredChunk] = await db
      .select({
        documentId: documentChunksTable.documentId,
        documentVersionId: documentChunksTable.documentVersionId,
        content: documentChunksTable.content,
      })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentVersionId, documentVersionId))
      .limit(1);

    expect(restoredDocument?.id).toBe(documentId);
    expect(restoredDocument?.content).toBe('Backed up content');
    expect(restoredDocument?.currentVersionId).toBe(documentVersionId);
    expect(restoredVersion).toMatchObject({
      id: documentVersionId,
      documentId,
      content: 'Backed up content',
      processingStatus: 'completed',
    });
    expect(restoredChunk).toMatchObject({
      documentId,
      documentVersionId,
      content: 'Backed up chunk',
    });
    expect(await readFile(join(storagePath, storageKey), 'utf8')).toBe('backup-file');
  }, 30_000);
});
