import type { Config } from '../../config/config.js';
import type { Database } from '../../database/database.js';
import type {
  AdminAiModel,
  AdminAiModelAvailability,
  AdminAiModelCatalogEntry,
  AdminAiSettings,
  AdminAiStatus,
  AdminEmbeddingIndexActionResult,
  AdminEmbeddingIndexSummary,
  AdminStartEmbeddingIndexInput,
} from './ai.types.js';
import type { EmbeddingIndexQueue } from '../../ai/indexing/index.js';
import { eq, sql } from 'drizzle-orm';
import { createEmbeddingIndexServices } from '../../ai/indexing/index.js';
import {
  createAiModelCatalog,
  findCatalogEntry,
  hasCatalogCapability,
} from '../../ai/model-catalog.js';
import { createOllamaProvider } from '../../ai/providers/index.js';
import { instanceSettingsTable } from '../../database/schema/index.js';
import {
  GEMINI_OPENAI_COMPATIBLE_BASE_URL,
  INSTANCE_AI_SETTINGS_ID,
  createDefaultIngestionSettings,
  createDefaultSettings,
  getDefaultChatModel,
  normalizeAllowedChatModels,
  normalizeApiKeySecretRef,
  normalizeChatBaseUrl,
  normalizeGeminiBaseUrl,
  normalizeHost,
  normalizeSettings,
  parseChatModelSelection,
  resolveApiKey,
} from './ai.settings.js';

