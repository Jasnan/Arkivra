import type { Hono } from 'hono';
import type { ServerContext } from '../server/server.types.js';
import type { SensitiveActionServices } from './sensitive-actions.services.js';
import { z } from 'zod';
import { requireAuthentication } from '../auth/auth.middleware.js';

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

const setAccountPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

export function registerSensitiveActionRoutes({
  app,
  services,
}: {
  app: Hono<ServerContext>;
  services: SensitiveActionServices;
}) {
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

    return context.json({ status: true });
  });

  app.post('/api/security/email/change', requireAuthentication(), async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = requestEmailChangeSchema.safeParse(body);
    const session = context.get('session');
    const user = context.get('user');

    if (!parsed.success || session === null || user === null) {
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

    const result = await services.requestEmailChange({
      callbackURL: parsed.data.callbackURL,
      headers: context.req.raw.headers,
      newEmail: parsed.data.newEmail,
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

    return context.json({ status: true });
  });
}
