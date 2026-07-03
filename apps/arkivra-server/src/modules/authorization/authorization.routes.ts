import type { Hono } from 'hono';
import type { AuthorizationServices } from './authorization.services.js';
import type { ServerContext } from '../server/server.types.js';
import type { createActivityServices } from '../activity/activity.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireAdmin } from './authorization.middleware.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import {
  isEmailInvitationType,
  isSystemCapability,
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

function parseSystemCapabilities(value: unknown) {
  if (value === undefined || value === null) {
    return [] as const;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const capabilities = value.filter(isSystemCapability);
  return capabilities.length === value.length ? [...new Set(capabilities)] : null;
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

function getApprovalAuditEventType(type: string) {
  if (type === 'vault.owner_promote') return 'vault.owner_promotion_approved';
  if (type === 'vault.external_invite') return 'vault.external_invitation_approved';
  return 'permission_request.approved';
}

function getRejectionAuditEventType(type: string) {
  if (type === 'vault.owner_promote') return 'vault.owner_promotion_rejected';
  if (type === 'vault.external_invite') return 'vault.external_invitation_rejected';
  return 'permission_request.rejected';
}

export function registerAuthorizationRoutes({
  app,
  authorizationServices,
  activityServices,
  auditServices,
}: {
  app: Hono<ServerContext>;
  authorizationServices: AuthorizationServices;
  activityServices?: ReturnType<typeof createActivityServices>;
  auditServices?: ReturnType<typeof createAuditServices>;
}) {
  app.use('/api/admin/permission-requests', requireAuthentication(), requireAdmin());
  app.use('/api/admin/permission-requests/*', requireAuthentication(), requireAdmin());
  app.use('/api/admin/email-invitations', requireAuthentication(), requireAdmin());
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

      await auditServices?.emitAuditEvent({
        eventType: getApprovalAuditEventType(request.type),
        eventCategory: 'permission',
        severity: 'notice',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId: request.type === 'vault.delete'
          ? null
          : typeof request.result?.vaultId === 'string'
            ? request.result.vaultId
            : request.vaultId,
        target: { type: 'permission_request', id: request.id },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: {
          request_type: request.type,
          requested_by: request.requestedBy,
          request_payload: request.payload,
          request_result: request.result,
        },
      });
      if (request.type === 'vault.create' && typeof request.result?.vaultId === 'string') {
        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.vaultApproved,
          entityType: 'vault',
          entityId: request.result.vaultId,
          actor: getAuditActorFromContext(context),
          vaultId: request.result.vaultId,
          target: { type: 'vault', id: request.result.vaultId },
          source: 'web',
          metadata: { request_id: request.id, request_type: request.type },
        });
        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.vaultCreated,
          entityType: 'vault',
          entityId: request.result.vaultId,
          actor: { id: request.requestedBy, type: 'user' },
          vaultId: request.result.vaultId,
          target: { type: 'vault', id: request.result.vaultId },
          source: 'web',
          metadata: { request_id: request.id, request_type: request.type },
        });
      } else if (request.type !== 'vault.delete' && request.vaultId !== null) {
        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.vaultApproved,
          entityType: 'vault',
          entityId: request.vaultId,
          actor: getAuditActorFromContext(context),
          vaultId: request.vaultId,
          target: { type: 'permission_request', id: request.id },
          source: 'web',
          metadata: { request_id: request.id, request_type: request.type },
        });
      }

      return context.json({ request });
    } catch (error) {
      if (error instanceof Error && error.message === 'authorization.permission_request_not_pending') {
        return context.json(
          { error: { code: 'authorization.permission_request_not_pending', message: 'Request is not pending' } },
          409,
        );
      }

      if (error instanceof Error && error.message === 'authorization.vault_not_found') {
        return context.json(
          { error: { code: 'vault.not_found', message: 'Vault not found' } },
          404,
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

    await auditServices?.emitAuditEvent({
        eventType: getRejectionAuditEventType(request.type),
      eventCategory: 'permission',
      severity: 'notice',
      outcome: 'success',
      actor: getAuditActorFromContext(context),
      vaultId: request.vaultId,
      target: { type: 'permission_request', id: request.id },
      source: 'web',
      requestContext: getAuditRequestContext(context),
      metadata: {
        request_type: request.type,
        requested_by: request.requestedBy,
        request_payload: request.payload,
        decision_reason: reason,
      },
    });
    await activityServices?.emitActivityEvent({
      activityType: ACTIVITY_EVENT_TYPES.vaultRejected,
      entityType: request.vaultId === null ? 'permission_request' : 'vault',
      entityId: request.vaultId ?? request.id,
      actor: getAuditActorFromContext(context),
      vaultId: request.vaultId,
      target: { type: 'permission_request', id: request.id },
      source: 'web',
      visibility: request.vaultId === null ? 'requester' : 'owners',
      metadata: { request_id: request.id, request_type: request.type },
    });

    return context.json({ request });
  });

  app.post('/api/admin/email-invitations', async (context) => {
    const invitedBy = context.get('userId');
    const body = await context.req.json().catch(() => null) as {
      type?: unknown;
      email?: unknown;
      vaultId?: unknown;
      role?: unknown;
      systemRole?: unknown;
      systemCapabilities?: unknown;
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
    const systemRole = type === 'platform_account' ? body?.systemRole ?? 'admin' : null;
    const systemCapabilities = type === 'platform_account'
      ? parseSystemCapabilities(body?.systemCapabilities)
      : [];
    const vaultId = typeof body?.vaultId === 'string' && body.vaultId.trim().length > 0
      ? body.vaultId.trim()
      : null;

    if (
      (type === 'platform_account' && !isSystemRole(systemRole))
      || (type === 'vault_member' && (vaultId === null || !isVaultRole(role)))
      || systemCapabilities === null
    ) {
      return context.json(
        { error: { code: 'authorization.invalid_invitation_payload', message: 'Invalid invitation payload' } },
        400,
      );
    }

    const vaultRole = type === 'vault_member' && isVaultRole(role) ? role : null;
    const invitationSystemRole = type === 'platform_account' && isSystemRole(systemRole) ? systemRole : null;
    const invitation = await authorizationServices.createEmailInvitation({
      type,
      email,
      invitedBy,
      vaultId,
      vaultRole,
      systemRole: invitationSystemRole,
      expiresAt,
      payload: type === 'platform_account' ? { systemCapabilities } : {},
    });

    return context.json({ invitation }, 201);
  });
}