export { GEMINI_OPENAI_COMPATIBLE_BASE_URL } from './ai.settings.js';

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
  const ollama = createOllamaProvider({ fetchImpl });
  const configuredOllamaHost = normalizeHost(config.ollama.host);
  const modelCatalog = createAiModelCatalog({
    extensions: config.ai?.modelCatalogExtensions ?? [],
  }) as AdminAiModelCatalogEntry[];

  function applyConfiguredOllamaHost(settings: AdminAiSettings): AdminAiSettings {
    return {
      ...settings,
      chat: {
        ...settings.chat,
        baseUrl: settings.chat.provider === 'ollama'
          ? configuredOllamaHost
          : settings.chat.baseUrl,
      },
      translation: {
        ...settings.translation,
        baseUrl: settings.translation.provider === 'ollama'
          ? configuredOllamaHost
          : settings.translation.baseUrl,
      },
      embedding: {
        ...settings.embedding,
        baseUrl: configuredOllamaHost,
      },
      ollamaHost: configuredOllamaHost,
    };
  }

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
      return applyConfiguredOllamaHost(defaults);
    }

    const storedChatProvider = stored.chatProvider === 'gemini' ? 'gemini' : 'ollama';
    const chatSelection = parseChatModelSelection({
      value: stored.chatModel ?? stored.ollamaModel ?? getDefaultChatModel(storedChatProvider, defaults.model),
      fallbackProvider: storedChatProvider,
    });
    const chatProvider = chatSelection.provider;
    const chatModel = chatSelection.model;
    const chatBaseUrl = normalizeChatBaseUrl({
      provider: chatProvider,
      baseUrl: chatProvider === 'ollama'
        ? configuredOllamaHost
        : (stored.chatBaseUrl ?? stored.ollamaHost),
      fallbackOllamaHost: configuredOllamaHost,
    });
    const storedTranslationProvider = stored.translationProvider === 'gemini' ? 'gemini' : 'ollama';
    const translationBaseUrl = normalizeChatBaseUrl({
      provider: storedTranslationProvider,
      baseUrl: storedTranslationProvider === 'ollama'
        ? configuredOllamaHost
        : (stored.translationBaseUrl ?? stored.ollamaHost),
      fallbackOllamaHost: configuredOllamaHost,
    });

    return applyConfiguredOllamaHost({
      aiFeaturesEnabled: stored.aiFeaturesEnabled,
      chat: {
        provider: chatProvider,
        baseUrl: chatBaseUrl,
        apiKeySecretRef: normalizeApiKeySecretRef(stored.chatApiKeySecretRef),
        model: chatModel,
        allowedModels: normalizeAllowedChatModels({
          provider: chatProvider,
          model: chatModel,
          allowedModels: stored.chatAllowedModels,
        }),
      },
      translation: {
        provider: storedTranslationProvider,
        baseUrl: translationBaseUrl,
        apiKeySecretRef: normalizeApiKeySecretRef(stored.translationApiKeySecretRef),
        model: stored.ollamaTranslationModel ?? stored.ollamaModel,
      },
      embedding: {
        provider: 'ollama',
        baseUrl: configuredOllamaHost,
        apiKeySecretRef: null,
        model: stored.ollamaEmbeddingModel,
        dimensions: stored.ollamaEmbeddingDimensions,
      },
      providers: {
        gemini: {
          baseUrl: GEMINI_OPENAI_COMPATIBLE_BASE_URL,
          apiKeySecretRef: normalizeApiKeySecretRef(stored.geminiApiKeySecretRef),
        },
      },
      ollamaHost: configuredOllamaHost,
      model: stored.ollamaModel,
    });
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
            deis.embedding_index_id,
            deis.status,
            count(*)::int AS count
          FROM document_embedding_index_status AS deis
          INNER JOIN document_versions AS dv ON dv.id = deis.document_version_id
          INNER JOIN documents AS d ON d.id = dv.document_id
            AND d.vault_id = dv.vault_id
            AND d.current_version_id = dv.id
          WHERE deis.embedding_index_id IN (${sql.join(indexIds.map(id => sql`${id}`), sql`, `)})
            AND dv.processing_status = 'completed'
            AND dv.deleted_at IS NULL
            AND d.is_deleted = false
          GROUP BY deis.embedding_index_id, deis.status
        `)).rows;
    const currentEmbeddedCounts = indexIds.length === 0
      ? []
      : (await db.execute<CurrentEmbeddedChunkCountRow>(sql`
          SELECT
            dce.embedding_index_id,
            count(dce.chunk_id)::int AS embedded_chunk_count
          FROM document_chunk_embeddings AS dce
          INNER JOIN document_versions AS dv ON dv.id = dce.document_version_id
          INNER JOIN documents AS d ON d.id = dv.document_id
            AND d.vault_id = dv.vault_id
            AND d.current_version_id = dv.id
          WHERE dce.embedding_index_id IN (${sql.join(indexIds.map(id => sql`${id}`), sql`, `)})
            AND dv.processing_status = 'completed'
            AND dv.deleted_at IS NULL
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
        allowedModels: settings.chat.allowedModels ?? [settings.chat.model],
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
      FROM document_versions AS dv
      INNER JOIN documents AS d ON d.id = dv.document_id
        AND d.vault_id = dv.vault_id
        AND d.current_version_id = dv.id
      INNER JOIN document_chunks AS dc ON dc.document_version_id = dv.id
      WHERE dv.processing_status = 'completed'
        AND dv.deleted_at IS NULL
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
      summarisationHost: configuredOllamaHost,
      summarisationModel: stored.ollamaSummarisationModel,
      summarisationMaxImagesPerChunk: stored.ollamaSummarisationMaxImagesPerChunk,
      embeddingEnabled: stored.aiFeaturesEnabled && stored.ollamaEmbeddingEnabled,
      embeddingHost: configuredOllamaHost,
      embeddingModel: stored.ollamaEmbeddingModel,
      embeddingDimensions: stored.ollamaEmbeddingDimensions,
      captioningEnabled: defaults.captioningEnabled,
      captioningHost: configuredOllamaHost,
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
        LEFT JOIN document_versions AS dv
          ON dv.id = dce.document_version_id
          AND dv.processing_status = 'completed'
          AND dv.deleted_at IS NULL
        LEFT JOIN documents AS d
          ON d.id = dv.document_id
          AND d.vault_id = dv.vault_id
          AND d.current_version_id = dv.id
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
    const initialNormalized = applyConfiguredOllamaHost(normalizeSettings({
      ...nextSettings,
      chat: {
        ...nextSettings.chat,
        baseUrl: nextSettings.chat.provider === 'ollama'
          ? configuredOllamaHost
          : nextSettings.chat.baseUrl,
      },
      translation: {
        ...nextSettings.translation,
        baseUrl: nextSettings.translation.provider === 'ollama'
          ? configuredOllamaHost
          : nextSettings.translation.baseUrl,
      },
      embedding: {
        ...nextSettings.embedding,
        baseUrl: configuredOllamaHost,
      },
      ollamaHost: configuredOllamaHost,
    }));
    const initialEmbeddingConfigChanged =
      previousSettings.embedding.provider !== initialNormalized.embedding.provider
      || previousSettings.embedding.baseUrl !== initialNormalized.embedding.baseUrl
      || previousSettings.embedding.model !== initialNormalized.embedding.model
      || previousSettings.embedding.dimensions !== initialNormalized.embedding.dimensions;
    const aiWasEnabled = previousSettings.aiFeaturesEnabled;
    const shouldApplyCatalogEmbeddingDimensions = initialEmbeddingConfigChanged
      || (!aiWasEnabled && initialNormalized.aiFeaturesEnabled);
    const catalogEmbeddingEntry = findCatalogEntry(
      modelCatalog,
      initialNormalized.embedding.provider,
      initialNormalized.embedding.model,
    );
    const normalized = shouldApplyCatalogEmbeddingDimensions && catalogEmbeddingEntry?.embeddingDimensions !== undefined
      ? {
          ...initialNormalized,
          embedding: {
            ...initialNormalized.embedding,
            dimensions: catalogEmbeddingEntry.embeddingDimensions,
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
        chatProvider: normalized.chat.provider,
        chatBaseUrl: normalized.chat.baseUrl,
        chatApiKeySecretRef: normalized.chat.apiKeySecretRef,
        chatModel: normalized.chat.model,
        chatAllowedModels: normalized.chat.allowedModels ?? [normalized.chat.model],
        geminiApiKeySecretRef: normalized.providers?.gemini?.apiKeySecretRef ?? null,
        ollamaHost: normalized.ollamaHost,
        ollamaModel: normalized.model,
        aiSummarisationEnabled: normalized.aiFeaturesEnabled,
        ollamaTranslationModel: normalized.translation.model,
        translationProvider: normalized.translation.provider,
        translationBaseUrl: normalized.translation.baseUrl,
        translationApiKeySecretRef: normalized.translation.apiKeySecretRef,
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
          chatProvider: normalized.chat.provider,
          chatBaseUrl: normalized.chat.baseUrl,
          chatApiKeySecretRef: normalized.chat.apiKeySecretRef,
          chatModel: normalized.chat.model,
          chatAllowedModels: normalized.chat.allowedModels ?? [normalized.chat.model],
          geminiApiKeySecretRef: normalized.providers?.gemini?.apiKeySecretRef ?? null,
          ollamaHost: normalized.ollamaHost,
          ollamaModel: normalized.model,
          aiSummarisationEnabled: normalized.aiFeaturesEnabled,
          ollamaTranslationModel: normalized.translation.model,
          translationProvider: normalized.translation.provider,
          translationBaseUrl: normalized.translation.baseUrl,
          translationApiKeySecretRef: normalized.translation.apiKeySecretRef,
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
    const effectiveHost = normalizeHost(host ?? configuredOllamaHost);
    return await ollama.listModels({ host: effectiveHost });
  }

  function getModelCatalog(): AdminAiModelCatalogEntry[] {
    return modelCatalog.map(entry => ({ ...entry, capabilities: [...entry.capabilities] }));
  }

  async function listChatModels({
    provider,
    includeEmbeddingModels = false,
  }: {
    provider?: AdminAiSettings['chat']['provider'];
    baseUrl?: string;
    includeEmbeddingModels?: boolean;
  } = {}): Promise<AdminAiModel[]> {
    return getModelCatalog()
      .filter(entry => provider === undefined || entry.provider === provider)
      .filter(entry => includeEmbeddingModels || hasCatalogCapability(entry, 'chat'))
      .map(entry => ({
        name: entry.model,
        size: null,
        modifiedAt: null,
        capabilities: entry.capabilities,
        description: entry.label ?? null,
      }));
  }

  async function probeModelLoad({
    host,
    model,
  }: {
    host: string;
    model: string;
  }) {
    await ollama.probeGenerate({ host, model });
  }

  async function checkModelAvailability({
    host,
    model,
    provider,
    apiKeySecretRef,
  }: {
    host?: string;
    model?: string;
    provider?: AdminAiSettings['chat']['provider'];
    apiKeySecretRef?: string | null;
  } = {}): Promise<AdminAiModelAvailability> {
    const settings = host === undefined || model === undefined
      ? await getSettings()
      : null;
    const effectiveProvider = provider ?? settings?.chat.provider ?? 'ollama';
    const effectiveHost = effectiveProvider === 'gemini'
      ? normalizeGeminiBaseUrl(host ?? settings?.chat.baseUrl)
      : configuredOllamaHost;
    const effectiveModel = (
      model
      ?? settings?.chat.model
      ?? getDefaultChatModel(effectiveProvider, config.ollama.model)
    ).trim();
    const startedAt = Date.now();

    if (effectiveProvider === 'gemini') {
      const models = (await listChatModels({ provider: 'gemini' }))
        .filter(item => item.capabilities.includes('chat'));
      const catalogEntry = findCatalogEntry(modelCatalog, 'gemini', effectiveModel);
      const modelAvailable = catalogEntry !== null && hasCatalogCapability(catalogEntry, 'chat');
      const apiKeyAvailable = resolveApiKey(
        apiKeySecretRef
        ?? settings?.providers?.gemini?.apiKeySecretRef,
        settings?.chat.apiKeySecretRef,
      ) !== null;

      return {
        host: effectiveHost,
        model: effectiveModel,
        reachable: apiKeyAvailable,
        modelAvailable: modelAvailable && apiKeyAvailable,
        models,
        responseTimeMs: Date.now() - startedAt,
        error: !modelAvailable
          ? `Model "${effectiveModel}" is not in Arkivra's AI model catalog for Gemini chat.`
          : !apiKeyAvailable
              ? 'Gemini API key environment variable is not configured on the API server.'
              : null,
      };
    }

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
    getModelCatalog,
    getIngestionSettings,
    updateSettings,
    listModels,
    listChatModels,
    checkModelAvailability,
    startEmbeddingIndex,
  };
}

export type AdminAiServices = ReturnType<typeof createAdminAiServices>;
