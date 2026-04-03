import type { VaultRole } from './vaults.types.js';
import type { VaultMemberPermission } from '../authorization/authorization.types.js';
import type { VaultsServices } from './vaults.services.js';
import { createMiddleware } from 'hono/factory';

export function requireVaultAccess({ services }: { services: VaultsServices }) {
  return createMiddleware(async (context, next) => {
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

    const vaultId = context.req.param('vaultId');

    if (typeof vaultId !== 'string' || vaultId.length === 0) {
      return context.json(
        {
          error: {
            code: 'vault.invalid_id',
            message: 'Invalid vault id',
          },
        },
        400,
      );
    }

    const vault = await services.getVaultForUser({ vaultId, userId });

    if (vault === null) {
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

    context.set('vaultId', vaultId);
    context.set('vaultRole', vault.role);
    context.set('vaultPermissions', vault.permissions);
    context.set('isGlobalAdmin', vault.isGlobalAdmin || context.get('isGlobalAdmin'));

    await next();
  });
}

export function requireVaultRole(...roles: VaultRole[]) {
  return createMiddleware(async (context, next) => {
    if (context.get('isGlobalAdmin')) {
      await next();
      return;
    }

    const vaultRole = context.get('vaultRole');

    if (vaultRole === null || !roles.includes(vaultRole)) {
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

    await next();
  });
}

export function requireVaultPermission(...permissions: VaultMemberPermission[]) {
  return createMiddleware(async (context, next) => {
    if (context.get('isGlobalAdmin') || context.get('vaultRole') === 'owner') {
      await next();
      return;
    }

    const vaultPermissions = context.get('vaultPermissions');

    if (!permissions.every((permission) => vaultPermissions.includes(permission))) {
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

    await next();
  });
}
