import type { Hono } from 'hono';
import type { createActivityServices } from '../activity/activity.services.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from './vaults.services.js';
import {
  requireCanManageVaultMembers,
  requireCanViewVaultManagement,
  requireVaultRole,
} from './vaults.middleware.js';
import {
  getMemberUpdateAuditEventType,
  getValidAiAccessLevel,
  getValidEmail,
  getValidName,
  getValidRole,
  isAiEscalation,
} from './vaults.route-helpers.js';

export function registerVaultMemberRoutes({
  app,
  vaultsServices,
  auditServices,
  activityServices,
}: {
  app: Hono<ServerContext>;
  vaultsServices: VaultsServices;
  auditServices?: ReturnType<typeof createAuditServices>;
  activityServices?: ReturnType<typeof createActivityServices>;
}) {
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
