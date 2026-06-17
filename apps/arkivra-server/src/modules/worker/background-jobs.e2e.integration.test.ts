import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  documentChunkAssetsTable,
  documentChunksTable,
  documentVersionsTable,
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

  let maintenanceQueue: ReturnType<typeof createMaintenanceQueue> | null = null;
  let maintenanceWorker: ReturnType<typeof createMaintenanceWorker> | null = null;
  let pool: ReturnType<typeof setupDatabase>['pool'] | null = null;
  let db: ReturnType<typeof setupDatabase>['db'] | null = null;
  let storage: ReturnType<typeof createStorageDriver> | null = null;
  let storagePath = '';
  let documentId: string | null = null;
  let vaultId: string | null = null;
  let userId: string | null = null;
  let documentVersionId: string | null = null;
  let storageKey: string | null = null;
  let assetStorageKey: string | null = null;
  let previewStorageKey: string | null = null;

  beforeAll(async () => {
    storagePath = await mkdtemp(join(tmpdir(), 'arkivra-background-jobs-e2e-'));

    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
        ARKIVRA_STORAGE_FS_PATH: storagePath,
      },
    });

    const database = setupDatabase({ config });
    db = database.db;
    pool = database.pool;

    storage = createStorageDriver({ config });
    maintenanceQueue = createMaintenanceQueue({ db, appInstance: uniqueSuffix });
    maintenanceWorker = createMaintenanceWorker({
      db,
      defaultRetentionDays: 30,
      appInstance: uniqueSuffix,
      storage,
    });

    userId = `usr_bg_${uniqueSuffix}`;
    vaultId = `vlt_bg_${uniqueSuffix}`;
    documentId = `doc_bg_${uniqueSuffix}`;
    documentVersionId = `dvr_bg_${uniqueSuffix}`;
    storageKey = `${vaultId}/${documentVersionId}`;
    assetStorageKey = `chunks/${documentVersionId}/chunk-0/image-1.png`;
    previewStorageKey = `previews/${documentVersionId}/pages/1.png`;

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

    await storage.write(storageKey, Buffer.from('expired soft deleted file'));
    await storage.write(assetStorageKey, Buffer.from('expired chunk asset'));
    await storage.write(previewStorageKey, Buffer.from('cached page preview'));

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

    await db.insert(documentVersionsTable).values({
      id: documentVersionId,
      documentId,
      vaultId,
      versionNumber: 1,
      uploadedBy: userId,
      originalName: 'expired.pdf',
      originalSize: 24,
      originalStorageKey: storageKey,
      originalSha256Hash: `hash-${uniqueSuffix}`,
      mimeType: 'application/pdf',
      processingStatus: 'completed',
    });

    await db
      .update(documentsTable)
      .set({ currentVersionId: documentVersionId })
      .where(eq(documentsTable.id, documentId));

    await db.insert(documentChunksTable).values({
      id: `chk_bg_${uniqueSuffix}`,
      documentId,
      documentVersionId,
      vaultId,
      chunkIndex: 0,
      chunkKey: 'chunk-0',
      content: 'expired chunk',
      citationPrecision: 'page',
    });

    await db.insert(documentChunkAssetsTable).values({
      id: `cas_bg_${uniqueSuffix}`,
      chunkId: `chk_bg_${uniqueSuffix}`,
      documentId,
      documentVersionId,
      vaultId,
      assetType: 'image',
      mimeType: 'image/png',
      storageKey: assetStorageKey,
      inlinePayload: null,
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

    await rm(storagePath, { recursive: true, force: true }).catch(() => undefined);
  });

  test('hard deletes expired soft-deleted documents from the queue worker', async () => {
    if (
      db === null ||
      maintenanceQueue === null ||
      storage === null ||
      storageKey === null ||
      assetStorageKey === null ||
      previewStorageKey === null ||
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
    expect(await storage.exists(storageKey)).toBe(false);
    expect(await storage.exists(assetStorageKey)).toBe(false);
    expect(await storage.exists(previewStorageKey)).toBe(false);
  }, 20_000);
});
