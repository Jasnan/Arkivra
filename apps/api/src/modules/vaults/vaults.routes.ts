import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultRole } from './vaults.types.js';
import type { VaultMemberPermission } from '../authorization/authorization.types.js';
import type { VaultsServices } from './vaults.services.js';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  isVaultMemberPermission,
  normalizeVaultMemberPermissions,
} from '../authorization/authorization.types.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { createVaultsServices } from './vaults.services.js';
import {
  requireVaultAccess,
  requireVaultPermission,
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
  return value === 'owner' || value === 'member' ? value : null;
}

function getValidPermissions(value: unknown): VaultMemberPermission[] | null {
  if (value === undefined) {
    return [...DEFAULT_MEMBER_PERMISSIONS];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const permissions = value.filter(isVaultMemberPermission);

  if (permissions.length !== value.length) {
    return null;
  }

  return normalizeVaultMemberPermissions(permissions);
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

    if (!canCreateVault) {
      return context.json(
        {
          error: {
            code: 'authorization.vault_creator_required',
            message: 'Vault creation permission required',
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
    requireVaultPermission('members.manage'),
    async (context) => {
      const vaultId = context.get('vaultId');
      const currentRole = context.get('vaultRole');
      const isGlobalAdmin = context.get('isGlobalAdmin');

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
      const memberUserId = getValidName(body.userId);
      const role = getValidRole(body.role);
      const permissions = getValidPermissions(body.permissions);

      if (memberUserId === null || role === null || permissions === null) {
        return context.json(
          {
            error: {
              code: 'vault.invalid_member_payload',
              message: 'userId, role, and permissions are required',
            },
          },
          400,
        );
      }

      if (!isGlobalAdmin && currentRole !== 'owner' && role === 'owner') {
        return context.json(
          {
            error: {
              code: 'vault.forbidden',
              message: 'Only owner can assign owner role',
            },
          },
          403,
        );
      }

      const member = await vaultsServices.upsertMember({
        vaultId,
        userId: memberUserId,
        role,
        permissions,
      });

      return context.json({ member }, 201);
    },
  );

  app.patch(
    '/api/vaults/:vaultId/members/:memberUserId',
    requireVaultPermission('members.manage'),
    async (context) => {
      const vaultId = context.get('vaultId');
      const currentRole = context.get('vaultRole');
      const isGlobalAdmin = context.get('isGlobalAdmin');

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
      const body = await context.req.json();
      const role = getValidRole(body.role);
      const permissions = getValidPermissions(body.permissions);

      if (memberUserId.length === 0 || role === null || permissions === null) {
        return context.json(
          {
            error: {
              code: 'vault.invalid_member_payload',
              message: 'Valid memberUserId, role, and permissions are required',
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

      if (
        !isGlobalAdmin &&
        currentRole !== 'owner' &&
        (role === 'owner' || targetMember.role === 'owner')
      ) {
        return context.json(
          {
            error: {
              code: 'vault.forbidden',
              message: 'Only owner can manage owner role',
            },
          },
          403,
        );
      }

      const member = await vaultsServices.upsertMember({
        vaultId,
        userId: memberUserId,
        role,
        permissions,
      });

      return context.json({ member });
    },
  );

  app.delete(
    '/api/vaults/:vaultId/members/:memberUserId',
    requireVaultPermission('members.manage'),
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

    const member = await vaultsServices.upsertMember({
      vaultId,
      userId: memberUserId,
      role: 'owner',
    });

    return context.json({ member });
  });
}
