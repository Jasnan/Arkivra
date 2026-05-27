import type { Context, Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import { requireCanReadVault } from '../vaults/vaults.middleware.js';
import { createActivityServices } from './activity.services.js';
import { toActivityFeedItem } from './activity.serializers.js';

function parseLimit(value: string | undefined, fallback: number, max: number) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function forbidden(context: Context<ServerContext>) {
  return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
}

export function registerActivityRoutes({
  app,
  db,
  services,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: ReturnType<typeof createActivityServices>;
}) {
  const activityServices = services ?? createActivityServices({ db });

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/activity',
    requireCanReadVault(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return forbidden(context);
      }

      const { events, nextCursor } = await activityServices.listDocumentActivity({
        vaultId,
        documentId: context.req.param('documentId'),
        cursor: context.req.query('cursor')?.trim() || undefined,
        limit: parseLimit(context.req.query('limit'), 25, 50),
      });

      return context.json({
        activity: events.map(toActivityFeedItem),
        nextCursor,
      });
    },
  );

  app.get('/api/vaults/:vaultId/activity', requireCanReadVault(), async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return forbidden(context);
    }

    const { events, nextCursor } = await activityServices.listVaultActivity({
      vaultId,
      cursor: context.req.query('cursor')?.trim() || undefined,
      limit: parseLimit(context.req.query('limit'), 50, 100),
    });

    return context.json({
      activity: events.map(toActivityFeedItem),
      nextCursor,
    });
  });
}
