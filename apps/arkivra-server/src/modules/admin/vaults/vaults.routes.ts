import type { Hono } from 'hono';
import type { Database } from '../../database/database.js';
import type { ServerContext } from '../../server/server.types.js';
import type { VaultsServices } from '../../vaults/vaults.services.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { requireAdmin } from '../../authorization/authorization.middleware.js';
import { createVaultsServices } from '../../vaults/vaults.services.js';

export function registerAdminVaultRoutes({
  app,
  db,
  services,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: VaultsServices;
}) {
  const vaultsServices = services ?? createVaultsServices({ db });

  app.use('/api/admin/vaults', requireAuthentication(), requireAdmin());
  app.use('/api/admin/vaults/*', requireAuthentication(), requireAdmin());

  app.get('/api/admin/vaults', async (context) => {
    const vaults = await vaultsServices.listAllVaults();
    return context.json({ vaults });
  });
}
