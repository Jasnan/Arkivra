import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultRole } from './vaults.types.js';
import type { VaultsServices } from './vaults.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { createVaultsServices } from './vaults.services.js';
import { requireVaultAccess, requireVaultRole } from './vaults.middleware.js';

function getValidName(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim();
  return name.length > 0 ? name : null;
}

function getValidRole(value: unknown): VaultRole | null {
  return value === 'owner' || value === 'admin' || value === 'member' ? value : null;
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

    const vault = await vaultsServices.createVault({ userId, name });
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

  app.patch('/api/vaults/:vaultId', requireVaultRole('owner', 'admin'), async (context) => {
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

    const vault = await vaultsServices.updateVaultName({ vaultId, name });

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

  app.post('/api/vaults/:vaultId/members', requireVaultRole('owner', 'admin'), async (context) => {
    const vaultId = context.get('vaultId');
    const currentRole = context.get('vaultRole');

    if (vaultId === null || currentRole === null) {
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

    if (currentRole !== 'owner' && role === 'owner') {
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
    });

    return context.json({ member }, 201);
  });

  app.patch('/api/vaults/:vaultId/members/:memberUserId', requireVaultRole('owner', 'admin'), async (context) => {
    const vaultId = context.get('vaultId');
    const currentRole = context.get('vaultRole');

    if (vaultId === null || currentRole === null) {
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

    if (currentRole !== 'owner' && (role === 'owner' || targetMember.role === 'owner')) {
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
    });

    return context.json({ member });
  });

  app.delete('/api/vaults/:vaultId/members/:memberUserId', requireVaultRole('owner', 'admin'), async (context) => {
    const vaultId = context.get('vaultId');
    const currentRole = context.get('vaultRole');

    if (vaultId === null || currentRole === null) {
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

    if (currentRole !== 'owner' && targetMember.role === 'owner') {
      return context.json(
        {
          error: {
            code: 'vault.forbidden',
            message: 'Only owner can remove owner',
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
  });
}
