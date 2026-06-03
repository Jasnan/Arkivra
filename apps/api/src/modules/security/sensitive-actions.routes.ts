import type { Hono } from 'hono';
import type { Context } from 'hono';
import type { ServerContext } from '../server/server.types.js';
import type { createAuditServices } from '../audit/audit.services.js';
import type { SensitiveActionServices } from './sensitive-actions.services.js';
import { z } from 'zod';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';

const startTwoFactorSetupSchema = z.object({
  password: z.string().optional(),
});

const verifySensitiveActionSchema = z.object({
  password: z.string().optional(),
});

const requestEmailChangeSchema = z.object({
  callbackURL: z.string().optional(),
  newEmail: z.string().email(),
  password: z.string().optional(),
});

const linkOAuthAccountSchema = z.object({
  callbackURL: z.string().optional(),
  password: z.string(),
  provider: z.enum(['github', 'google']),
});

const setAccountPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

const changeAccountPasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

export function registerSensitiveActionRoutes({
  app,
  auditServices,
  services,
}: {
  app: Hono<ServerContext>;
  auditServices?: ReturnType<typeof createAuditServices>;
  services: SensitiveActionServices;
}) {
  async function emitAccountAuditEvent(
    context: Context<ServerContext>,
    input: {
      after?: Record<string, unknown> | null;
      before?: Record<string, unknown> | null;
      eventType: string;
      metadata?: Record<string, unknown> | null;
      outcome: 'denied' | 'failure' | 'success';
      severity?: 'critical' | 'info' | 'notice' | 'warning';
    },
  ) {
    const user = context.get('user');
    const userId = context.get('userId');
    await auditServices?.emitAuditEvent({
      eventType: input.eventType,
      eventCategory: 'auth',
      severity: input.severity,
      outcome: input.outcome,
      actor: getAuditActorFromContext(context),
      target: {
        type: 'user',
        id: user?.id ?? userId,
        displayName: user?.name?.trim() || user?.email?.trim() || null,
      },
      source: 'api',
      requestContext: getAuditRequestContext(context),
      metadata: input.metadata,
      before: input.before,
      after: input.after,
    });
  }

  app.post('/api/security/two-factor/setup', requireAuthentication(), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = startTwoFactorSetupSchema.safeParse(body);
    const session = context.get('session');
    const user = context.get('user');

    if (!parsed.success || session === null || user === null) {
      return context.json(
        {
          error: {
            code: 'security.invalid_request',
            message: 'Could not verify your identity.',
          },
        },
        400,
      );
    }

    const setup = await services.startTwoFactorSetup({
      password: parsed.data.password,
      session,
      user: {
        email: user.email,
        id: user.id,
      },
    });

    if (setup === null) {
      return context.json(
        {
          error: {
            code: 'security.identity_verification_failed',
            message: 'Could not verify your identity.',
          },
        },
        403,
      );
    }

    return context.json(setup);
  });

  app.post('/api/security/two-factor/backup-codes/regenerate', requireAuthentication(), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = verifySensitiveActionSchema.safeParse(body);
    const session = context.get('session');
    const user = context.get('user');

    if (!parsed.success || session === null || user === null) {
      return context.json(
        {
          error: {
            code: 'security.invalid_request',
            message: 'Could not verify your identity.',
          },
        },
        400,
      );
    }

    const result = await services.regenerateBackupCodes({
      password: parsed.data.password,
      session,
      userId: user.id,
    });

    if (result === null) {
      return context.json(
        {
          error: {
            code: 'security.identity_verification_failed',
            message: 'Could not verify your identity.',
          },
        },
        403,
      );
    }

    return context.json(result);
  });

  app.post('/api/security/two-factor/disable', requireAuthentication(), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = verifySensitiveActionSchema.safeParse(body);
    const session = context.get('session');
    const user = context.get('user');

    if (!parsed.success || session === null || user === null) {
      return context.json(
        {
          error: {
            code: 'security.invalid_request',
            message: 'Could not verify your identity.',
          },
        },
        400,
      );
    }

    const disabled = await services.disableTwoFactor({
      password: parsed.data.password,
      session,
      userId: user.id,
    });

    if (!disabled) {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'warning',
        outcome: 'denied',
        metadata: {
          action: 'two_factor.disable',
          reason: 'identity_verification_failed',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.identity_verification_failed',
            message: 'Could not verify your identity.',
          },
        },
        403,
      );
    }

    await emitAccountAuditEvent(context, {
      eventType: AUDIT_EVENT_TYPES.authTwoFactorDisabled,
      severity: 'warning',
      outcome: 'success',
      metadata: { method: parsed.data.password ? 'password' : 'oauth' },
      before: { two_factor_enabled: true },
      after: { two_factor_enabled: false },
    });

    return context.json({ status: true });
  });

  app.post('/api/security/email/change', requireAuthentication(), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = requestEmailChangeSchema.safeParse(body);
    const user = context.get('user');

    if (!parsed.success || user === null) {
      return context.json(
        {
          error: {
            code: 'security.invalid_request',
            message: 'Could not request email change.',
          },
        },
        400,
      );
    }

    const newEmail = parsed.data.newEmail.trim().toLowerCase();
    const result = await services.requestEmailChange({
      callbackURL: parsed.data.callbackURL,
      headers: context.req.raw.headers,
      newEmail,
      password: parsed.data.password,
      userId: user.id,
    });

    if (result === 'verification-failed') {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'warning',
        outcome: 'denied',
        metadata: {
          action: 'email.change',
          reason: 'identity_verification_failed',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.identity_verification_failed',
            message: 'Could not verify your identity.',
          },
        },
        403,
      );
    }

    if (result === 'password-unavailable') {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'warning',
        outcome: 'denied',
        metadata: {
          action: 'email.change',
          reason: 'password_unavailable',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.password_required',
            message: 'Set a password before changing your email address.',
          },
        },
        409,
      );
    }

    if (result === 'email-in-use') {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'warning',
        outcome: 'denied',
        metadata: {
          action: 'email.change',
          reason: 'email_in_use',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.email_in_use',
            message: 'That email address is already used by another account.',
          },
        },
        409,
      );
    }

    await emitAccountAuditEvent(context, {
      eventType: AUDIT_EVENT_TYPES.authEmailChangeRequested,
      severity: 'notice',
      outcome: 'success',
      metadata: { verification_method: 'password' },
      before: { email: user.email },
      after: { email: newEmail },
    });

    return context.json(result);
  });

  app.post('/api/security/oauth/link', requireAuthentication(), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = linkOAuthAccountSchema.safeParse(body);
    const user = context.get('user');

    if (!parsed.success || user === null) {
      return context.json(
        {
          error: {
            code: 'security.invalid_request',
            message: 'Could not connect sign-in provider.',
          },
        },
        400,
      );
    }

    const result = await services.linkOAuthAccount({
      callbackURL: parsed.data.callbackURL,
      headers: context.req.raw.headers,
      password: parsed.data.password,
      provider: parsed.data.provider,
      userId: user.id,
    });

    if (result === 'verification-failed') {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'warning',
        outcome: 'denied',
        metadata: {
          action: 'oauth.link',
          provider: parsed.data.provider,
          reason: 'identity_verification_failed',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.identity_verification_failed',
            message: 'Current password is incorrect.',
          },
        },
        403,
      );
    }

    if (result === 'password-unavailable') {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'warning',
        outcome: 'denied',
        metadata: {
          action: 'oauth.link',
          provider: parsed.data.provider,
          reason: 'password_unavailable',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.password_required',
            message: 'Set a password before connecting another sign-in provider.',
          },
        },
        409,
      );
    }

    if (result === 'already-linked') {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'notice',
        outcome: 'denied',
        metadata: {
          action: 'oauth.link',
          provider: parsed.data.provider,
          reason: 'provider_already_linked',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.provider_already_linked',
            message: 'That sign-in provider is already connected.',
          },
        },
        409,
      );
    }

    await emitAccountAuditEvent(context, {
      eventType: AUDIT_EVENT_TYPES.authOAuthLinkRequested,
      severity: 'notice',
      outcome: 'success',
      metadata: {
        provider: parsed.data.provider,
        verification_method: 'password',
      },
    });

    return context.json(result);
  });

  app.post('/api/security/password/change', requireAuthentication(), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = changeAccountPasswordSchema.safeParse(body);
    const user = context.get('user');

    if (!parsed.success || user === null) {
      return context.json(
        {
          error: {
            code: 'security.invalid_request',
            message: 'Could not change password.',
          },
        },
        400,
      );
    }

    const result = await services.changeAccountPassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      userId: user.id,
    });

    if (result === 'verification-failed') {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'warning',
        outcome: 'denied',
        metadata: {
          action: 'password.change',
          reason: 'identity_verification_failed',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.identity_verification_failed',
            message: 'Current password is incorrect.',
          },
        },
        403,
      );
    }

    if (result === 'password-unavailable') {
      return context.json(
        {
          error: {
            code: 'security.password_unavailable',
            message: 'Password sign-in is not enabled for this account.',
          },
        },
        409,
      );
    }

    if (result === 'password-too-short') {
      return context.json(
        {
          error: {
            code: 'security.password_too_short',
            message: 'Password must be at least 8 characters.',
          },
        },
        400,
      );
    }

    if (result === 'password-too-long') {
      return context.json(
        {
          error: {
            code: 'security.password_too_long',
            message: 'Password is too long.',
          },
        },
        400,
      );
    }

    await emitAccountAuditEvent(context, {
      eventType: AUDIT_EVENT_TYPES.authPasswordChanged,
      severity: 'notice',
      outcome: 'success',
      metadata: { revoke_other_sessions: false },
    });

    return context.json({ status: true });
  });

  app.post('/api/security/password/set', requireAuthentication(), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = setAccountPasswordSchema.safeParse(body);
    const session = context.get('session');
    const user = context.get('user');

    if (!parsed.success || session === null || user === null) {
      return context.json(
        {
          error: {
            code: 'security.invalid_request',
            message: 'Could not set password.',
          },
        },
        400,
      );
    }

    const result = await services.setAccountPassword({
      newPassword: parsed.data.newPassword,
      session,
      userId: user.id,
    });

    if (result === 'verification-failed') {
      await emitAccountAuditEvent(context, {
        eventType: AUDIT_EVENT_TYPES.authSensitiveActionDenied,
        severity: 'warning',
        outcome: 'denied',
        metadata: {
          action: 'password.set',
          reason: 'identity_verification_failed',
        },
      });
      return context.json(
        {
          error: {
            code: 'security.identity_verification_failed',
            message: 'Confirm your linked sign-in provider before setting a password.',
          },
        },
        403,
      );
    }

    if (result === 'already-set') {
      return context.json(
        {
          error: {
            code: 'security.password_already_set',
            message: 'Password sign-in is already enabled.',
          },
        },
        409,
      );
    }

    if (result === 'password-too-short') {
      return context.json(
        {
          error: {
            code: 'security.password_too_short',
            message: 'Password must be at least 8 characters.',
          },
        },
        400,
      );
    }

    if (result === 'password-too-long') {
      return context.json(
        {
          error: {
            code: 'security.password_too_long',
            message: 'Password is too long.',
          },
        },
        400,
      );
    }

    await emitAccountAuditEvent(context, {
      eventType: AUDIT_EVENT_TYPES.authPasswordSet,
      severity: 'notice',
      outcome: 'success',
      metadata: { method: 'sensitive_action' },
      before: { password_enabled: false },
      after: { password_enabled: true },
    });

    return context.json({ status: true });
  });
}
