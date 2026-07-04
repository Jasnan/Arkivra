import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from './vaults.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import type { createActivityServices } from '../activity/activity.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { getAuditActorFromContext } from '../audit/audit.http.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import { createVaultsServices } from './vaults.services.js';
import { requireCanManageVault, requireVaultAccess } from './vaults.middleware.js';
import { getValidDescription, getValidName } from './vaults.route-helpers.js';
import { registerVaultMemberRoutes } from './vaults.members.routes.js';

export function registerVaultRoutes({
  app,
  db,
  services,
  auditServices,
  activityServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: VaultsServices;
  auditServices?: ReturnType<typeof createAuditServices>;
  activityServices?: ReturnType<typeof createActivityServices>;
}) {
  const vaultsServices = services ?? createVaultsServices({ db });

  app.use('/api/vaults', requireAuthentication());
  app.use('/api/vaults/*', requireAuthentication());

  app.get('/api/vaults', async (context) => {
    const userId = context.get('userId');

    if (userId === null) {
      return context.json(
        {
          error: {
            code: 'auth.unauthorized',
            message: 'Unauthorized',
          },
        },
        401,
      );
    }

    const vaults = await vaultsServices.listUserVaults({ userId });
    return context.json({ vaults });
  });

  app.post('/api/vaults', async (context) => {
    const userId = context.get('userId');
    const canCreateVault = context.get('canCreateVault');

    if (userId === null) {
      return context.json(
        {
          error: {
            code: 'auth.unauthorized',
            message: 'Unauthorized',
          },
        },
        401,
      );
    }

    const body = await context.req.json();
    const name = getValidName(body.name);
    const description = getValidDescription(body.description);

    if (name === null) {
      return context.json(
        {
          error: {
            code: 'vault.invalid_name',
            message: 'Vault name is required',
          },
        },
        400,
      );
    }

    if (
      body.description !== undefined &&
      body.description !== null &&
      typeof body.description !== 'string'
    ) {
      return context.json(
        {
          error: {
            code: 'vault.invalid_description',
            message: 'Vault description must be a string',
          },
        },
        400,
      );
    }

    if (!canCreateVault) {
      const request = await vaultsServices.createPermissionRequest({
        type: 'vault.create',
        requestedBy: userId,
        payload: { name, description },
      });

      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.vaultApprovalRequested,
        entityType: 'permission_request',
        entityId: request.id,
        actor: getAuditActorFromContext(context),
        target: { type: 'permission_request', id: request.id, displayName: name },
        source: 'web',
        visibility: 'requester',
        metadata: { request_type: 'vault.create', vault_name: name },
      });

      return context.json({ request }, 202);
    }

    const vault = await vaultsServices.createVault({ userId, name, description });
    await activityServices?.emitActivityEvent({
      activityType: ACTIVITY_EVENT_TYPES.vaultCreated,
      entityType: 'vault',
      entityId: vault.id,
      actor: getAuditActorFromContext(context),
      vaultId: vault.id,
      target: { type: 'vault', id: vault.id, displayName: vault.name },
      source: 'web',
      metadata: { vault_name: vault.name },
    });
    return context.json({ vault }, 201);
  });

  app.use('/api/vaults/:vaultId', requireVaultAccess({ services: vaultsServices, auditServices }));
  app.use(
    '/api/vaults/:vaultId/*',
    requireVaultAccess({ services: vaultsServices, auditServices }),
  );

  app.get('/api/vaults/:vaultId', async (context) => {
    const userId = context.get('userId');
    const vaultId = context.get('vaultId');

    if (userId === null || vaultId === null) {
      return context.json(
        {
          error: {
            code: 'vault.forbidden',
            message: 'Forbidden',
          },
        },
        403,
      );
    }

    const vault = await vaultsServices.getVaultForUser({ vaultId, userId });

    if (vault === null) {
      return context.json(
        {
          error: {
            code: 'vault.not_found',
            message: 'Vault not found',
          },
        },
        404,
      );
    }

    return context.json({ vault });
  });

  app.patch('/api/vaults/:vaultId', requireCanManageVault(), async (context) => {
    const userId = context.get('userId');
    const vaultId = context.get('vaultId');

    if (userId === null || vaultId === null) {
      return context.json(
        {
          error: {
            code: 'vault.forbidden',
            message: 'Forbidden',
          },
        },
        403,
      );
    }

    const body = await context.req.json();
    const name = getValidName(body.name);
    const description = getValidDescription(body.description);

    if (name === null) {
      return context.json(
        {
          error: {
            code: 'vault.invalid_name',
            message: 'Vault name is required',
          },
        },
        400,
      );
    }

    if (
      body.description !== undefined &&
      body.description !== null &&
      typeof body.description !== 'string'
    ) {
      return context.json(
        {
          error: {
            code: 'vault.invalid_description',
            message: 'Vault description must be a string',
          },
        },
        400,
      );
    }

    const previousVault =
      userId === null ? null : await vaultsServices.getVaultForUser({ vaultId, userId });
    const vault = await vaultsServices.updateVaultIdentity({ vaultId, name, description });

    if (vault === null) {
      return context.json(
        {
          error: {
            code: 'vault.not_found',
            message: 'Vault not found',
          },
        },
        404,
      );
    }

    await activityServices?.emitActivityEvent({
      activityType: ACTIVITY_EVENT_TYPES.vaultMetadataUpdated,
      entityType: 'vault',
      entityId: vaultId,
      actor: getAuditActorFromContext(context),
      vaultId,
      target: { type: 'vault', id: vaultId, displayName: vault.name },
      source: 'web',
      metadata: {
        changed_fields: [
          ...(previousVault?.name !== vault.name ? ['name'] : []),
          ...(previousVault?.description !== vault.description ? ['description'] : []),
        ],
        previous_name: previousVault?.name ?? null,
        next_name: vault.name,
        previous_description: previousVault?.description ?? null,
        next_description: vault.description,
      },
    });

    return context.json({ vault });
  });

  app.delete('/api/vaults/:vaultId', requireCanManageVault(), async (context) => {
    const userId = context.get('userId');
    const vaultId = context.get('vaultId');

    if (userId === null || vaultId === null) {
      return context.json(
        {
          error: {
            code: 'vault.forbidden',
            message: 'Forbidden',
          },
        },
        403,
      );
    }

    if (!context.get('isAdmin')) {
      const request = await vaultsServices.createPermissionRequest({
        type: 'vault.delete',
        requestedBy: userId,
        vaultId,
        payload: {},
      });

      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.vaultApprovalRequested,
        entityType: 'permission_request',
        entityId: request.id,
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'vault', id: vaultId },
        source: 'web',
        visibility: 'owners',
        metadata: { request_type: 'vault.delete' },
      });

      return context.json({ request }, 202);
    }

    const deletedVault = await vaultsServices.hardDeleteVault({
      vaultId,
    });

    if (deletedVault === null) {
      return context.json(
        {
          error: {
            code: 'vault.not_found',
            message: 'Vault not found',
          },
        },
        404,
      );
    }

    return context.body(null, 204);
  });

  registerVaultMemberRoutes({ app, vaultsServices, auditServices, activityServices });
}
