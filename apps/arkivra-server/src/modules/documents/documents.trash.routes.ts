import type { Context, Hono } from 'hono';
import { requireAuthentication } from '../auth/auth.middleware.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { DocumentsServices } from './documents.services.js';
import { isRecord, parseJsonObject } from './documents.route-helpers.js';

export function registerDocumentTrashRoutes({
  app,
  documentsServices,
  vaultsServices,
  retentionDays,
}: {
  app: Hono<ServerContext>;
  documentsServices: DocumentsServices;
  vaultsServices: VaultsServices;
  retentionDays: number;
}) {
  app.use('/api/trash', requireAuthentication());
  app.use('/api/documents/trash', requireAuthentication());

  async function getTrashResponse(context: Context<ServerContext>) {
    const userId = context.get('userId');

    if (userId === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const vaults = await vaultsServices.listUserVaults({ userId });
    const readableVaultIds = vaults
      .filter(
        (vault) => vault.role === 'owner' || vault.role === 'editor' || vault.role === 'viewer',
      )
      .map((vault) => vault.id);
    const requestedVaultId = context.req.query('vaultId')?.trim() || undefined;

    if (requestedVaultId !== undefined && !readableVaultIds.includes(requestedVaultId)) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const documents = await documentsServices.listDeletedDocuments({
      vaultIds: requestedVaultId === undefined ? readableVaultIds : [requestedVaultId],
    });

    return context.json({ documents, retentionDays });
  }

  app.get('/api/trash', getTrashResponse);
  app.get('/api/documents/trash', getTrashResponse);

  app.post('/api/documents/deletion-impact', requireAuthentication(), async (context) => {
    const userId = context.get('userId');

    if (userId === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const body = await parseJsonObject(context);
    const rawDocuments = body?.documents;

    if (!Array.isArray(rawDocuments)) {
      return context.json(
        {
          error: {
            code: 'document.invalid_deletion_impact',
            message: 'documents must be an array',
          },
        },
        400,
      );
    }

    if (rawDocuments.length > 1000) {
      return context.json(
        {
          error: {
            code: 'document.deletion_impact_too_large',
            message: 'At most 1000 documents can be checked at once',
          },
        },
        400,
      );
    }

    const targets = rawDocuments.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.vaultId !== 'string' ||
        typeof item.documentId !== 'string'
      ) {
        return null;
      }

      return {
        vaultId: item.vaultId.trim(),
        documentId: item.documentId.trim(),
      };
    });

    if (
      targets.some(
        (target) =>
          target === null || target.vaultId.length === 0 || target.documentId.length === 0,
      )
    ) {
      return context.json(
        {
          error: {
            code: 'document.invalid_deletion_impact',
            message: 'Each document must include vaultId and documentId',
          },
        },
        400,
      );
    }

    const validTargets = targets as Array<{ vaultId: string; documentId: string }>;
    const vaultIds = [...new Set(validTargets.map((target) => target.vaultId))];

    for (const vaultId of vaultIds) {
      const vault = await vaultsServices.getVaultForUser({ vaultId, userId });

      if (vault === null || (vault.role !== 'owner' && vault.role !== 'editor')) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }
    }

    const result = await documentsServices.getBulkDocumentDeletionImpact({
      targets: validTargets,
      includeDeletedDocument: body?.includeDeleted === true,
    });

    return context.json({ impact: result.impact });
  });


}
