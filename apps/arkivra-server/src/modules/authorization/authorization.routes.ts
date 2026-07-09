import type { Hono } from 'hono';
import type { Config } from '../config/config.js';
import type { Auth } from '../auth/auth.services.js';
import type { AuthorizationServices } from './authorization.services.js';
import type { ServerContext } from '../server/server.types.js';
import type { createActivityServices } from '../activity/activity.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { createAuthEmailServices } from '../auth/auth-email.services.js';
import { requireAdmin } from './authorization.middleware.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import {
  createEmailInvitationToken,
  hashEmailInvitationToken,
} from './authorization.services.js';
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

function parseNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildInvitationUrl({ config, token }: { config: Config; token: string }) {
  return new URL(`/accept-invite?token=${encodeURIComponent(token)}`, config.server.webBaseUrl).toString();
}

function getInvitationRoleLabel(systemRole: 'admin' | 'member' | null) {
  return systemRole === 'admin' ? 'administrator' : 'member';
}

async function sendPlatformInvitationEmail({
  config,
  email,
  inviteUrl,
  expiresAt,
  systemRole,
}: {
  config: Config;
  email: string;
  inviteUrl: string;
  expiresAt: Date | null;
  systemRole: 'admin' | 'member' | null;
}) {
  const authEmailServices = createAuthEmailServices({ config });
  const expiryText = expiresAt === null
    ? 'This invitation does not have an expiry date.'
    : `This invitation expires on ${expiresAt.toISOString()}.`;

  await authEmailServices.sendEmail({
    to: email,
    subject: 'You have been invited to Arkivra',
    text: [
      'You have been invited to create an Arkivra account.',
      '',
      `Platform role: ${getInvitationRoleLabel(systemRole)}`,
      expiryText,
      '',
      'Use this link to accept the invitation and set your password:',
      inviteUrl,
      '',
      'If you did not expect this invitation, you can ignore this email.',
    ].join('\n'),
  });
}

