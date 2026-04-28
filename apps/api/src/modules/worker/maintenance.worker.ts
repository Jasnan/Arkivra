import type { Redis } from 'ioredis';
import type { Job } from 'bullmq';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { HardDeleteExpiredDocumentsJobData } from './maintenance.queue.js';
import { Worker } from 'bullmq';
import { sql } from 'drizzle-orm';
import { HARD_DELETE_EXPIRED_DOCUMENTS_JOB, MAINTENANCE_QUEUE } from './maintenance.queue.js';

type ExpiredDocumentRow = {
  id: string;
  original_storage_key: string;
};

type AssetStorageKeyRow = {
  storage_key: string;
};

export type MaintenanceWorkerDeps = {
  connection: Redis;
  db: Database;
  defaultRetentionDays: number;
  storage: StorageDriver;
};

export async function hardDeleteExpiredDocuments({
  db,
  now = new Date(),
  retentionDays,
  storage,
}: {
  db: Database;
  now?: Date;
  retentionDays: number;
  storage: StorageDriver;
}) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  const expiredDocuments = await db.execute<ExpiredDocumentRow>(sql`
    SELECT id, original_storage_key
    FROM documents
    WHERE is_deleted = true
      AND deleted_at IS NOT NULL
      AND deleted_at <= ${cutoff}
  `);

  let deletedCount = 0;

  for (const document of expiredDocuments.rows) {
    const assetStorageKeys = await db.execute<AssetStorageKeyRow>(sql`
      SELECT DISTINCT storage_key
      FROM document_chunk_assets
      WHERE document_id = ${document.id}
        AND storage_key IS NOT NULL
    `);

    for (const asset of assetStorageKeys.rows) {
      await storage.remove(asset.storage_key);
    }

    await storage.removePrefix?.(`previews/${document.id}`);
    await storage.remove(document.original_storage_key);
    await db.execute(sql`DELETE FROM documents WHERE id = ${document.id}`);
    deletedCount += 1;
  }

  return {
    cutoff,
    deletedCount,
  };
}

export function createMaintenanceWorker({
  connection,
  db,
  defaultRetentionDays,
  storage,
}: MaintenanceWorkerDeps) {
  async function processMaintenanceJob(job: Job<HardDeleteExpiredDocumentsJobData>) {
    if (job.name !== HARD_DELETE_EXPIRED_DOCUMENTS_JOB) {
      throw new Error(`Unknown maintenance job: ${job.name}`);
    }

    const retentionDays = job.data.retentionDays ?? defaultRetentionDays;
    const result = await hardDeleteExpiredDocuments({
      db,
      retentionDays,
      storage,
    });

    console.info(
      `Hard-deleted ${result.deletedCount} expired documents older than ${retentionDays} day(s)`,
    );

    return result;
  }

  const worker = new Worker<HardDeleteExpiredDocumentsJobData>(
    MAINTENANCE_QUEUE,
    async (job) => processMaintenanceJob(job),
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, error) => {
    console.error(
      `Maintenance job failed for ${job?.name ?? 'unknown'} (${job?.id ?? 'unknown'}):`,
      error.message,
    );
  });

  worker.on('completed', (job) => {
    console.info(`Maintenance job completed for ${job.name} (${job.id})`);
  });

  async function close() {
    await worker.close();
  }

  return { close, processMaintenanceJob, worker };
}
