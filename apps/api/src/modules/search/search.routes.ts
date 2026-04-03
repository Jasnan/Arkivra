import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { DocumentSearchServices } from './search.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { createDocumentSearchServices } from './search.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireVaultAccess, requireVaultPermission } from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';

function parsePageIndex(value: string | undefined) {
  if (value === undefined) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parsePageSize(value: string | undefined) {
  if (value === undefined) {
    return 20;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : null;
}

export function registerSearchRoutes({
  app,
  db,
  services,
  vaultServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: DocumentSearchServices;
  vaultServices?: VaultsServices;
}) {
  const vaultsServices = vaultServices ?? createVaultsServices({ db });
  const searchServices = services ?? createDocumentSearchServices({ db });

  app.use('/api/vaults/:vaultId/search', requireAuthentication());
  app.use('/api/vaults/:vaultId/search', requireVaultAccess({ services: vaultsServices }));
  app.use('/api/vaults/:vaultId/search', requireVaultPermission('documents.read'));

  app.get('/api/vaults/:vaultId/search', async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const query = context.req.query('q')?.trim() ?? '';

    if (query.length === 0) {
      return context.json(
        { error: { code: 'search.invalid_query', message: 'Search query is required' } },
        400,
      );
    }

    const pageIndex = parsePageIndex(context.req.query('pageIndex'));

    if (pageIndex === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_page_index',
            message: 'pageIndex must be an integer >= 0',
          },
        },
        400,
      );
    }

    const pageSize = parsePageSize(context.req.query('pageSize'));

    if (pageSize === null) {
      return context.json(
        {
          error: {
            code: 'search.invalid_page_size',
            message: 'pageSize must be an integer between 1 and 100',
          },
        },
        400,
      );
    }

    const result = await searchServices.searchDocuments({
      vaultId,
      query,
      pageIndex,
      pageSize,
    });

    return context.json(result);
  });
}
