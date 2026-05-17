import type { Hono } from 'hono';
import type { AuthorizationServices } from './authorization.services.js';
import type { ServerContext } from '../server/server.types.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireRoot } from './authorization.middleware.js';
import {
  isAiAccessLevel,
  isEmailInvitationType,
  isSystemRole,
  isVaultRole,
} from './authorization.types.js';

function parseStatus(value: string | undefined) {
  if (value === undefined || value === 'pending') {
    return 'pending' as const;
  }

  return value === 'approved' || value === 'rejected' || value === 'cancelled' ? value : null;
}

function parseEmail(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  return email.length > 0 && email.includes('@') ? email : null;
}

function parseOptionalDate(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function registerAuthorizationRoutes({
  app,
  authorizationServices,
}: {
  app: Hono<ServerContext>;
  authorizationServices: AuthorizationServices;
}) {
  app.use('/api/admin/permission-requests', requireAuthentication(), requireRoot());
  app.use('/api/admin/permission-requests/*', requireAuthentication(), requireRoot());
  app.use('/api/admin/email-invitations', requireAuthentication(), requireRoot());
  app.use('/api/email-invitations/accept', requireAuthentication());

  app.post('/api/email-invitations/accept', async (context) => {
    const userId = context.get('userId');
    const user = context.get('user');
    const body = await context.req.json().catch(() => ({})) as {
      invitationId?: unknown;
      invitationToken?: unknown;
      email?: unknown;
    };

    if (userId === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const invitationId = typeof body.invitationId === 'string'
      ? body.invitationId
      : typeof body.invitationToken === 'string'
        ? body.invitationToken
        : undefined;
    const email = parseEmail(body.email) ?? parseEmail(user?.email);

    if (email === null) {
      return context.json(
        { error: { code: 'authorization.invalid_invitation_payload', message: 'Invalid invitation payload' } },
        400,
      );
    }

    const invitation = await authorizationServices.acceptEmailInvitation({
      invitationId,
      email,
      userId,
    });

    if (invitation === null) {
      return context.json(
        { error: { code: 'authorization.invitation_not_found', message: 'Invitation not found' } },
        404,
      );
    }

    return context.json({ invitation });
  });

  app.get('/api/admin/permission-requests', async (context) => {
    const status = parseStatus(context.req.query('status'));

    if (status === null) {
      return context.json(
        { error: { code: 'authorization.invalid_request_status', message: 'Invalid request status' } },
        400,
      );
    }

    const requests = await authorizationServices.listPermissionRequests({ status });
    return context.json({ requests });
  });

  app.post('/api/admin/permission-requests/:requestId/approve', async (context) => {
    const reviewedBy = context.get('userId');

    if (reviewedBy === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    try {
      const request = await authorizationServices.approvePermissionRequest({
        requestId: context.req.param('requestId'),
        reviewedBy,
      });

      if (request === null) {
        return context.json(
          { error: { code: 'authorization.permission_request_not_found', message: 'Request not found' } },
          404,
        );
      }

      return context.json({ request });
    } catch (error) {
      if (error instanceof Error && error.message === 'authorization.permission_request_not_pending') {
        return context.json(
          { error: { code: 'authorization.permission_request_not_pending', message: 'Request is not pending' } },
          409,
        );
      }

      throw error;
    }
  });

  app.post('/api/admin/permission-requests/:requestId/reject', async (context) => {
    const reviewedBy = context.get('userId');

    if (reviewedBy === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const body = await context.req.json().catch(() => ({})) as { reason?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;
    const request = await authorizationServices.rejectPermissionRequest({
      requestId: context.req.param('requestId'),
      reviewedBy,
      reason,
    });

    if (request === null) {
      return context.json(
        { error: { code: 'authorization.permission_request_not_found', message: 'Request not found' } },
        404,
      );
    }

    return context.json({ request });
  });

  app.post('/api/admin/email-invitations', async (context) => {
    const invitedBy = context.get('userId');
    const body = await context.req.json().catch(() => null) as {
      type?: unknown;
      email?: unknown;
      vaultId?: unknown;
      role?: unknown;
      aiAccessLevel?: unknown;
      systemRole?: unknown;
      expiresAt?: unknown;
    } | null;
    const type = body?.type;
    const email = parseEmail(body?.email);
    const expiresAt = parseOptionalDate(body?.expiresAt);

    if (!isEmailInvitationType(type) || email === null || expiresAt === undefined) {
      return context.json(
        { error: { code: 'authorization.invalid_invitation_payload', message: 'Invalid invitation payload' } },
        400,
      );
    }

    const role = body?.role;
    const aiAccessLevel = body?.aiAccessLevel ?? 'none';
    const systemRole = body?.systemRole ?? (type === 'root_account' ? 'root' : 'member');
    const vaultId = typeof body?.vaultId === 'string' && body.vaultId.trim().length > 0
      ? body.vaultId.trim()
      : null;

    if (
      (type === 'vault_member' && (vaultId === null || !isVaultRole(role)))
      || !isAiAccessLevel(aiAccessLevel)
      || !isSystemRole(systemRole)
    ) {
      return context.json(
        { error: { code: 'authorization.invalid_invitation_payload', message: 'Invalid invitation payload' } },
        400,
      );
    }

    const vaultRole = type === 'vault_member' && isVaultRole(role) ? role : null;
    const invitation = await authorizationServices.createEmailInvitation({
      type,
      email,
      invitedBy,
      vaultId,
      vaultRole,
      aiAccessLevel,
      systemRole,
      expiresAt,
    });

    return context.json({ invitation }, 201);
  });
}
