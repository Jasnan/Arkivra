import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { AiAccessLevel, VaultRole } from './vaults.types.js';
import type { VaultsServices } from './vaults.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import type { createActivityServices } from '../activity/activity.services.js';
import {
  isAiAccessLevel,
} from '../authorization/authorization.types.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import { createVaultsServices } from './vaults.services.js';
import {
  requireCanViewVaultManagement,
  requireVaultAccess,
  requireCanManageVaultMembers,
  requireVaultRole,
} from './vaults.middleware.js';

function getValidName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim();
  return name.length > 0 ? name : null;
}

function getValidEmail(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  const atIndex = email.indexOf('@');
  const lastDotIndex = email.lastIndexOf('.');
  const hasWhitespace = email.split('').some(character => character.trim().length === 0);

  return (
    !hasWhitespace
    && atIndex > 0
    && atIndex === email.lastIndexOf('@')
    && lastDotIndex > atIndex + 1
    && lastDotIndex < email.length - 1
  )
    ? email
    : null;
}

function getValidDescription(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const description = value.trim();
  return description.length > 0 ? description : null;
}

function getValidRole(value: unknown): VaultRole | null {
  return value === 'owner' || value === 'editor' || value === 'viewer' ? value : null;
}

function getValidAiAccessLevel(value: unknown): AiAccessLevel | null {
  if (value === undefined) {
    return 'none';
  }

  return isAiAccessLevel(value) ? value : null;
}

function isAiEscalation(current: AiAccessLevel | null | undefined, next: AiAccessLevel) {
  const ranks: Record<AiAccessLevel, number> = {
    none: 0,
    full: 1,
  };

  return ranks[next] > ranks[current ?? 'none'];
}

