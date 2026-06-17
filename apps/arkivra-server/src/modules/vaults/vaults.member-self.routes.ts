import type { Hono } from 'hono';
import type { createActivityServices } from '../activity/activity.services.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import { getAuditActorFromContext } from '../audit/audit.http.js';
import type { ServerContext } from '../server/server.types.js';
import { getValidAiAccessLevel, getValidName, getValidRole } from './vaults.route-helpers.js';
import { requireVaultRole } from './vaults.middleware.js';
import type { VaultsServices } from './vaults.services.js';

export function registerVaultMemberSelfRoutes({
  app,
  vaultsServices,
  activityServices,
}: {
  app: Hono<ServerContext>;
  vaultsServices: VaultsServices;
  activityServices?: ReturnType<typeof createActivityServices>;
}) {
  app.post('/api/vaults/:vaultId/membership/self', async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');
    const isAdmin = context.get('isAdmin');

    if (vaultId === null || userId === null || !isAdmin) {
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

    const body = await context.req.json().catch(() => ({}));
    const role = getValidRole(body.role);
    const aiAccessLevel = getValidAiAccessLevel(body.aiAccessLevel);

    if (role === null || aiAccessLevel === null) {
      return context.json(
        {
          error: {
            code: 'vault.invalid_member_payload',
            message: 'role and aiAccessLevel are required',
          },
        },
        400,
      );
    }

    const member = await vaultsServices.upsertMember({
      vaultId,
      userId,
      role,
      aiAccessLevel,
    });

    return context.json({ member }, 201);
  });

  app.delete('/api/vaults/:vaultId/membership/self', async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');
    const isAdmin = context.get('isAdmin');
    const isMember = context.get('vaultIsMember');

    if (vaultId === null || userId === null || !isAdmin) {
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

    if (!isMember) {
      return context.json(
        {
          error: {
            code: 'vault.member_not_found',
            message: 'Member not found',
          },
        },
        404,
      );
    }

    try {
      const removed = await vaultsServices.removeMember({ vaultId, userId });

      if (removed === null) {
        return context.json(
          {
            error: {
              code: 'vault.member_not_found',
              message: 'Member not found',
            },
          },
          404,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'authorization.last_vault_owner') {
        return context.json(
          {
            error: {
              code: 'vault.last_owner',
              message: 'Owner must transfer ownership before leaving',
            },
          },
          403,
        );
      }

      throw error;
    }

    return context.body(null, 204);
  });

  app.post('/api/vaults/:vaultId/ownership', requireVaultRole('owner'), async (context) => {
    const vaultId = context.get('vaultId');
    const requestedBy = context.get('userId');

    if (vaultId === null || requestedBy === null) {
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
    const memberUserId = getValidName(body.userId);

    if (memberUserId === null) {
      return context.json(
        {
          error: {
            code: 'vault.invalid_member_payload',
            message: 'userId is required',
          },
        },
        400,
      );
    }

    if (!context.get('isAdmin')) {
      const request = await vaultsServices.createPermissionRequest({
        type: 'vault.owner_promote',
        requestedBy,
        vaultId,
        targetUserId: memberUserId,
        payload: { role: 'owner' },
      });

      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.vaultApprovalRequested,
        entityType: 'permission_request',
        entityId: request.id,
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'user', id: memberUserId },
        source: 'web',
        visibility: 'owners',
        metadata: { request_type: 'vault.owner_promote', member_user_id: memberUserId },
      });

      return context.json({ request }, 202);
    }

    const member = await vaultsServices.upsertMember({
      vaultId,
      userId: memberUserId,
      role: 'owner',
      aiAccessLevel: 'none',
    });

    await activityServices?.emitActivityEvent({
      activityType: ACTIVITY_EVENT_TYPES.vaultMemberRoleChanged,
      entityType: 'vault',
      entityId: vaultId,
      actor: getAuditActorFromContext(context),
      vaultId,
      target: { type: 'user', id: memberUserId },
      source: 'web',
      metadata: { member_user_id: memberUserId, next_role: 'owner', next_ai_access_level: 'none' },
    });

    return context.json({ member });
  });
}
