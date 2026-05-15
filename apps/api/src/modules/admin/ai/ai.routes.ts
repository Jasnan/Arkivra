import type { Hono } from 'hono';
import type { ServerContext } from '../../server/server.types.js';
import type { AdminAiServices } from './ai.services.js';
import { z } from 'zod';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { requireGlobalAdmin } from '../../authorization/authorization.middleware.js';

const aiSettingsSchema = z.object({
  ollamaHost: z.string().url(),
  model: z.string().min(1),
});

const aiHostSchema = z.object({
  host: z.string().url(),
});

const aiAvailabilitySchema = z.object({
  host: z.string().url(),
  model: z.string().min(1),
});

export function registerAdminAiRoutes({
  app,
  aiServices,
}: {
  app: Hono<ServerContext>;
  aiServices: AdminAiServices;
}) {
  app.use('/api/admin/ai', requireAuthentication(), requireGlobalAdmin());
  app.use('/api/admin/ai/*', requireAuthentication(), requireGlobalAdmin());

  app.get('/api/admin/ai/settings', async (context) => {
    const settings = await aiServices.getSettings();
    return context.json({ settings });
  });

  app.put('/api/admin/ai/settings', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = aiSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'admin.invalid_ai_settings_payload',
            message: 'Invalid AI settings payload.',
          },
        },
        400,
      );
    }

    const settings = await aiServices.updateSettings(parsed.data);
    return context.json({ settings });
  });

  app.post('/api/admin/ai/models', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = aiHostSchema.safeParse(body);

    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'admin.invalid_ai_models_payload',
            message: 'A valid Ollama host is required.',
          },
        },
        400,
      );
    }

    try {
      const models = await aiServices.listModels({ host: parsed.data.host });
      return context.json({ models });
    } catch (error) {
      return context.json(
        {
          error: {
            code: 'admin.ollama_unreachable',
            message: error instanceof Error ? error.message : 'Could not reach Ollama.',
          },
        },
        502,
      );
    }
  });

  app.post('/api/admin/ai/availability', async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = aiAvailabilitySchema.safeParse(body);

    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: 'admin.invalid_ai_availability_payload',
            message: 'A valid Ollama host and model are required.',
          },
        },
        400,
      );
    }

    const availability = await aiServices.checkModelAvailability(parsed.data);
    return context.json({ availability });
  });
}
