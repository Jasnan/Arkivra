import type { Config } from '../../config/config.js';
import type { Database } from '../../database/database.js';
import type {
  AdminAiModel,
  AdminAiModelAvailability,
  AdminAiSettings,
  AdminAiStatus,
  AdminEmbeddingIndexActionResult,
  AdminEmbeddingIndexSummary,
  AdminStartEmbeddingIndexInput,
} from './ai.types.js';
import type { EmbeddingIndexQueue } from '../../ai/indexing/index.js';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createEmbeddingIndexServices } from '../../ai/indexing/index.js';
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

const ollamaEmbedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
});

const ollamaLegacyEmbeddingResponseSchema = z.object({
  embedding: z.array(z.number()),
});

type EmbeddingIndexSummaryRow = {
  id: string;
  provider_config_id: string;
  provider: AdminEmbeddingIndexSummary['provider'];
  model: string;
  dimensions: number;
  distance_metric: string;
  status: AdminEmbeddingIndexSummary['status'];
  is_active: boolean;
  expected_chunk_count: number;
  embedded_chunk_count: number;
  failed_chunk_count: number;
  failure_message: string | null;
  build_started_at: Date | string | null;
  build_completed_at: Date | string | null;
  activated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type DocumentStatusCountRow = {
  embedding_index_id: string;
  status: keyof AdminEmbeddingIndexSummary['documentStatuses'];
  count: number;
};

type CorpusChunkCountRow = {
  chunk_count: number;
};

type MatchingIndexRow = {
  id: string;
};

type CurrentEmbeddedChunkCountRow = {
  embedding_index_id: string;
  embedded_chunk_count: number;
};

function normalizeHost(host: string) {
  return host.trim().replace(/\/+$/, '');
}

function toIsoOrNull(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function createEmptyDocumentStatuses(): AdminEmbeddingIndexSummary['documentStatuses'] {
  return {
    pending: 0,
    indexing: 0,
    ready: 0,
    failed: 0,
    stale: 0,
    skipped: 0,
  };
}

function shouldCompareIndexWithCorpus(status: AdminEmbeddingIndexSummary['status']) {
  return status === 'building'
    || status === 'ready'
    || status === 'active';
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
  const ollamaHost = config.ollama.host;
  const model = config.ollama.model;

  return {
    aiFeaturesEnabled: false,
    chat: {
      provider: 'ollama',
      baseUrl: ollamaHost,
      apiKeySecretRef: null,
      model,
    },
    embedding: {
      provider: 'ollama',
      baseUrl: ollamaHost,
      apiKeySecretRef: null,
      model: 'bge-m3',
      dimensions: 1024,
    },
    ollamaHost,
    model,
  };
}

function createDefaultIngestionSettings(config: Config) {
  return {
    summarisationEnabled: false,
    summarisationHost: config.ollama.host,
    summarisationModel: 'gemma4:e4b',
    summarisationMaxImagesPerChunk: 4,
    embeddingEnabled: false,
    embeddingHost: config.ollama.host,
    embeddingModel: 'bge-m3',
    embeddingDimensions: 1024,
    captioningEnabled: false,
    captioningHost: config.ollama.host,
    captioningModel: 'gemma4:e4b',
  };
}

function normalizeSettings(input: AdminAiSettings): AdminAiSettings {
  const chatBaseUrl = normalizeHost(input.chat?.baseUrl ?? input.ollamaHost);
  const chatModel = (input.chat?.model ?? input.model).trim();
  const embeddingBaseUrl = normalizeHost(input.embedding?.baseUrl ?? chatBaseUrl);
  const embeddingModel = input.embedding.model.trim();

  return {
    aiFeaturesEnabled: input.aiFeaturesEnabled,
    chat: {
      provider: 'ollama',
      baseUrl: chatBaseUrl,
      apiKeySecretRef: null,
      model: chatModel,
    },
    embedding: {
      provider: 'ollama',
      baseUrl: embeddingBaseUrl,
      apiKeySecretRef: null,
      model: embeddingModel,
      dimensions: input.embedding.dimensions,
    },
    ollamaHost: chatBaseUrl,
    model: chatModel,
  };
}

async function resolveOllamaEmbeddingDimensions({
  fetchImpl,
  host,
  model,
}: {
  fetchImpl: typeof fetch;
  host: string;
  model: string;
}) {
  const normalizedHost = normalizeHost(host);
  const embedResponse = await fetchImpl(`${normalizedHost}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      input: ['dimension probe'],
    }),
  });

  if (embedResponse.ok) {
    const payload = ollamaEmbedResponseSchema.parse(await embedResponse.json());
    const dimensions = payload.embeddings[0]?.length;

    if (dimensions === undefined || dimensions <= 0) {
      throw new Error(`Ollama returned an empty embedding for model "${model}".`);
    }

    return dimensions;
  }

  if (embedResponse.status !== 404) {
    throw new Error(await readErrorMessage(embedResponse));
  }

  const legacyResponse = await fetchImpl(`${normalizedHost}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: 'dimension probe',
    }),
  });

  if (!legacyResponse.ok) {
    throw new Error(await readErrorMessage(legacyResponse));
  }

  const payload = ollamaLegacyEmbeddingResponseSchema.parse(await legacyResponse.json());

  if (payload.embedding.length <= 0) {
    throw new Error(`Ollama returned an empty embedding for model "${model}".`);
  }

  return payload.embedding.length;
}