function serializeEmailInvitation<T extends { tokenHash?: string | null }>(invitation: T) {
  const { tokenHash: _tokenHash, ...serialized } = invitation;
  return serialized;
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
  auth,
  config,
  authorizationServices,
  activityServices,
  auditServices,
}: {
  app: Hono<ServerContext>;
  auth?: Auth;
  config?: Config;
  authorizationServices: AuthorizationServices;
  activityServices?: ReturnType<typeof createActivityServices>;
  auditServices?: ReturnType<typeof createAuditServices>;
}) {
  app.use('/api/admin/permission-requests', requireAuthentication(), requireAdmin());
  app.use('/api/admin/permission-requests/*', requireAuthentication(), requireAdmin());
  app.use('/api/admin/email-invitations', requireAuthentication(), requireAdmin());
  app.use('/api/admin/email-invitations/*', requireAuthentication(), requireAdmin());
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

    const rawInvitationToken = typeof body.invitationToken === 'string' ? body.invitationToken : undefined;
    const invitationId = typeof body.invitationId === 'string'
      ? body.invitationId
      : rawInvitationToken?.startsWith('invite_')
        ? rawInvitationToken
        : undefined;
    const invitationToken = rawInvitationToken?.startsWith('invite_') ? undefined : rawInvitationToken;
    const email = parseEmail(body.email) ?? parseEmail(user?.email);

    if (email === null) {
      return context.json(
        { error: { code: 'authorization.invalid_invitation_payload', message: 'Invalid invitation payload' } },
        400,
      );
    }

    const invitation = await authorizationServices.acceptEmailInvitation({
      invitationId,
      invitationToken,
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

  app.get('/api/email-invitations/accept-account', async (context) => {
    const token = parseNonEmptyString(context.req.query('token'));

    if (token === null) {
      return context.json(
        { error: { code: 'authorization.invalid_invitation_payload', message: 'Invalid invitation payload' } },
        400,
      );
    }

    const invitation = await authorizationServices.getPendingPlatformInvitationByToken({ token });

    if (invitation === null) {
      return context.json(
        { error: { code: 'authorization.invitation_not_found', message: 'Invitation not found or expired' } },
        404,
      );
    }

    return context.json({
      invitation: {
        email: invitation.email,
        systemRole: invitation.systemRole,
        expiresAt: invitation.expiresAt,
      },
    });
  });

  app.post('/api/email-invitations/accept-account', async (context) => {
    if (auth === undefined) {
      return context.json(
        { error: { code: 'authorization.invitation_accept_unavailable', message: 'Invitation acceptance is unavailable.' } },
        500,
      );
    }

    const body = await context.req.json().catch(() => ({})) as {
      token?: unknown;
      name?: unknown;
      password?: unknown;
    };
    const token = parseNonEmptyString(body.token);
    const name = parseNonEmptyString(body.name);
    const password = typeof body.password === 'string' ? body.password : null;

    if (token === null || name === null || password === null) {
      return context.json(
        { error: { code: 'authorization.invalid_invitation_payload', message: 'Invalid invitation payload' } },
        400,
      );
    }

    const authContext = await auth.$context;
    const minPasswordLength = authContext.password.config.minPasswordLength;
    const maxPasswordLength = authContext.password.config.maxPasswordLength;

    if (password.length < minPasswordLength) {
      return context.json(
        { error: { code: 'auth.password_too_short', message: `Password must be at least ${minPasswordLength} characters.` } },
        400,
      );
    }

    if (password.length > maxPasswordLength) {
      return context.json(
        { error: { code: 'auth.password_too_long', message: `Password must be at most ${maxPasswordLength} characters.` } },
        400,
      );
    }

    const passwordHash = await authContext.password.hash(password);

    try {
      const result = await authorizationServices.acceptPlatformInvitationWithPassword({
        token,
        name,
        passwordHash,
      });

      if (result === null) {
        return context.json(
          { error: { code: 'authorization.invitation_not_found', message: 'Invitation not found or expired' } },
          404,
        );
      }

      await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.authPlatformInvitationAccepted,
        eventCategory: 'auth',
        severity: 'notice',
        outcome: 'success',
        actor: {
          id: result.user.id,
          type: 'user',
          displayName: result.user.name ?? result.user.email,
        },
        target: {
          type: 'user',
          id: result.user.id,
          displayName: result.user.email,
        },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: {
          invitation_type: 'platform_account',
          system_role: result.user.systemRole,
        },
      });

      return context.json({
        user: result.user,
        invitation: serializeEmailInvitation(result.invitation),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'authorization.invitation_user_exists') {
        return context.json(
          { error: { code: 'authorization.invitation_user_exists', message: 'A user already exists for this email address.' } },
          409,
        );
      }

      throw error;
    }
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
      if (request.type === 'vault.delete' && typeof request.result?.vaultId === 'string') {
        const vaultName = typeof request.result.vaultName === 'string'
          ? request.result.vaultName
          : null;

        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.vaultDeleted,
          eventCategory: 'vault',
          severity: 'critical',
          outcome: 'success',
          actor: getAuditActorFromContext(context),
          vaultId: request.result.vaultId,
          target: { type: 'vault', id: request.result.vaultId, displayName: vaultName },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: {
            vault_id: request.result.vaultId,
            vault_name: vaultName,
            deletion_type: 'permanent',
            requested_by: request.requestedBy,
          },
        });
      } else if (request.type === 'vault.create' && typeof request.result?.vaultId === 'string') {
        const vaultName = typeof request.result.vaultName === 'string'
          ? request.result.vaultName
          : null;

        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.vaultCreated,
          eventCategory: 'vault',
          outcome: 'success',
          actor: getAuditActorFromContext(context),
          vaultId: request.result.vaultId,
          target: { type: 'vault', id: request.result.vaultId, displayName: vaultName },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: {
            vault_id: request.result.vaultId,
            vault_name: vaultName,
            creation_type: 'approval_request',
            requested_by: request.requestedBy,
          },
        });
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

  app.get('/api/admin/email-invitations', async (context) => {
    const invitations = await authorizationServices.listEmailInvitations({ type: 'platform_account' });
    return context.json({ invitations: invitations.map(serializeEmailInvitation) });
  });

  app.post('/api/admin/email-invitations', async (context) => {
    if (config === undefined) {
      return context.json(
        { error: { code: 'authorization.invitation_email_unavailable', message: 'Invitation email delivery is unavailable.' } },
        500,
      );
    }

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
    const token = type === 'platform_account' ? createEmailInvitationToken() : null;

    try {
      const invitation = await authorizationServices.createEmailInvitation({
        type,
        email,
        invitedBy,
        vaultId,
        vaultRole,
        systemRole: invitationSystemRole,
        expiresAt,
        payload: type === 'platform_account' ? { systemCapabilities } : {},
        tokenHash: token === null ? null : hashEmailInvitationToken(token),
      });

      if (type === 'platform_account' && token !== null) {
        await sendPlatformInvitationEmail({
          config,
          email: invitation.email,
          inviteUrl: buildInvitationUrl({ config, token }),
          expiresAt: invitation.expiresAt,
          systemRole: invitation.systemRole,
        });

        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.authPlatformInvitationSent,
          eventCategory: 'auth',
          severity: 'notice',
          outcome: 'success',
          actor: getAuditActorFromContext(context),
          target: {
            type: 'email_invitation',
            id: invitation.id,
            displayName: invitation.email,
          },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: {
            invitation_type: invitation.type,
            system_role: invitation.systemRole,
            expires_at: invitation.expiresAt?.toISOString() ?? null,
          },
        });
      }

      return context.json({ invitation: serializeEmailInvitation(invitation) }, 201);
    } catch (error) {
      if (error instanceof Error && error.message === 'authorization.invitation_user_exists') {
        return context.json(
          { error: { code: 'authorization.invitation_user_exists', message: 'A user already exists for this email address.' } },
          409,
        );
      }

      if (error instanceof Error && error.message === 'authorization.invitation_already_pending') {
        return context.json(
          { error: { code: 'authorization.invitation_already_pending', message: 'A pending invitation already exists for this email address.' } },
          409,
        );
      }

      throw error;
    }
  });

  app.post('/api/admin/email-invitations/:invitationId/resend', async (context) => {
    if (config === undefined) {
      return context.json(
        { error: { code: 'authorization.invitation_email_unavailable', message: 'Invitation email delivery is unavailable.' } },
        500,
      );
    }

    const token = createEmailInvitationToken();
    const invitation = await authorizationServices.updateEmailInvitationToken({
      invitationId: context.req.param('invitationId'),
      tokenHash: hashEmailInvitationToken(token),
    });

    if (invitation === null) {
      return context.json(
        { error: { code: 'authorization.invitation_not_found', message: 'Pending invitation not found' } },
        404,
      );
    }

    await sendPlatformInvitationEmail({
      config,
      email: invitation.email,
      inviteUrl: buildInvitationUrl({ config, token }),
      expiresAt: invitation.expiresAt,
      systemRole: invitation.systemRole,
    });

    await auditServices?.emitAuditEvent({
      eventType: AUDIT_EVENT_TYPES.authPlatformInvitationResent,
      eventCategory: 'auth',
      severity: 'notice',
      outcome: 'success',
      actor: getAuditActorFromContext(context),
      target: {
        type: 'email_invitation',
        id: invitation.id,
        displayName: invitation.email,
      },
      source: 'web',
      requestContext: getAuditRequestContext(context),
      metadata: {
        invitation_type: invitation.type,
        system_role: invitation.systemRole,
        expires_at: invitation.expiresAt?.toISOString() ?? null,
      },
    });

    return context.json({ invitation: serializeEmailInvitation(invitation) });
  });

  app.delete('/api/admin/email-invitations/:invitationId', async (context) => {
    const invitation = await authorizationServices.revokeEmailInvitation({
      invitationId: context.req.param('invitationId'),
    });

    if (invitation === null) {
      return context.json(
        { error: { code: 'authorization.invitation_not_found', message: 'Pending invitation not found' } },
        404,
      );
    }

    await auditServices?.emitAuditEvent({
      eventType: AUDIT_EVENT_TYPES.authPlatformInvitationRevoked,
      eventCategory: 'auth',
      severity: 'notice',
      outcome: 'success',
      actor: getAuditActorFromContext(context),
      target: {
        type: 'email_invitation',
        id: invitation.id,
        displayName: invitation.email,
      },
      source: 'web',
      requestContext: getAuditRequestContext(context),
      metadata: {
        invitation_type: invitation.type,
        system_role: invitation.systemRole,
      },
    });

    return context.json({ invitation: serializeEmailInvitation(invitation) });
  });
}
