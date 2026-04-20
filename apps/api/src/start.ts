import process from 'node:process';
import { serve } from '@hono/node-server';
import Redis from 'ioredis';
import { parseConfig } from './modules/config/config.js';
import { createAuth } from './modules/auth/auth.services.js';
import { createEncryptionServices } from './modules/encryption/encryption.services.js';
import { createStorageDriver } from './modules/storage/storage.services.js';
import { setupDatabase } from './modules/database/database.js';
import { createServer } from './modules/server/server.js';
import { createDocumentQueue } from './modules/worker/queue.js';
import { createDoclingClient } from './modules/docling/docling.client.js';
import { createDocumentWorker } from './modules/worker/document.worker.js';
import { createMaintenanceQueue } from './modules/worker/maintenance.queue.js';
import { createMaintenanceWorker } from './modules/worker/maintenance.worker.js';
import { createBackupQueue } from './modules/worker/backup.queue.js';
import { createBackupWorker } from './modules/worker/backup.worker.js';
import { createBackupServices } from './modules/admin/backups/backups.services.js';

export async function startApp() {
  const { config } = parseConfig({ env: process.env });

  const processMode = config.processMode;
  const isWebMode = processMode === 'all' || processMode === 'web';
  const isWorkerMode = processMode === 'all' || processMode === 'worker';

  console.info(`Starting Arkivra in "${processMode}" mode...`);

  const { db, pool } = setupDatabase({ config });
  const { auth } = createAuth({ db, config });
  const encryption = createEncryptionServices({ kekKeysRaw: config.encryption.keys });
  const storage = createStorageDriver({ config });

  const redis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
  const documentQueue = createDocumentQueue({ connection: redis });
  const maintenanceQueue = createMaintenanceQueue({ connection: redis });
  const backupQueue = createBackupQueue({ connection: redis });
  const backupServices = createBackupServices({ config });

  if (isWebMode) {
    const { app } = createServer({
      config,
      auth,
      db,
      storage,
      encryption,
      documentQueue,
      backupQueue,
    });

    serve(
      {
        fetch: app.fetch,
        port: config.server.port,
        hostname: config.server.hostname,
      },
      ({ port }) => {
        console.info(`Arkivra API server listening on http://${config.server.hostname}:${port}`);
      },
    );
  }

  // Collect cleanup functions for graceful shutdown
  const cleanups: Array<() => Promise<void>> = [];

  if (isWorkerMode) {
    const doclingClient = createDoclingClient({
      baseUrl: config.docling.url,
      pollIntervalMs: config.docling.pollIntervalMs,
      maxWaitMs: config.docling.maxWaitMs,
    });
    const documentWorker = createDocumentWorker({
      db,
      storage,
      encryption,
      doclingClient,
      connection: redis,
    });
    const maintenanceWorker = createMaintenanceWorker({
      connection: redis,
      db,
      defaultRetentionDays: config.backgroundJobs.documentRetentionDays,
      storage,
    });
    const backupWorker = createBackupWorker({
      backupDirectory: backupServices.backupDirectory,
      connection: redis,
      maintenanceFlagPath: backupServices.maintenanceFlagPath,
      pool,
      storageBasePath: config.storage.filesystem.basePath,
      version: config.version,
    });

    await maintenanceQueue.scheduleHardDeleteExpiredDocuments({
      cronPattern: config.backgroundJobs.hardDeleteExpiredDocumentsCron,
      retentionDays: config.backgroundJobs.documentRetentionDays,
    });

    console.info('Document processing worker started');
    console.info(
      `Scheduled hard-delete-expired-documents cron (${config.backgroundJobs.hardDeleteExpiredDocumentsCron}) with ${config.backgroundJobs.documentRetentionDays} day retention`,
    );
    cleanups.push(async () => documentWorker.close());
    cleanups.push(async () => maintenanceWorker.close());
    cleanups.push(async () => backupWorker.close());
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.info('Shutting down...');
    for (const fn of cleanups) {
      await fn();
    }
    await documentQueue.close();
    await maintenanceQueue.close();
    await backupQueue.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
}
