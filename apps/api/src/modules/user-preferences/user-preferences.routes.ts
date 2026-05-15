import type { Hono } from 'hono';
import type { ServerContext } from '../server/server.types.js';
import type { UserPreferencesServices } from './user-preferences.services.js';
import { z } from 'zod';
import { requireAuthentication } from '../auth/auth.middleware.js';

const userUiPreferencesUpdateSchema = z
  .object({
    themeMode: z.enum(['system', 'light', 'dark']).optional(),
    accentColor: z.enum(['gray', 'orange', 'yellow', 'green', 'teal', 'blue', 'cyan', 'purple', 'pink']).optional(),
    density: z.enum(['compact', 'comfortable', 'relaxed']).optional(),
    fontFamily: z.enum(['inter', 'manrope', 'space-grotesk']).optional(),
    fontSize: z.enum(['sm', 'md', 'lg', 'xl', '2xl']).optional(),
    radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']).optional(),
    language: z.enum(['en', 'de', 'fr']).optional(),
    timezone: z.enum(['auto', 'utc', 'europe-berlin', 'america-new-york']).optional(),
    dateFormat: z.enum(['medium', 'numeric', 'short']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export function registerUserPreferencesRoutes({
  app,
  services,
}: {
  app: Hono<ServerContext>;
  services: UserPreferencesServices;
}) {
  app.use('/api/me/preferences', requireAuthentication());

  app.get('/api/me/preferences', async (context) => {
    const userId = context.get('userId');

    if (userId === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const preferences = await services.getPreferences({ userId });
    return context.json({ preferences });
  });

  app.patch('/api/me/preferences', async (context) => {
    const userId = context.get('userId');

    if (userId === null) {
      return context.json({ error: { code: 'auth.unauthorized', message: 'Unauthorized' } }, 401);
    }

    const body = await context.req.json().catch(() => null);
    const parsed = userUiPreferencesUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'preferences.invalid_payload',
            message: 'Invalid preference values.',
          },
        },
        400,
      );
    }

    const preferences = await services.updatePreferences({
      userId,
      preferences: parsed.data,
    });

    return context.json({ preferences });
  });
}
