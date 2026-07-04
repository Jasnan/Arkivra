import type { Hono } from 'hono';
import type { createActivityServices } from '../activity/activity.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from './vaults.services.js';
import {
  requireCanManageVaultMembers,
  requireCanViewVaultManagement,
} from './vaults.middleware.js';
import { getValidEmail, getValidName, getValidRole } from './vaults.route-helpers.js';
import {
  emitVaultExternalInvitationRequested,
  emitVaultMemberAdded,
  emitVaultMemberRemoved,
  emitVaultMemberUpdated,
  emitVaultOwnerPromotionRequested,
} from './vaults.member-route-events.js';

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

  app.post('/api/vaults/:vaultId/ownership', requireCanManageVaultMembers(), async (context) => {
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

    if (!isAdmin) {
      const request = await vaultsServices.createPermissionRequest({
        type: 'vault.owner_promote',
        requestedBy,
        vaultId,
        targetUserId: memberUserId,
        payload: { role: 'owner' },
      });

      await emitVaultOwnerPromotionRequested({
        context,
        auditServices,
        vaultId,
        memberUserId,
        requestId: request.id,
      });

      return context.json({ request }, 202);
    }

    const member = await vaultsServices.upsertMember({
      vaultId,
      userId: memberUserId,
      role: 'owner',
    });

    await emitVaultMemberUpdated({
      context,
      auditServices,
      activityServices,
      vaultId,
      memberUserId,
      previousRole: targetMember.role,
      nextRole: 'owner',
    });

    return context.json({ member });
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
      const expiresAt =
        typeof body.expiresAt === 'string' && body.expiresAt.trim().length > 0
          ? new Date(body.expiresAt)
          : null;

      if (
        email === null ||
        role === null ||
        (expiresAt !== null && Number.isNaN(expiresAt.getTime()))
      ) {
        return context.json(
          {
            error: {
              code: 'vault.invalid_invitation_payload',
              message: 'Valid email and role are required',
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

            await emitVaultOwnerPromotionRequested({
              context,
              auditServices,
              vaultId,
              memberUserId: existingUser.id,
              requestId: request.id,
              displayName: existingUser.email,
            });

            return context.json({ request }, 202);
          }

          const member = await vaultsServices.upsertMember({
            vaultId,
            userId: existingUser.id,
            role,
          });

          await emitVaultMemberAdded({
            context,
            auditServices,
            activityServices,
            vaultId,
            memberUserId: existingUser.id,
            role,
            displayName: existingUser.email,
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
            expiresAt: expiresAt?.toISOString() ?? null,
          },
        });

        await emitVaultExternalInvitationRequested({
          context,
          auditServices,
          activityServices,
          vaultId,
          requestId: request.id,
          email,
          role,
        });

        return context.json({ request }, 202);
      }

      const invitation = await vaultsServices.createEmailInvitation({
        email,
        invitedBy: requestedBy,
        vaultId,
        role,
        expiresAt,
      });

      return context.json({ invitation }, 201);
    },
  );

  app.post('/api/vaults/:vaultId/members', requireCanManageVaultMembers(), async (context) => {
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

    if (memberUserId === null || role === null) {
      return context.json(
        {
          error: {
            code: 'vault.invalid_member_payload',
            message: 'userId and role are required',
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

      await emitVaultOwnerPromotionRequested({
        context,
        auditServices,
        vaultId,
        memberUserId,
        requestId: request.id,
      });

      return context.json({ request }, 202);
    }

    let member;
    try {
      member = await vaultsServices.upsertMember({
        vaultId,
        userId: memberUserId,
        role,
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

    await emitVaultMemberAdded({
      context,
      auditServices,
      activityServices,
      vaultId,
      memberUserId,
      role,
    });

    return context.json({ member }, 201);
  });

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

      if (memberUserId.length === 0 || role === null) {
        return context.json(
          {
            error: {
              code: 'vault.invalid_member_payload',
              message: 'Valid memberUserId and role are required',
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

        await emitVaultOwnerPromotionRequested({
          context,
          auditServices,
          vaultId,
          memberUserId,
          requestId: request.id,
        });

        return context.json({ request }, 202);
      }

      let member;
      try {
        member = await vaultsServices.upsertMember({
          vaultId,
          userId: memberUserId,
          role,
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

      await emitVaultMemberUpdated({
        context,
        auditServices,
        activityServices,
        vaultId,
        memberUserId,
        previousRole: targetMember.role,
        nextRole: role,
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

      await emitVaultMemberRemoved({
        context,
        auditServices,
        activityServices,
        vaultId,
        memberUserId,
        role: targetMember.role,
      });

      return context.body(null, 204);
    },
  );
}
