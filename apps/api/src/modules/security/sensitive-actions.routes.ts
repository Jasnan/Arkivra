import type { Hono } from 'hono';
import type { ServerContext } from '../server/server.types.js';
import type { SensitiveActionServices } from './sensitive-actions.services.js';
import { z } from 'zod';
import { requireAuthentication } from '../auth/auth.middleware.js';

const startTwoFactorSetupSchema = z.object({
  password: z.string().optional(),
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
}
