import type { Config } from '../config/config.js';
import type { Auth } from '../auth/auth.services.js';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';
import type {
  CreateBackupJobResult,
  RestoreBackupJobResult,
} from '../admin/backups/backups.types.js';
import type { AuthorizationServices } from '../authorization/authorization.services.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};
type BackupQueue = {
  enqueueCreateBackup: () => Promise<CreateBackupJobResult>;
  enqueueRestoreBackup: (args: { backupId: string }) => Promise<RestoreBackupJobResult>;
};
import type { ServerContext } from './server.types.js';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { registerAuthRoutes } from '../auth/auth.routes.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { createAuthorizationServices } from '../authorization/authorization.services.js';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerDocumentRoutes } from '../documents/documents.routes.js';
import { registerSearchRoutes } from '../search/search.routes.js';
import { registerTagRoutes } from '../tags/tags.routes.js';
import { createBackupServices } from '../admin/backups/backups.services.js';
import { registerBackupRoutes } from '../admin/backups/backups.routes.js';
import { registerAdminUserRoutes } from '../admin/users/users.routes.js';
import { registerAdminVaultRoutes } from '../admin/vaults/vaults.routes.js';

export function createServer({
  config,
  auth,
  db,
  storage,
  encryption,
  documentQueue,
  backupQueue,
  authorizationServices,
}: {
  config: Config;
  auth: Auth;
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  documentQueue?: DocumentQueue;
  backupQueue?: BackupQueue;
  authorizationServices?: AuthorizationServices;
}) {
  const app = new Hono<ServerContext>({ strict: true });
  const backupServices = createBackupServices({ config });
  const authzServices = authorizationServices ?? createAuthorizationServices({ db });

  app.use(
    cors({
      origin: config.server.corsOrigins,
      credentials: true,
    }),
  );

  app.use(secureHeaders());

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
    context.set('userDisabled', false);
    context.set('isGlobalAdmin', false);
    context.set('canCreateVault', false);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultPermissions', []);
    await next();
  });

  app.use('/api/*', async (context, next) => {
    const path = context.req.path;
    const maintenanceModeEnabled = await backupServices.isMaintenanceModeEnabled();

    if (
      maintenanceModeEnabled &&
      path !== '/api/health' &&
      !path.startsWith('/api/auth/') &&
      !path.startsWith('/api/admin/backups')
    ) {
      return context.json(
        {
          error: {
            code: 'system.maintenance_mode',
            message: 'Restore in progress. Arkivra is temporarily in maintenance mode.',
          },
        },
        503,
      );
    }

    await next();
  });

  registerAuthRoutes({ app, auth, authorizationServices: authzServices });
  registerVaultRoutes({ app, db });
  registerDocumentRoutes({ app, db, storage, encryption, documentQueue });
  registerSearchRoutes({ app, db });
  registerTagRoutes({ app, db });
  registerBackupRoutes({ app, config, backupQueue, backupServices });
  registerAdminUserRoutes({ app, authorizationServices: authzServices });
  registerAdminVaultRoutes({ app, db });

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

  app.get('/api/me', requireAuthentication(), (c) => {
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
      isGlobalAdmin: c.get('isGlobalAdmin'),
      canCreateVault: c.get('canCreateVault'),
    });
  });

  return { app };
}
