import type { Hono } from 'hono';
import type { AuthorizationServices } from '../authorization/authorization.services.js';
import type { Config } from '../config/config.js';
import type { ServerContext } from '../server/server.types.js';
import type { Auth } from './auth.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';

function getAuditRequestContext(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');

  return {
    ipAddress: request.headers.get('cf-connecting-ip')
      ?? request.headers.get('x-real-ip')
      ?? forwardedFor?.split(',')[0]?.trim()
      ?? null,
    userAgent: request.headers.get('user-agent') ?? null,
    requestId: request.headers.get('x-request-id') ?? request.headers.get('x-correlation-id') ?? null,
  };
}

export function registerAuthRoutes({
  app,
  auth,
  auditServices,
  authorizationServices,
  config,
}: {
  app: Hono<ServerContext>;
  auth: Auth;
  auditServices?: ReturnType<typeof createAuditServices>;
  authorizationServices: AuthorizationServices;
  config: Config;
}) {
  // Better Auth handles all /api/auth/* routes (signup, login, logout, session, 2FA, etc.)
  const handleAuthRequest = async (context: Parameters<typeof app.on>[2] extends (...args: infer A) => any ? A[0] : never) => {
    if (context.req.path === '/api/auth/link-social') {
      const sessionData = await auth.api.getSession({ headers: context.req.raw.headers }).catch(() => null);

      await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        eventCategory: 'auth',
        severity: 'warning',
        outcome: 'denied',
        actor: {
          id: sessionData?.user.id ?? null,
          type: sessionData?.user.id ? 'user' : 'unknown',
          displayName: sessionData?.user.name?.trim() || sessionData?.user.email?.trim() || null,
        },
        target: {
          type: 'user',
          id: sessionData?.user.id ?? null,
          displayName: sessionData?.user.name?.trim() || sessionData?.user.email?.trim() || null,
        },
        source: 'api',
        requestContext: getAuditRequestContext(context.req.raw),
        metadata: {
          action: 'oauth.link',
          reason: 'direct_auth_endpoint_blocked',
        },
      }).catch(error => console.error('Failed to write blocked OAuth link audit event', error));

      return context.json(
        {
          error: {
            code: 'security.use_sensitive_action_route',
            message: 'Connect sign-in providers from Security settings.',
          },
        },
        403,
      );
    }

    if (context.req.path === '/api/auth/sign-up/email' && context.req.method === 'POST') {
      const body = await context.req.raw.clone().json().catch(() => ({})) as {
        email?: unknown;
        invitationId?: unknown;
        invitationToken?: unknown;
      };
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
      const rawInvitationToken = typeof body.invitationToken === 'string' ? body.invitationToken : undefined;
      const invitationId = typeof body.invitationId === 'string'
        ? body.invitationId
        : rawInvitationToken?.startsWith('invite_')
          ? rawInvitationToken
          : undefined;
      const invitationToken = rawInvitationToken?.startsWith('invite_') ? undefined : rawInvitationToken;
      if (!config.auth.isRegistrationEnabled && await authorizationServices.hasAnyUsers()) {
        if (email === null) {
          return context.json(
            { error: { code: 'auth.invitation_required', message: 'Email invitation required' } },
            403,
          );
        }

        const invitation = await authorizationServices.getPendingEmailInvitation({
          invitationId,
          invitationToken,
          email,
        });
        if (invitation === null) {
          return context.json(
            { error: { code: 'auth.invitation_required', message: 'Email invitation required' } },
            403,
          );
        }
      }

      const response = await auth.handler(context.req.raw);

      if (response.ok && email !== null) {
        await authorizationServices.acceptEmailInvitationForRegisteredUser({ invitationId, invitationToken, email });
      }

      return response;
    }

    return auth.handler(context.req.raw);
  };

  app.on(['POST', 'GET'], '/api/auth', handleAuthRequest);
  app.on(['POST', 'GET'], '/api/auth/*', handleAuthRequest);

  // Session extraction middleware — runs on ALL routes after auth routes
  // Extracts user/session from cookie and sets it on context
  app.use('*', async (context, next) => {
    const sessionData = await auth.api.getSession({ headers: context.req.raw.headers });

    if (sessionData) {
      const { user, session } = sessionData;
      await authorizationServices.ensureBootstrapAdmin({ userId: user.id });
      const authorizationState = await authorizationServices.getUserAuthorizationState({
        userId: user.id,
      });

      if (authorizationState?.disabledAt !== null) {
        context.set('userDisabled', true);
      } else {
        context.set('userId', user.id);
        context.set('user', user);
        context.set('session', session);
        context.set('systemRole', authorizationState?.systemRole ?? 'member');
        context.set('systemCapabilities', authorizationState?.systemCapabilities ?? []);
        context.set('isAdmin', authorizationState?.isAdmin ?? false);
        context.set('canCreateVault', authorizationState?.canCreateVault ?? false);
        context.set('canUseAI', authorizationState?.canUseAI ?? false);
      }
    }

    return next();
  });
}
