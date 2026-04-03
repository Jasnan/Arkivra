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

  if (isWebMode) {
    const { app } = createServer({ config, auth, db, storage, encryption, documentQueue });

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
    const doclingClient = createDoclingClient({ baseUrl: config.docling.url });
    const documentWorker = createDocumentWorker({
      db,
      storage,
      encryption,
      doclingClient,
      connection: redis,
    });

    console.info('Document processing worker started');
    cleanups.push(async () => documentWorker.close());
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.info('Shutting down...');
    for (const fn of cleanups) {
      await fn();
    }
    await documentQueue.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
}
