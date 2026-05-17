import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { AiAccessLevel, VaultRole } from './vaults.types.js';
import type { VaultsServices } from './vaults.services.js';
import {
  isAiAccessLevel,
} from '../authorization/authorization.types.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { createVaultsServices } from './vaults.services.js';
import {
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
    document_chat: 1,
    full: 2,
  };

  return ranks[next] > ranks[current ?? 'none'];
}

export function registerVaultRoutes({
  app,
  db,
  services,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: VaultsServices;
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

    if (body.description !== undefined && description === null && typeof body.description !== 'string') {
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

      return context.json({ request }, 202);
    }

    const vault = await vaultsServices.createVault({ userId, name, description });
    return context.json({ vault }, 201);
  });

  app.use('/api/vaults/:vaultId', requireVaultAccess({ services: vaultsServices }));
  app.use('/api/vaults/:vaultId/*', requireVaultAccess({ services: vaultsServices }));

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

    if (body.description !== undefined && description === null && typeof body.description !== 'string') {
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

    if (!context.get('isRoot')) {
      const request = await vaultsServices.createPermissionRequest({
        type: 'vault.delete',
        requestedBy: userId,
        vaultId,
        payload: {},
      });

      return context.json({ request }, 202);
    }

    const deletedVault = await vaultsServices.softDeleteVault({
      vaultId,
      deletedBy: userId,
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

  app.get('/api/vaults/:vaultId/members', async (context) => {
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

  app.post(
    '/api/vaults/:vaultId/members',
    requireCanManageVaultMembers(),
    async (context) => {
      const vaultId = context.get('vaultId');
      const requestedBy = context.get('userId');
      const isRoot = context.get('isRoot');

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

      if (!isRoot && role === 'owner') {
        const request = await vaultsServices.createPermissionRequest({
          type: 'vault.owner_promote',
          requestedBy,
          vaultId,
          targetUserId: memberUserId,
          payload: { role },
        });

        return context.json({ request }, 202);
      }

      if (!isRoot && aiAccessLevel !== 'none') {
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
          type: 'vault.ai_escalation',
          requestedBy,
          vaultId,
          targetUserId: memberUserId,
          payload: { aiAccessLevel },
        });

        return context.json({ request }, 202);
      }

      const member = await vaultsServices.upsertMember({
        vaultId,
        userId: memberUserId,
        role,
        aiAccessLevel,
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
      const isRoot = context.get('isRoot');

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

      if (!isRoot && role === 'owner' && targetMember.role !== 'owner') {
        const request = await vaultsServices.createPermissionRequest({
          type: 'vault.owner_promote',
          requestedBy,
          vaultId,
          targetUserId: memberUserId,
          payload: { role },
        });

        return context.json({ request }, 202);
      }

      if (!isRoot && isAiEscalation(targetMember.aiAccessLevel, aiAccessLevel)) {
        if (role !== targetMember.role) {
          await vaultsServices.upsertMember({
            vaultId,
            userId: memberUserId,
            role,
            aiAccessLevel: targetMember.aiAccessLevel,
          });
        }

        const request = await vaultsServices.createPermissionRequest({
          type: 'vault.ai_escalation',
          requestedBy,
          vaultId,
          targetUserId: memberUserId,
          payload: { aiAccessLevel },
        });

        return context.json({ request }, 202);
      }

      const member = await vaultsServices.upsertMember({
        vaultId,
        userId: memberUserId,
        role,
        aiAccessLevel,
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

      if (targetMember.role === 'owner') {
        return context.json(
          {
            error: {
              code: 'vault.forbidden',
              message: 'Owner must transfer ownership before removal',
            },
          },
          403,
        );
      }

      await vaultsServices.removeMember({
        vaultId,
        userId: memberUserId,
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

    if (!context.get('isRoot')) {
      const request = await vaultsServices.createPermissionRequest({
        type: 'vault.owner_promote',
        requestedBy,
        vaultId,
        targetUserId: memberUserId,
        payload: { role: 'owner' },
      });

      return context.json({ request }, 202);
    }

    const member = await vaultsServices.upsertMember({
      vaultId,
      userId: memberUserId,
      role: 'owner',
      aiAccessLevel: 'none',
    });

    return context.json({ member });
  });
}
