import process from 'node:process';
import { serve } from '@hono/node-server';
import { parseConfig } from './modules/config/config.js';
import { createAuth } from './modules/auth/auth.services.js';
import { setupDatabase } from './modules/database/database.js';
import { createServer } from './modules/server/server.js';

export async function startApp() {
  const { config } = parseConfig({ env: process.env });

  const processMode = config.processMode;
  const isWebMode = processMode === 'all' || processMode === 'web';
  const isWorkerMode = processMode === 'all' || processMode === 'worker';

  console.info(`Starting Arkivra in "${processMode}" mode...`);

  const { db, pool } = setupDatabase({ config });
  const { auth } = createAuth({ db, config });

  if (isWebMode) {
    const { app } = createServer({ config, auth });

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

  if (isWorkerMode) {
    console.info('Worker mode ready (BullMQ workers will be registered in Phase 2)');
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.info('Shutting down...');
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
