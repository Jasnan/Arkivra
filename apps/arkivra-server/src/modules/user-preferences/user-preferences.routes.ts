import type { Hono } from 'hono';
import type { ServerContext } from '../server/server.types.js';
import type { UserPreferencesServices } from './user-preferences.services.js';
import { z } from 'zod';
import { requireAuthentication } from '../auth/auth.middleware.js';

const userAppearancePreferencesSchema = z
  .object({
    themeMode: z.enum(['dark', 'light', 'system']),
    selectedTheme: z.string().max(100),
    selectedTweakcnTheme: z.string().max(100),
    selectedRadius: z.string().max(32),
    brandColors: z.record(z.string().max(80)).refine(
      (value) => Object.keys(value).every((key) => key.startsWith('--') && key.length <= 80),
      { message: 'Brand color keys must be CSS custom properties.' },
    ),
    sidebar: z
      .object({
        variant: z.enum(['sidebar', 'floating', 'inset']),
        collapsible: z.enum(['offcanvas', 'icon', 'none']),
        side: z.enum(['left', 'right']),
      })
      .strict(),
  })
  .strict();

const userRegionalPreferencesSchema = z
  .object({
    language: z.literal('en'),
    dateFormat: z
      .enum(['DD.MM.YYYY', 'DD/MM/YYYY', 'DD-MM-YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'YYYY/MM/DD'])
      .nullable(),
  })
  .strict();

const userUiPreferencesUpdateSchema = z
  .object({
    appearancePreferences: userAppearancePreferencesSchema.optional(),
    regionalPreferences: userRegionalPreferencesSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.appearancePreferences !== undefined || value.regionalPreferences !== undefined,
    { message: 'Provide at least one preference group.' },
  );

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
