import type { Context, Hono } from 'hono';
import type { ServerContext } from '../../server/server.types.js';
import type { AdminAiServices } from './ai.services.js';
import type { createAuditServices } from '../../audit/audit.services.js';
import type { AdminAiSettings } from './ai.types.js';
import { z } from 'zod';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { requireAdmin } from '../../authorization/authorization.middleware.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../../audit/audit.http.js';
import { AUDIT_EVENT_TYPES } from '../../audit/audit.types.js';

const providerSettingsSchema = z.object({
  provider: z.literal('ollama'),
  baseUrl: z.string().url(),
  apiKeySecretRef: z.string().min(1).nullable().optional(),
  model: z.string().min(1),
});

const aiSettingsSchema = z.object({
  aiFeaturesEnabled: z.boolean(),
  chat: providerSettingsSchema,
  embedding: providerSettingsSchema.extend({
    dimensions: z.number().int().min(1),
  }),
  ollamaHost: z.string().url().optional(),
  model: z.string().min(1).optional(),
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
  auditServices,
}: {
  app: Hono<ServerContext>;
  aiServices: AdminAiServices;
  auditServices?: ReturnType<typeof createAuditServices>;
}) {
  app.use('/api/admin/ai', requireAuthentication(), requireAdmin());
  app.use('/api/admin/ai/*', requireAuthentication(), requireAdmin());

  app.get('/api/admin/ai/settings', async (context) => {
    const settings = await aiServices.getSettings();
    return context.json({ settings });
  });

  app.get('/api/admin/ai/status', async (context) => {
    const status = await aiServices.getStatus();
    return context.json({ status });
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

    const previousSettings = await aiServices.getSettings();
    const settings = await aiServices.updateSettings(parsed.data as Parameters<typeof aiServices.updateSettings>[0]);
    await emitAiSettingsAuditEvents({
      auditServices,
      context,
      previousSettings,
      settings,
    });

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

async function emitAiSettingsAuditEvents({
  auditServices,
  context,
  previousSettings,
  settings,
}: {
  auditServices?: ReturnType<typeof createAuditServices>;
  context: Context<ServerContext>;
  previousSettings: AdminAiSettings;
  settings: AdminAiSettings;
}) {
  if (auditServices === undefined) {
    return;
  }

  const actor = getAuditActorFromContext(context);
  const requestContext = getAuditRequestContext(context);
  const target = {
    type: 'ai_settings',
    id: 'instance_ai_settings',
    displayName: 'AI settings',
  };

  if (previousSettings.aiFeaturesEnabled !== settings.aiFeaturesEnabled) {
    await auditServices.emitAuditEvent({
      eventType: AUDIT_EVENT_TYPES.aiFeaturesToggled,
      eventCategory: 'system',
      severity: settings.aiFeaturesEnabled ? 'notice' : 'warning',
      outcome: 'success',
      actor,
      target,
      requestContext,
      metadata: {
        enabled: settings.aiFeaturesEnabled,
      },
      before: {
        aiFeaturesEnabled: previousSettings.aiFeaturesEnabled,
      },
      after: {
        aiFeaturesEnabled: settings.aiFeaturesEnabled,
      },
    });
  }

  if (
    previousSettings.chat.provider !== settings.chat.provider
    || previousSettings.chat.baseUrl !== settings.chat.baseUrl
    || previousSettings.chat.model !== settings.chat.model
  ) {
    await auditServices.emitAuditEvent({
      eventType: AUDIT_EVENT_TYPES.aiChatModelChanged,
      eventCategory: 'system',
      severity: 'notice',
      outcome: 'success',
      actor,
      target,
      requestContext,
      metadata: {
        provider: settings.chat.provider,
        model: settings.chat.model,
      },
      before: {
        provider: previousSettings.chat.provider,
        baseUrl: previousSettings.chat.baseUrl,
        model: previousSettings.chat.model,
      },
      after: {
        provider: settings.chat.provider,
        baseUrl: settings.chat.baseUrl,
        model: settings.chat.model,
      },
    });
  }

  if (
    previousSettings.embedding.provider !== settings.embedding.provider
    || previousSettings.embedding.baseUrl !== settings.embedding.baseUrl
    || previousSettings.embedding.model !== settings.embedding.model
    || previousSettings.embedding.dimensions !== settings.embedding.dimensions
  ) {
    await auditServices.emitAuditEvent({
      eventType: AUDIT_EVENT_TYPES.aiEmbeddingModelChanged,
      eventCategory: 'system',
      severity: 'notice',
      outcome: 'success',
      actor,
      target,
      requestContext,
      metadata: {
        provider: settings.embedding.provider,
        model: settings.embedding.model,
        dimensions: settings.embedding.dimensions,
      },
      before: {
        provider: previousSettings.embedding.provider,
        baseUrl: previousSettings.embedding.baseUrl,
        model: previousSettings.embedding.model,
        dimensions: previousSettings.embedding.dimensions,
      },
      after: {
        provider: settings.embedding.provider,
        baseUrl: settings.embedding.baseUrl,
        model: settings.embedding.model,
        dimensions: settings.embedding.dimensions,
      },
    });
  }
}