export function createAdminAiServices({
  db,
  config,
  embeddingIndexQueue,
  fetchImpl = fetch,
}: {
  db: Database;
  config: Config;
  embeddingIndexQueue?: EmbeddingIndexQueue;
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
      aiFeaturesEnabled: stored.aiFeaturesEnabled,
      chat: {
        provider: 'ollama',
        baseUrl: stored.ollamaHost,
        apiKeySecretRef: null,
        model: stored.ollamaModel,
      },
      embedding: {
        provider: 'ollama',
        baseUrl: stored.ollamaEmbeddingHost,
        apiKeySecretRef: null,
        model: stored.ollamaEmbeddingModel,
        dimensions: stored.ollamaEmbeddingDimensions,
      },
      ollamaHost: stored.ollamaHost,
      model: stored.ollamaModel,
    };
  }

  async function getStatus(): Promise<AdminAiStatus> {
    const settings = await getSettings();
    const corpusChunkCount = await getCorpusChunkCount();
    const indexRows = await db.execute<EmbeddingIndexSummaryRow>(sql`
      SELECT
        ei.id,
        ei.provider_config_id,
        ei.provider,
        ei.model,
        ei.dimensions,
        ei.distance_metric,
        ei.status,
        ei.is_active,
        ei.expected_chunk_count,
        ei.embedded_chunk_count,
        ei.failed_chunk_count,
        ei.failure_message,
        ei.build_started_at,
        ei.build_completed_at,
        ei.activated_at,
        ei.created_at,
        ei.updated_at
      FROM embedding_indexes AS ei
      ORDER BY
        ei.is_active DESC,
        ei.created_at DESC
      LIMIT 12
    `);
    const indexIds = indexRows.rows.map(row => row.id);
    const statusCounts = indexIds.length === 0
      ? []
      : (await db.execute<DocumentStatusCountRow>(sql`
          SELECT
            embedding_index_id,
            status,
            count(*)::int AS count
          FROM document_embedding_index_status
          WHERE embedding_index_id IN (${sql.join(indexIds.map(id => sql`${id}`), sql`, `)})
          GROUP BY embedding_index_id, status
        `)).rows;
    const currentEmbeddedCounts = indexIds.length === 0
      ? []
      : (await db.execute<CurrentEmbeddedChunkCountRow>(sql`
          SELECT
            dce.embedding_index_id,
            count(dce.chunk_id)::int AS embedded_chunk_count
          FROM document_chunk_embeddings AS dce
          INNER JOIN document_chunks AS dc ON dc.id = dce.chunk_id
          INNER JOIN documents AS d ON d.id = dc.document_id
          WHERE dce.embedding_index_id IN (${sql.join(indexIds.map(id => sql`${id}`), sql`, `)})
            AND d.processing_status = 'completed'
            AND d.is_deleted = false
          GROUP BY dce.embedding_index_id
        `)).rows;
    const documentStatusesByIndexId = new Map<string, AdminEmbeddingIndexSummary['documentStatuses']>();
    const currentEmbeddedCountByIndexId = new Map(
      currentEmbeddedCounts.map(row => [row.embedding_index_id, row.embedded_chunk_count]),
    );

    for (const row of statusCounts) {
      const statuses = documentStatusesByIndexId.get(row.embedding_index_id) ?? createEmptyDocumentStatuses();
      statuses[row.status] = row.count;
      documentStatusesByIndexId.set(row.embedding_index_id, statuses);
    }

    const indexes: AdminEmbeddingIndexSummary[] = indexRows.rows.map(row => ({
      id: row.id,
      providerConfigId: row.provider_config_id,
      provider: row.provider,
      model: row.model,
      dimensions: row.dimensions,
      distanceMetric: row.distance_metric,
      status: row.status,
      isActive: row.is_active,
      expectedChunkCount: shouldCompareIndexWithCorpus(row.status)
        ? Math.max(row.expected_chunk_count, corpusChunkCount)
        : row.expected_chunk_count,
      embeddedChunkCount: shouldCompareIndexWithCorpus(row.status)
        ? currentEmbeddedCountByIndexId.get(row.id) ?? 0
        : row.embedded_chunk_count,
      failedChunkCount: row.failed_chunk_count,
      failureMessage: row.failure_message,
      buildStartedAt: toIsoOrNull(row.build_started_at),
      buildCompletedAt: toIsoOrNull(row.build_completed_at),
      activatedAt: toIsoOrNull(row.activated_at),
      createdAt: toIsoOrNull(row.created_at)!,
      updatedAt: toIsoOrNull(row.updated_at)!,
      documentStatuses: documentStatusesByIndexId.get(row.id) ?? createEmptyDocumentStatuses(),
    }));
    const activeIndex = indexes.find(index => index.isActive && index.status === 'active') ?? null;
    const candidateIndexes = indexes.filter(index =>
      index.status === 'building'
      || index.status === 'ready'
      || index.status === 'failed',
    );
    const progressIndex = candidateIndexes.find(index => index.status === 'building' || index.status === 'ready')
      ?? activeIndex;

    return {
      aiFeaturesEnabled: settings.aiFeaturesEnabled,
      chat: {
        provider: settings.chat.provider,
        baseUrl: settings.chat.baseUrl,
        model: settings.chat.model,
      },
      embedding: {
        activeIndex,
        candidateIndexes,
        recentIndexes: indexes,
        chunkCoverage: {
          indexedChunkCount: progressIndex?.embeddedChunkCount ?? 0,
          totalChunkCount: corpusChunkCount,
        },
        semanticSearchAvailable: settings.aiFeaturesEnabled && activeIndex !== null,
      },
    };
  }

  async function getCorpusChunkCount() {
    const result = await db.execute<CorpusChunkCountRow>(sql`
      SELECT count(dc.id)::int AS chunk_count
      FROM documents AS d
      INNER JOIN document_chunks AS dc ON dc.document_id = d.id
      WHERE d.processing_status = 'completed'
        AND d.is_deleted = false
    `);

    return result.rows[0]?.chunk_count ?? 0;
  }

  async function getIngestionSettings() {
    const defaults = createDefaultIngestionSettings(config);
    const stored = await getStoredSettings();

    if (stored === undefined) {
      return defaults;
    }

    return {
      summarisationEnabled: stored.aiFeaturesEnabled && stored.aiSummarisationEnabled,
      summarisationHost: stored.ollamaHost,
      summarisationModel: stored.ollamaSummarisationModel,
      summarisationMaxImagesPerChunk: stored.ollamaSummarisationMaxImagesPerChunk,
      embeddingEnabled: stored.aiFeaturesEnabled && stored.ollamaEmbeddingEnabled,
      embeddingHost: stored.ollamaEmbeddingHost,
      embeddingModel: stored.ollamaEmbeddingModel,
      embeddingDimensions: stored.ollamaEmbeddingDimensions,
      captioningEnabled: defaults.captioningEnabled,
      captioningHost: defaults.captioningHost,
      captioningModel: defaults.captioningModel,
    };
  }

  async function hasSemanticIndexForSettings(settings: AdminAiSettings) {
    const corpusChunkCount = await getCorpusChunkCount();
    const result = await db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count
      FROM (
        SELECT
          ei.id,
          count(d.id)::int AS current_embedded_chunk_count
        FROM embedding_indexes AS ei
        INNER JOIN ai_provider_configs AS apc ON apc.id = ei.provider_config_id
        LEFT JOIN document_chunk_embeddings AS dce ON dce.embedding_index_id = ei.id
        LEFT JOIN document_chunks AS dc ON dc.id = dce.chunk_id
        LEFT JOIN documents AS d
          ON d.id = dc.document_id
          AND d.processing_status = 'completed'
          AND d.is_deleted = false
        WHERE ei.provider = ${settings.embedding.provider}
          AND ei.model = ${settings.embedding.model}
          AND ei.dimensions = ${settings.embedding.dimensions}
          AND ei.status IN ('building', 'ready', 'active')
          AND COALESCE(apc.base_url, '') = ${settings.embedding.baseUrl}
        GROUP BY ei.id
      ) AS matching_indexes
      WHERE matching_indexes.current_embedded_chunk_count >= ${corpusChunkCount}
    `);

    return (result.rows[0]?.count ?? 0) > 0;
  }

  async function getMatchingActiveEmbeddingIndexId(settings: AdminAiSettings) {
    const result = await db.execute<MatchingIndexRow>(sql`
      SELECT ei.id
      FROM embedding_indexes AS ei
      INNER JOIN ai_provider_configs AS apc ON apc.id = ei.provider_config_id
      WHERE ei.provider = ${settings.embedding.provider}
        AND ei.model = ${settings.embedding.model}
        AND ei.dimensions = ${settings.embedding.dimensions}
        AND ei.status = 'active'
        AND ei.is_active = true
        AND COALESCE(apc.base_url, '') = ${settings.embedding.baseUrl}
      ORDER BY ei.activated_at DESC NULLS LAST, ei.created_at DESC
      LIMIT 1
    `);

    return result.rows[0]?.id ?? null;
  }

  async function updateSettings(nextSettings: AdminAiSettings): Promise<AdminAiSettings> {
    const previousSettings = await getSettings();
    const initialNormalized = normalizeSettings(nextSettings);
    const initialEmbeddingConfigChanged =
      previousSettings.embedding.provider !== initialNormalized.embedding.provider
      || previousSettings.embedding.baseUrl !== initialNormalized.embedding.baseUrl
      || previousSettings.embedding.model !== initialNormalized.embedding.model
      || previousSettings.embedding.dimensions !== initialNormalized.embedding.dimensions;
    const aiWasEnabled = previousSettings.aiFeaturesEnabled;
    const shouldResolveEmbeddingDimensions = initialEmbeddingConfigChanged
      || (!aiWasEnabled && initialNormalized.aiFeaturesEnabled);
    const normalized = shouldResolveEmbeddingDimensions
      ? {
          ...initialNormalized,
          embedding: {
            ...initialNormalized.embedding,
            dimensions: await resolveOllamaEmbeddingDimensions({
              fetchImpl,
              host: initialNormalized.embedding.baseUrl,
              model: initialNormalized.embedding.model,
            }),
          },
        }
      : initialNormalized;
    const embeddingConfigChanged =
      previousSettings.embedding.provider !== normalized.embedding.provider
      || previousSettings.embedding.baseUrl !== normalized.embedding.baseUrl
      || previousSettings.embedding.model !== normalized.embedding.model
      || previousSettings.embedding.dimensions !== normalized.embedding.dimensions;

    await db
      .insert(instanceSettingsTable)
      .values({
        id: INSTANCE_AI_SETTINGS_ID,
        aiFeaturesEnabled: normalized.aiFeaturesEnabled,
        ollamaHost: normalized.ollamaHost,
        ollamaModel: normalized.model,
        aiSummarisationEnabled: normalized.aiFeaturesEnabled,
        ollamaEmbeddingEnabled: normalized.aiFeaturesEnabled,
        ollamaEmbeddingHost: normalized.embedding.baseUrl,
        ollamaEmbeddingModel: normalized.embedding.model,
        ollamaEmbeddingDimensions: normalized.embedding.dimensions,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: instanceSettingsTable.id,
        set: {
          aiFeaturesEnabled: normalized.aiFeaturesEnabled,
          ollamaHost: normalized.ollamaHost,
          ollamaModel: normalized.model,
          aiSummarisationEnabled: normalized.aiFeaturesEnabled,
          ollamaEmbeddingEnabled: normalized.aiFeaturesEnabled,
          ollamaEmbeddingHost: normalized.embedding.baseUrl,
          ollamaEmbeddingModel: normalized.embedding.model,
          ollamaEmbeddingDimensions: normalized.embedding.dimensions,
          updatedAt: new Date(),
        },
      });

    const shouldPrepareSemanticSearch =
      normalized.aiFeaturesEnabled
      && (embeddingConfigChanged || !aiWasEnabled)
      && !(await hasSemanticIndexForSettings(normalized));

    if (shouldPrepareSemanticSearch && embeddingIndexQueue !== undefined) {
      const matchingActiveIndexId = !embeddingConfigChanged && !aiWasEnabled
        ? await getMatchingActiveEmbeddingIndexId(normalized)
        : null;

      if (matchingActiveIndexId !== null) {
        await embeddingIndexQueue.enqueueOrchestrateIndex({
          embeddingIndexId: matchingActiveIndexId,
        });
      } else {
        await startEmbeddingIndex({
          provider: normalized.embedding.provider,
          model: normalized.embedding.model,
          dimensions: normalized.embedding.dimensions,
          baseUrl: normalized.embedding.baseUrl,
          ...(normalized.embedding.apiKeySecretRef ? { apiKeySecretRef: normalized.embedding.apiKeySecretRef } : {}),
        });
      }
    }

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
    const settings = host === undefined || model === undefined ? await getSettings() : null;
    const effectiveHost = normalizeHost(host ?? settings?.ollamaHost ?? config.ollama.host);
    const effectiveModel = (model ?? settings?.model ?? config.ollama.model).trim();
    const startedAt = Date.now();

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
          responseTimeMs: Date.now() - startedAt,
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
            responseTimeMs: Date.now() - startedAt,
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
        responseTimeMs: Date.now() - startedAt,
        error: null,
      };
    } catch (error) {
      return {
        host: effectiveHost,
        model: effectiveModel,
        reachable: false,
        modelAvailable: false,
        models: [],
        responseTimeMs: null,
        error: error instanceof Error ? error.message : 'Could not reach Ollama.',
      };
    }
  }

  async function startEmbeddingIndex(
    input: AdminStartEmbeddingIndexInput,
  ): Promise<AdminEmbeddingIndexActionResult> {
    if (embeddingIndexQueue === undefined) {
      throw new Error('Embedding index queue is not available in this process.');
    }

    const embeddingIndexServices = createEmbeddingIndexServices({ db });
    const created = await embeddingIndexServices.createEmbeddingIndex(input);
    await embeddingIndexQueue.enqueueOrchestrateIndex({
      embeddingIndexId: created.embeddingIndexId,
    });

    return {
      embeddingIndexId: created.embeddingIndexId,
      enqueued: true,
    };
  }

  return {
    getStatus,
    getSettings,
    getIngestionSettings,
    updateSettings,
    listModels,
    checkModelAvailability,
    startEmbeddingIndex,
  };
}

export type AdminAiServices = ReturnType<typeof createAdminAiServices>;
