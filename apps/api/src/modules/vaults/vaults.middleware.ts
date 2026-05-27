import type { VaultRole } from './vaults.types.js';
import type { VaultsServices } from './vaults.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { createMiddleware } from 'hono/factory';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';

type VaultAuthorizationPredicate = (args: {
  isAdmin: boolean;
  role: VaultRole | null;
  aiAccessLevel: 'none' | 'document_chat' | 'full';
  isMember: boolean;
  accessMode: 'member' | 'admin' | null;
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

type AuditServices = ReturnType<typeof createAuditServices>;

function getDocumentAccessDeniedAction(method: string, path: string) {
  if (!path.includes('/documents/')) {
    return null;
  }

  if (method === 'DELETE') {
    return 'delete';
  }

  if (method === 'GET') {
    return path.endsWith('/download') ? 'download' : 'view';
  }

  return method === 'POST' || method === 'PATCH' || method === 'PUT' ? 'modify' : 'access';
}

function requireVaultAuthorization(
  predicate: VaultAuthorizationPredicate,
  options: { auditServices?: AuditServices } = {},
) {
  return createMiddleware(async (context, next) => {
    const isAdmin = context.get('isAdmin');
    const role = context.get('vaultRole');
    const aiAccessLevel = context.get('vaultAiAccessLevel');
    const isMember = context.get('vaultIsMember');
    const accessMode = context.get('vaultAccessMode');

    if (!predicate({ isAdmin, role, aiAccessLevel, isMember, accessMode })) {
      const action = getDocumentAccessDeniedAction(context.req.method, context.req.path);
      const vaultId = context.get('vaultId') ?? context.req.param('vaultId') ?? null;
      const documentId = context.req.param('documentId') || null;

      if (options.auditServices !== undefined && action !== null) {
        await options.auditServices.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.documentAccessDenied,
          eventCategory: 'permission',
          outcome: 'denied',
          actor: getAuditActorFromContext(context),
          vaultId,
          documentId,
          target: { type: 'document', id: documentId },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: { action },
        });
      }

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

export function requireVaultAccess({
  services,
  auditServices,
}: {
  services: VaultsServices;
  auditServices?: AuditServices;
}) {
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
      const documentId = context.req.param('documentId') || null;
      await auditServices?.emitAuditEvent({
        eventType: documentId === null
          ? AUDIT_EVENT_TYPES.vaultAccessDenied
          : AUDIT_EVENT_TYPES.documentAccessDenied,
        eventCategory: 'permission',
        outcome: 'denied',
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: {
          type: documentId === null ? 'vault' : 'document',
          id: documentId ?? vaultId,
        },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: { action: documentId === null ? 'access' : getDocumentAccessDeniedAction(context.req.method, context.req.path) ?? 'access' },
      });

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
    context.set('vaultIsMember', vault.isMember);
    context.set('vaultAccessMode', vault.accessMode);
    context.set('isAdmin', vault.isAdmin || context.get('isAdmin'));

    await next();
  });
}

export function requireVaultRole(...roles: VaultRole[]) {
  return createMiddleware(async (context, next) => {
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

export function requireCanReadVault(options: { auditServices?: AuditServices } = {}) {
  return requireVaultAuthorization(({ role }) => canReadRole(role), options);
}

export function requireCanMutateVaultDocuments(options: { auditServices?: AuditServices } = {}) {
  return requireVaultAuthorization(({ role }) => canMutateDocumentsRole(role), options);
}

export function requireCanManageVaultMembers() {
  return requireVaultAuthorization(({ role }) => role === 'owner');
}

export function requireCanManageVault() {
  return requireVaultAuthorization(({ role }) => role === 'owner');
}

export function requireCanUseDocumentChat() {
  return requireVaultAuthorization(({ aiAccessLevel }) =>
    aiAccessLevel === 'document_chat' || aiAccessLevel === 'full',
  );
}

export function requireCanUseSemanticRetrieval() {
  return requireVaultAuthorization(({ aiAccessLevel }) => aiAccessLevel === 'full');
}
