import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Redis from 'ioredis';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  documentsTable,
  usersTable,
  vaultMembersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createStorageDriver } from '../storage/storage.services.js';
import { createMaintenanceQueue } from './maintenance.queue.js';
import { createMaintenanceWorker } from './maintenance.worker.js';

describe.sequential('background jobs e2e', () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  let redis: Redis | null = null;
  let maintenanceQueue: ReturnType<typeof createMaintenanceQueue> | null = null;
  let maintenanceWorker: ReturnType<typeof createMaintenanceWorker> | null = null;
  let pool: ReturnType<typeof setupDatabase>['pool'] | null = null;
  let db: ReturnType<typeof setupDatabase>['db'] | null = null;
  let storagePath = '';
  let documentId: string | null = null;
  let vaultId: string | null = null;
  let userId: string | null = null;
  let storageKey: string | null = null;

  beforeAll(async () => {
    storagePath = await mkdtemp(join(tmpdir(), 'arkivra-background-jobs-e2e-'));

    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
        ARKIVRA_REDIS_URL: process.env.ARKIVRA_REDIS_URL ?? 'redis://127.0.0.1:6379/2',
        ARKIVRA_STORAGE_FS_PATH: storagePath,
      },
    });

    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,
    });

    expect(await redis.ping()).toBe('PONG');

    const database = setupDatabase({ config });
    db = database.db;
    pool = database.pool;

    const storage = createStorageDriver({ config });
    maintenanceQueue = createMaintenanceQueue({ connection: redis });
    maintenanceWorker = createMaintenanceWorker({
      connection: redis,
      db,
      defaultRetentionDays: 30,
      storage,
    });

    userId = `usr_bg_${uniqueSuffix}`;
    vaultId = `vlt_bg_${uniqueSuffix}`;
    documentId = `doc_bg_${uniqueSuffix}`;
    storageKey = `${vaultId}/${documentId}`;

    await db.insert(usersTable).values({
      id: userId,
      email: `background-${uniqueSuffix}@example.com`,
      name: 'Background Job Tester',
    });

    await db.insert(vaultsTable).values({
      id: vaultId,
      name: 'Background Jobs Vault',
    });

    await db.insert(vaultMembersTable).values({
      vaultId,
      userId,
      role: 'owner',
    });

    await mkdir(join(storagePath, vaultId), { recursive: true });
    await writeFile(join(storagePath, storageKey), Buffer.from('expired soft deleted file'));

    await db.insert(documentsTable).values({
      id: documentId,
      vaultId,
      createdBy: userId,
      originalName: 'expired.pdf',
      originalSize: 24,
      originalStorageKey: storageKey,
      originalSha256Hash: `hash-${uniqueSuffix}`,
      name: 'expired.pdf',
      mimeType: 'application/pdf',
      isDeleted: true,
      deletedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedBy: userId,
    });
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

    if (maintenanceQueue !== null) {
      await maintenanceQueue.queue.obliterate({ force: true }).catch(() => undefined);
      await maintenanceQueue.close();
    }

    if (maintenanceWorker !== null) {
      await maintenanceWorker.close();
    }

    if (pool !== null) {
      await pool.end();
    }

    await redis?.quit().catch(() => undefined);
    await rm(storagePath, { recursive: true, force: true }).catch(() => undefined);
  });

  test('hard deletes expired soft-deleted documents from the queue worker', async () => {
    if (
      db === null ||
      maintenanceQueue === null ||
      storageKey === null ||
      documentId === null ||
      vaultId === null
    ) {
      throw new Error('Background jobs test dependencies were not initialized');
    }

    await maintenanceQueue.enqueueHardDeleteExpiredDocuments({ retentionDays: 30 });

    const startedAt = Date.now();

    while (Date.now() - startedAt < 15_000) {
      const [document] = await db
        .select({ id: documentsTable.id })
        .from(documentsTable)
        .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
        .limit(1);

      if (document === undefined) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const [documentAfterCleanup] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1);

    expect(documentAfterCleanup).toBeUndefined();
  }, 20_000);
});
