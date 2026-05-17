import type { VaultRole } from './vaults.types.js';
import type { VaultsServices } from './vaults.services.js';
import { createMiddleware } from 'hono/factory';

type VaultAuthorizationPredicate = (args: {
  isRoot: boolean;
  role: VaultRole | null;
  aiAccessLevel: 'none' | 'document_chat' | 'full';
}) => boolean;

function forbidden(context: Parameters<Parameters<typeof createMiddleware>[0]>[0]) {
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

function requireVaultAuthorization(predicate: VaultAuthorizationPredicate) {
  return createMiddleware(async (context, next) => {
    const isRoot = context.get('isRoot');
    const role = context.get('vaultRole');
    const aiAccessLevel = context.get('vaultAiAccessLevel');

    if (!predicate({ isRoot, role, aiAccessLevel })) {
      return forbidden(context);
    }

    await next();
  });
}

function canReadRole(role: VaultRole | null) {
  return role === 'owner' || role === 'editor' || role === 'viewer';
}

function canMutateDocumentsRole(role: VaultRole | null) {
  return role === 'owner' || role === 'editor';
}

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
    context.set('vaultAiAccessLevel', vault.aiAccessLevel);
    context.set('isRoot', vault.isRoot || context.get('isRoot'));

    await next();
  });
}

export function requireVaultRole(...roles: VaultRole[]) {
  return createMiddleware(async (context, next) => {
    if (context.get('isRoot')) {
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

export function requireCanReadVault() {
  return requireVaultAuthorization(({ isRoot, role }) => isRoot || canReadRole(role));
}

export function requireCanMutateVaultDocuments() {
  return requireVaultAuthorization(({ isRoot, role }) => isRoot || canMutateDocumentsRole(role));
}

export function requireCanManageVaultMembers() {
  return requireVaultAuthorization(({ isRoot, role }) => isRoot || role === 'owner');
}

export function requireCanManageVault() {
  return requireVaultAuthorization(({ isRoot, role }) => isRoot || role === 'owner');
}

export function requireCanUseDocumentChat() {
  return requireVaultAuthorization(({ aiAccessLevel }) =>
    aiAccessLevel === 'document_chat' || aiAccessLevel === 'full',
  );
}

export function requireCanUseSemanticRetrieval() {
  return requireVaultAuthorization(({ aiAccessLevel }) => aiAccessLevel === 'full');
}
