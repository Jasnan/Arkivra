import type { Config } from '../../config/config.js';
import type { Database } from '../../database/database.js';
import type { AdminAiModel, AdminAiModelAvailability, AdminAiSettings } from './ai.types.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { instanceSettingsTable } from '../../database/schema/index.js';

const INSTANCE_AI_SETTINGS_ID = 'instance_ai_settings';

const ollamaTagsResponseSchema = z.object({
  models: z.array(z.object({
    name: z.string().min(1),
    size: z.number().nullable().optional(),
    modified_at: z.string().nullable().optional(),
  })).default([]),
});

const ollamaGenerateResponseSchema = z.object({
  response: z.string().optional(),
});

function normalizeHost(host: string) {
  return host.trim().replace(/\/+$/, '');
}

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `status ${response.status}`;
  } catch {
    return `status ${response.status}`;
  }
}

function createDefaultSettings(config: Config): AdminAiSettings {
  return {
    enabled: config.parsers.gluedWordNormalization === 'ollama',
    ollamaHost: config.ollama.host,
    model: config.ollama.model,
    minTokenLength: config.ollama.gluedWordMinTokenLength,
    maxCandidates: config.ollama.gluedWordMaxCandidates,
    batchSize: config.ollama.gluedWordBatchSize,
  };
}

export function createAdminAiServices({
  db,
  config,
  fetchImpl = fetch,
}: {
  db: Database;
  config: Config;
  fetchImpl?: typeof fetch;
}) {
  async function getStoredSettings() {
    const [settings] = await db
      .select()
      .from(instanceSettingsTable)
      .where(eq(instanceSettingsTable.id, INSTANCE_AI_SETTINGS_ID))
      .limit(1);

    return settings;
  }

  async function getSettings(): Promise<AdminAiSettings> {
    const defaults = createDefaultSettings(config);
    const stored = await getStoredSettings();

    if (stored === undefined) {
      return defaults;
    }

    return {
      enabled: stored.aiNormalizationEnabled,
      ollamaHost: stored.ollamaHost,
      model: stored.ollamaModel,
      minTokenLength: stored.ollamaGluedWordMinTokenLength,
      maxCandidates: stored.ollamaGluedWordMaxCandidates,
      batchSize: stored.ollamaGluedWordBatchSize,
    };
  }

  async function updateSettings(nextSettings: AdminAiSettings): Promise<AdminAiSettings> {
    const normalized: AdminAiSettings = {
      ...nextSettings,
      ollamaHost: normalizeHost(nextSettings.ollamaHost),
      model: nextSettings.model.trim(),
    };

    await db
      .insert(instanceSettingsTable)
      .values({
        id: INSTANCE_AI_SETTINGS_ID,
        aiNormalizationEnabled: normalized.enabled,
        ollamaHost: normalized.ollamaHost,
        ollamaModel: normalized.model,
        ollamaGluedWordMinTokenLength: normalized.minTokenLength,
        ollamaGluedWordMaxCandidates: normalized.maxCandidates,
        ollamaGluedWordBatchSize: normalized.batchSize,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: instanceSettingsTable.id,
        set: {
          aiNormalizationEnabled: normalized.enabled,
          ollamaHost: normalized.ollamaHost,
          ollamaModel: normalized.model,
          ollamaGluedWordMinTokenLength: normalized.minTokenLength,
          ollamaGluedWordMaxCandidates: normalized.maxCandidates,
          ollamaGluedWordBatchSize: normalized.batchSize,
          updatedAt: new Date(),
        },
      });

    return normalized;
  }

  async function listModels({ host }: { host?: string } = {}): Promise<AdminAiModel[]> {
    const effectiveHost = normalizeHost(host ?? (await getSettings()).ollamaHost);
    const response = await fetchImpl(`${effectiveHost}/api/tags`);

    if (!response.ok) {
      throw new Error(`Could not query Ollama models from ${effectiveHost} (status ${response.status})`);
    }

    const body = ollamaTagsResponseSchema.parse(await response.json());

    return body.models
      .map(model => ({
        name: model.name,
        size: model.size ?? null,
        modifiedAt: model.modified_at ?? null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async function probeModelLoad({
    host,
    model,
  }: {
    host: string;
    model: string;
  }) {
    const response = await fetchImpl(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'ping',
        stream: false,
        options: {
          num_predict: 1,
          temperature: 0,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    ollamaGenerateResponseSchema.parse(await response.json());
  }

  async function checkModelAvailability({
    host,
    model,
  }: {
    host?: string;
    model?: string;
  } = {}): Promise<AdminAiModelAvailability> {
    const settings = await getSettings();
    const effectiveHost = normalizeHost(host ?? settings.ollamaHost);
    const effectiveModel = (model ?? settings.model).trim();

    try {
      const models = await listModels({ host: effectiveHost });
      const isListed = models.some(item => item.name === effectiveModel);

      if (!isListed) {
        return {
          host: effectiveHost,
          model: effectiveModel,
          reachable: true,
          modelAvailable: false,
          models,
          error: `Model "${effectiveModel}" is not listed by Ollama at ${effectiveHost}.`,
        };
      }

      try {
        await probeModelLoad({
          host: effectiveHost,
          model: effectiveModel,
        });
      } catch (error) {
        return {
          host: effectiveHost,
          model: effectiveModel,
          reachable: true,
          modelAvailable: false,
          models,
          error: error instanceof Error
            ? `Model "${effectiveModel}" is listed but could not be loaded: ${error.message}`
            : `Model "${effectiveModel}" is listed but could not be loaded.`,
        };
      }

      return {
        host: effectiveHost,
        model: effectiveModel,
        reachable: true,
        modelAvailable: true,
        models,
        error: null,
      };
    } catch (error) {
      return {
        host: effectiveHost,
        model: effectiveModel,
        reachable: false,
        modelAvailable: false,
        models: [],
        error: error instanceof Error ? error.message : 'Could not reach Ollama.',
      };
    }
  }

  return {
    getSettings,
    updateSettings,
    listModels,
    checkModelAvailability,
  };
}

export type AdminAiServices = ReturnType<typeof createAdminAiServices>;
