import type { Config } from '../config/config.js';
import type { Auth } from '../auth/auth.services.js';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};
import type { ServerContext } from './server.types.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { registerAuthRoutes } from '../auth/auth.routes.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerDocumentRoutes } from '../documents/documents.routes.js';
import { registerSearchRoutes } from '../search/search.routes.js';

export function createServer({ config, auth, db, storage, encryption, documentQueue }: { config: Config; auth: Auth; db: Database; storage: StorageDriver; encryption: EncryptionServices; documentQueue?: DocumentQueue }) {
  const app = new Hono<ServerContext>({ strict: true });

  app.use(cors({
    origin: config.server.corsOrigins,
    credentials: true,
  }));

  app.use(secureHeaders());

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    await next();
  });

  registerAuthRoutes({ app, auth });
  registerVaultRoutes({ app, db });
  registerDocumentRoutes({ app, db, storage, encryption, documentQueue });
  registerSearchRoutes({ app, db });

  // Health check endpoint
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      version: config.version,
      timestamp: new Date().toISOString(),
    });
  });

  // Root redirect
  app.get('/', (c) => {
    return c.json({
      name: 'Arkivra',
      version: config.version,
      docs: '/api/health',
    });
  });

  app.get('/api/me', requireAuthentication(), c => {
    const session = c.get('session');

    if (session === null) {
      return c.json(
        {
          error: {
            code: 'auth.unauthorized',
            message: 'Unauthorized',
          },
        },
        401,
      );
    }

    return c.json({
      userId: c.get('userId'),
      sessionId: session.id,
    });
  });

  return { app };
}