function getMemberUpdateAuditEventType({
  previousRole,
  nextRole,
  previousAiAccessLevel,
  nextAiAccessLevel,
}: {
  previousRole: VaultRole;
  nextRole: VaultRole;
  previousAiAccessLevel: AiAccessLevel;
  nextAiAccessLevel: AiAccessLevel;
}) {
  if (previousRole === 'owner' && nextRole !== 'owner') {
    return AUDIT_EVENT_TYPES.vaultOwnerRoleRemoved;
  }

  if (previousAiAccessLevel !== 'full' && nextAiAccessLevel === 'full') {
    return AUDIT_EVENT_TYPES.vaultAiAccessEnabled;
  }

  if (previousAiAccessLevel === 'full' && nextAiAccessLevel !== 'full') {
    return AUDIT_EVENT_TYPES.vaultAiAccessDisabled;
  }

  return AUDIT_EVENT_TYPES.vaultMemberRoleChanged;
}

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

    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
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
  app.use('/api/vaults/:vaultId/*', requireVaultAccess({ services: vaultsServices, auditServices }));

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

  app.patch('/api/vaults/:vaultId', requireVaultRole('owner'), async (context) => {
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

    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
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

    const previousVault = userId === null ? null : await vaultsServices.getVaultForUser({ vaultId, userId });
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

  app.delete('/api/vaults/:vaultId', requireVaultRole('owner'), async (context) => {
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

    const contentCounts = await vaultsServices.countVaultContents({ vaultId });

    if (contentCounts.totalCount > 0) {
      return context.json(
        {
          error: {
            code: 'vault.not_empty',
            message: 'Empty the vault before deleting it.',
            details: contentCounts,
          },
        },
        409,
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

    const deletedVault = await vaultsServices.softDeleteVault({
      vaultId,
      deletedBy: userId,
    });

    if (deletedVault === null) {
      const updatedContentCounts = await vaultsServices.countVaultContents({ vaultId });

      if (updatedContentCounts.totalCount > 0) {
        return context.json(
          {
            error: {
              code: 'vault.not_empty',
              message: 'Empty the vault before deleting it.',
              details: updatedContentCounts,
            },
          },
          409,
        );
      }

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
      activityType: ACTIVITY_EVENT_TYPES.vaultDeleted,
      entityType: 'vault',
      entityId: vaultId,
      actor: getAuditActorFromContext(context),
      vaultId,
      target: { type: 'vault', id: vaultId },
      source: 'web',
      metadata: { deletion_type: 'soft' },
    });

    return context.body(null, 204);
  });

  app.get('/api/vaults/:vaultId/members', requireCanViewVaultManagement(), async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
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

    const members = await vaultsServices.listMembers({ vaultId });
    return context.json({ members });
  });

  app.get('/api/vaults/:vaultId/invitations', requireCanViewVaultManagement(), async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
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

    const invitations = await vaultsServices.listPendingInvitations({ vaultId });
    return context.json({ invitations });
  });

  app.post(
    '/api/vaults/:vaultId/email-invitations',
    requireCanManageVaultMembers(),
    async (context) => {
      const vaultId = context.get('vaultId');
      const requestedBy = context.get('userId');
      const isAdmin = context.get('isAdmin');

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

      const body = await context.req.json().catch(() => ({}));
      const email = getValidEmail(body.email);
      const role = getValidRole(body.role);
      const aiAccessLevel = getValidAiAccessLevel(body.aiAccessLevel);
      const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt.trim().length > 0
        ? new Date(body.expiresAt)
        : null;

      if (
        email === null
        || role === null
        || aiAccessLevel === null
        || (expiresAt !== null && Number.isNaN(expiresAt.getTime()))
      ) {
        return context.json(
          {
            error: {
              code: 'vault.invalid_invitation_payload',
              message: 'Valid email, role, and aiAccessLevel are required',
            },
          },
          400,
        );
      }

      if (!isAdmin) {
        const existingUser = await vaultsServices.getUserByEmail({ email });

        if (existingUser !== null) {
          if (role === 'owner') {
            const request = await vaultsServices.createPermissionRequest({
              type: 'vault.owner_promote',
              requestedBy,
              vaultId,
              targetUserId: existingUser.id,
              payload: { role: 'owner' },
            });

            await auditServices?.emitAuditEvent({
              eventType: AUDIT_EVENT_TYPES.vaultOwnerPromotionRequested,
              eventCategory: 'permission',
              severity: 'notice',
              outcome: 'success',
              actor: getAuditActorFromContext(context),
              vaultId,
              target: { type: 'user', id: existingUser.id, displayName: existingUser.email },
              source: 'web',
              requestContext: getAuditRequestContext(context),
              metadata: { request_id: request.id, request_type: 'vault.owner_promote', member_user_id: existingUser.id },
            });

            return context.json({ request }, 202);
          }

          if (aiAccessLevel === 'full') {
            const existingMember = await vaultsServices.getMember({ vaultId, userId: existingUser.id });

            if (existingMember === null || existingMember.role !== role) {
              await vaultsServices.upsertMember({
                vaultId,
                userId: existingUser.id,
                role,
                aiAccessLevel: existingMember?.aiAccessLevel ?? 'none',
              });
            }

            const request = await vaultsServices.createPermissionRequest({
              type: 'vault.ai_access_grant',
              requestedBy,
              vaultId,
              targetUserId: existingUser.id,
              payload: { aiAccessLevel: 'full', role },
            });

            await auditServices?.emitAuditEvent({
              eventType: AUDIT_EVENT_TYPES.vaultAiAccessRequested,
              eventCategory: 'permission',
              severity: 'notice',
              outcome: 'success',
              actor: getAuditActorFromContext(context),
              vaultId,
              target: { type: 'user', id: existingUser.id, displayName: existingUser.email },
              source: 'web',
              requestContext: getAuditRequestContext(context),
              metadata: { request_id: request.id, request_type: 'vault.ai_access_grant', member_user_id: existingUser.id },
            });

            return context.json({ request }, 202);
          }

          const member = await vaultsServices.upsertMember({
            vaultId,
            userId: existingUser.id,
            role,
            aiAccessLevel: 'none',
          });

          await auditServices?.emitAuditEvent({
            eventType: AUDIT_EVENT_TYPES.vaultMemberAdded,
            eventCategory: 'vault',
            outcome: 'success',
            actor: getAuditActorFromContext(context),
            vaultId,
            target: { type: 'user', id: existingUser.id, displayName: existingUser.email },
            source: 'web',
            requestContext: getAuditRequestContext(context),
            metadata: { member_user_id: existingUser.id, role, ai_access_level: 'none' },
          });
          await activityServices?.emitActivityEvent({
            activityType: ACTIVITY_EVENT_TYPES.vaultMemberAdded,
            entityType: 'vault',
            entityId: vaultId,
            actor: getAuditActorFromContext(context),
            vaultId,
            target: { type: 'user', id: existingUser.id },
            source: 'web',
            metadata: { member_user_id: existingUser.id, role, ai_access_level: 'none' },
          });

          return context.json({ member }, 201);
        }

        const request = await vaultsServices.createPermissionRequest({
          type: 'vault.external_invite',
          requestedBy,
          vaultId,
          payload: {
            email,
            role,
            aiAccessLevel,
            expiresAt: expiresAt?.toISOString() ?? null,
          },
        });

        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.vaultApprovalRequested,
          entityType: 'permission_request',
          entityId: request.id,
          actor: getAuditActorFromContext(context),
          vaultId,
          target: { type: 'permission_request', id: request.id, displayName: email },
          source: 'web',
          metadata: { request_type: 'vault.external_invite', email, role, ai_access_level: aiAccessLevel },
        });
        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.vaultExternalInvitationRequested,
          eventCategory: 'permission',
          severity: 'notice',
          outcome: 'success',
          actor: getAuditActorFromContext(context),
          vaultId,
          target: { type: 'email_invitation', displayName: email },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: { request_id: request.id, request_type: 'vault.external_invite', email, role, ai_access_level: aiAccessLevel },
        });

        return context.json({ request }, 202);
      }

      const invitation = await vaultsServices.createEmailInvitation({
        email,
        invitedBy: requestedBy,
        vaultId,
        role,
        aiAccessLevel,
        expiresAt,
      });

      return context.json({ invitation }, 201);
    },
  );

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

  app.post(
    '/api/vaults/:vaultId/members',
    requireCanManageVaultMembers(),
    async (context) => {
      const vaultId = context.get('vaultId');
      const requestedBy = context.get('userId');
      const isAdmin = context.get('isAdmin');

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
      const role = getValidRole(body.role);
      const aiAccessLevel = getValidAiAccessLevel(body.aiAccessLevel);

      if (memberUserId === null || role === null || aiAccessLevel === null) {
        return context.json(
          {
            error: {
              code: 'vault.invalid_member_payload',
              message: 'userId, role, and aiAccessLevel are required',
            },
          },
          400,
        );
      }

      if (!isAdmin && role === 'owner') {
        const request = await vaultsServices.createPermissionRequest({
          type: 'vault.owner_promote',
          requestedBy,
          vaultId,
          targetUserId: memberUserId,
          payload: { role },
        });

        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.vaultOwnerPromotionRequested,
          eventCategory: 'permission',
          severity: 'notice',
          outcome: 'success',
          actor: getAuditActorFromContext(context),
          vaultId,
          target: { type: 'user', id: memberUserId },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: { request_id: request.id, request_type: 'vault.owner_promote', member_user_id: memberUserId },
        });

        return context.json({ request }, 202);
      }

      if (!isAdmin && aiAccessLevel !== 'none') {
        const existingMember = await vaultsServices.getMember({ vaultId, userId: memberUserId });

        if (existingMember === null) {
          await vaultsServices.upsertMember({
            vaultId,
            userId: memberUserId,
            role,
            aiAccessLevel: 'none',
          });
        }

        const request = await vaultsServices.createPermissionRequest({
          type: 'vault.ai_access_grant',
          requestedBy,
          vaultId,
          targetUserId: memberUserId,
          payload: { aiAccessLevel, role },
        });

        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.vaultAiAccessRequested,
          eventCategory: 'permission',
          severity: 'notice',
          outcome: 'success',
          actor: getAuditActorFromContext(context),
          vaultId,
          target: { type: 'user', id: memberUserId },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: { request_id: request.id, request_type: 'vault.ai_access_grant', member_user_id: memberUserId },
        });

        return context.json({ request }, 202);
      }

      let member;
      try {
        member = await vaultsServices.upsertMember({
          vaultId,
          userId: memberUserId,
          role,
          aiAccessLevel,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'authorization.last_vault_owner') {
          return context.json(
            {
              error: {
                code: 'vault.last_owner',
                message: 'At least one owner is required',
              },
            },
            403,
          );
        }

        throw error;
      }

      await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.vaultMemberAdded,
        eventCategory: 'vault',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'user', id: memberUserId },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: { member_user_id: memberUserId, role, ai_access_level: aiAccessLevel },
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.vaultMemberAdded,
        entityType: 'vault',
        entityId: vaultId,
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'user', id: memberUserId },
        source: 'web',
        metadata: { member_user_id: memberUserId, role, ai_access_level: aiAccessLevel },
      });

      return context.json({ member }, 201);
    },
  );

  app.patch(
    '/api/vaults/:vaultId/members/:memberUserId',
    requireCanManageVaultMembers(),
    async (context) => {
      const vaultId = context.get('vaultId');
      const requestedBy = context.get('userId');
      const isAdmin = context.get('isAdmin');

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

      const memberUserId = context.req.param('memberUserId').trim();
      const body = await context.req.json();
      const role = getValidRole(body.role);
      const aiAccessLevel = getValidAiAccessLevel(body.aiAccessLevel);

      if (memberUserId.length === 0 || role === null || aiAccessLevel === null) {
        return context.json(
          {
            error: {
              code: 'vault.invalid_member_payload',
              message: 'Valid memberUserId, role, and aiAccessLevel are required',
            },
          },
          400,
        );
      }

      const targetMember = await vaultsServices.getMember({
        vaultId,
        userId: memberUserId,
      });

      if (targetMember === null) {
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

      if (!isAdmin && role === 'owner' && targetMember.role !== 'owner') {
        const request = await vaultsServices.createPermissionRequest({
          type: 'vault.owner_promote',
          requestedBy,
          vaultId,
          targetUserId: memberUserId,
          payload: { role },
        });

        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.vaultOwnerPromotionRequested,
          eventCategory: 'permission',
          severity: 'notice',
          outcome: 'success',
          actor: getAuditActorFromContext(context),
          vaultId,
          target: { type: 'user', id: memberUserId },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: { request_id: request.id, request_type: 'vault.owner_promote', member_user_id: memberUserId },
        });

        return context.json({ request }, 202);
      }

      if (!isAdmin && isAiEscalation(targetMember.aiAccessLevel, aiAccessLevel)) {
        if (role !== targetMember.role) {
          try {
            await vaultsServices.upsertMember({
              vaultId,
              userId: memberUserId,
              role,
              aiAccessLevel: targetMember.aiAccessLevel,
            });
          } catch (error) {
            if (error instanceof Error && error.message === 'authorization.last_vault_owner') {
              return context.json(
                {
                  error: {
                    code: 'vault.last_owner',
                    message: 'At least one owner is required',
                  },
                },
                403,
              );
            }

            throw error;
          }
        }

        const request = await vaultsServices.createPermissionRequest({
          type: 'vault.ai_access_grant',
          requestedBy,
          vaultId,
          targetUserId: memberUserId,
          payload: { aiAccessLevel, role },
        });

        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.vaultAiAccessRequested,
          eventCategory: 'permission',
          severity: 'notice',
          outcome: 'success',
          actor: getAuditActorFromContext(context),
          vaultId,
          target: { type: 'user', id: memberUserId },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: { request_id: request.id, request_type: 'vault.ai_access_grant', member_user_id: memberUserId },
        });

        return context.json({ request }, 202);
      }

      let member;
      try {
        member = await vaultsServices.upsertMember({
          vaultId,
          userId: memberUserId,
          role,
          aiAccessLevel,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'authorization.last_vault_owner') {
          return context.json(
            {
              error: {
                code: 'vault.last_owner',
                message: 'At least one owner is required',
              },
            },
            403,
          );
        }

        throw error;
      }

      await auditServices?.emitAuditEvent({
        eventType: getMemberUpdateAuditEventType({
          previousRole: targetMember.role,
          nextRole: role,
          previousAiAccessLevel: targetMember.aiAccessLevel,
          nextAiAccessLevel: aiAccessLevel,
        }),
        eventCategory: 'vault',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'user', id: memberUserId },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: {
          member_user_id: memberUserId,
          previous_role: targetMember.role,
          next_role: role,
          previous_ai_access_level: targetMember.aiAccessLevel,
          next_ai_access_level: aiAccessLevel,
        },
      });
      await activityServices?.emitActivityEvent({
        activityType: role !== targetMember.role || aiAccessLevel !== targetMember.aiAccessLevel
          ? ACTIVITY_EVENT_TYPES.vaultMemberRoleChanged
          : ACTIVITY_EVENT_TYPES.vaultMemberAdded,
        entityType: 'vault',
        entityId: vaultId,
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'user', id: memberUserId },
        source: 'web',
        metadata: {
          member_user_id: memberUserId,
          previous_role: targetMember.role,
          next_role: role,
          previous_ai_access_level: targetMember.aiAccessLevel,
          next_ai_access_level: aiAccessLevel,
        },
      });

      return context.json({ member });
    },
  );

  app.delete(
    '/api/vaults/:vaultId/members/:memberUserId',
    requireCanManageVaultMembers(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
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

      const memberUserId = context.req.param('memberUserId').trim();

      if (memberUserId.length === 0) {
        return context.json(
          {
            error: {
              code: 'vault.invalid_member_payload',
              message: 'Valid memberUserId is required',
            },
          },
          400,
        );
      }

      const targetMember = await vaultsServices.getMember({
        vaultId,
        userId: memberUserId,
      });

      if (targetMember === null) {
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
        await vaultsServices.removeMember({
          vaultId,
          userId: memberUserId,
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'authorization.last_vault_owner') {
          return context.json(
            {
              error: {
                code: 'vault.last_owner',
                message: 'At least one owner is required',
              },
            },
            403,
          );
        }

        throw error;
      }

      await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.vaultMemberRemoved,
        eventCategory: 'vault',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'user', id: memberUserId },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: { member_user_id: memberUserId, role: targetMember.role },
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.vaultMemberRemoved,
        entityType: 'vault',
        entityId: vaultId,
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'user', id: memberUserId },
        source: 'web',
        metadata: { member_user_id: memberUserId, role: targetMember.role },
      });

      return context.body(null, 204);
    },
  );

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
