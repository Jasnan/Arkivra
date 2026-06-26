import type {
  AdminAiModelCatalogEntry,
  AdminAiSettings,
  AdminEmbeddingIndexSummary,
} from '@/features/admin/admin.types';

export interface EmbeddingModelOption {
  key: string;
  provider: NonNullable<AdminAiSettings['embedding']['provider']>;
  providerLabel: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  isActive: boolean;
  isConfigured: boolean;
  isInCatalog: boolean;
  capabilities: string[];
}

export const geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
const ollamaLatestTagPattern = /:latest$/;

export function formatProvider(provider: string | null) {
  if (provider === null) return 'Not selected';
  if (provider === 'ollama') return 'Ollama';
  if (provider === 'gemini') return 'Google Gemini';
  return provider;
}

export function hasModelCapability(
  model: { capabilities?: string[] },
  capability: string,
) {
  return model.capabilities?.some(item => item.toLowerCase() === capability) ?? false;
}

export function isCatalogChatModel(model: AdminAiModelCatalogEntry) {
  return hasModelCapability(model, 'chat');
}

export function isCatalogTranslationModel(model: AdminAiModelCatalogEntry) {
  return hasModelCapability(model, 'chat') && hasModelCapability(model, 'vision');
}

export function isCatalogEmbeddingModel(model: AdminAiModelCatalogEntry) {
  return hasModelCapability(model, 'embedding');
}

function stripLatestTag(model: string) {
  return model.trim().toLowerCase().replace(ollamaLatestTagPattern, '');
}

export function isSameOllamaModel(left: string, right: string) {
  return stripLatestTag(left) === stripLatestTag(right);
}

function findCatalogModel(
  catalogModels: AdminAiModelCatalogEntry[],
  provider: NonNullable<AdminAiSettings['embedding']['provider']>,
  model: string,
) {
  return catalogModels.find((item) =>
    item.provider === provider &&
    (provider === 'ollama' ? isSameOllamaModel(item.model, model) : item.model === model),
  );
}

export function buildEmbeddingModelOptions({
  activeIndex,
  baseUrl,
  catalogModels,
  model,
  provider,
  savedEmbedding,
}: {
  activeIndex: AdminEmbeddingIndexSummary | null;
  baseUrl: string;
  catalogModels: AdminAiModelCatalogEntry[];
  model: string | null;
  provider: AdminAiSettings['embedding']['provider'];
  savedEmbedding: AdminAiSettings['embedding'];
}) {
  const configuredModel = savedEmbedding.model?.trim() || model?.trim() || '';
  const activeModel = activeIndex?.model.trim() ?? '';
  const optionByKey = new Map<string, EmbeddingModelOption>();

  function addModelOption(
    optionProvider: NonNullable<AdminAiSettings['embedding']['provider']>,
    optionModel: string,
    catalogEntry?: AdminAiModelCatalogEntry,
  ) {
    if (optionModel.length === 0) return;

    const key = `${optionProvider}:${baseUrl}:${optionModel}`;
    const dimensions = catalogEntry?.embeddingDimensions ?? savedEmbedding.dimensions;
    if (dimensions === null) return;

    optionByKey.set(key, {
      key,
      provider: optionProvider,
      providerLabel: formatProvider(optionProvider),
      baseUrl,
      model: optionModel,
      dimensions,
      isActive: activeIndex?.provider === optionProvider && activeIndex.model === optionModel,
      isConfigured:
        savedEmbedding.provider === optionProvider && savedEmbedding.model === optionModel,
      isInCatalog: catalogEntry !== undefined,
      capabilities: catalogEntry?.capabilities ?? [],
    });
  }

  for (const catalogEntry of catalogModels) {
    if (
      (provider === null || catalogEntry.provider === provider) &&
      catalogEntry.provider === 'ollama' &&
      hasModelCapability(catalogEntry, 'embedding')
    ) {
      const optionModel = configuredModel.length > 0 && isSameOllamaModel(catalogEntry.model, configuredModel)
        ? configuredModel
        : activeModel.length > 0 && isSameOllamaModel(catalogEntry.model, activeModel)
          ? activeModel
          : catalogEntry.model;

      addModelOption(catalogEntry.provider, optionModel, catalogEntry);
    }
  }

  if (provider !== null && configuredModel.length > 0) {
    addModelOption(
      provider,
      configuredModel,
      findCatalogModel(catalogModels, provider, configuredModel),
    );
  }

  if (provider !== null && activeModel.length > 0) {
    addModelOption(
      provider,
      activeModel,
      findCatalogModel(catalogModels, provider, activeModel),
    );
  }

  return Array.from(optionByKey.values()).sort(
    (left, right) =>
      left.providerLabel.localeCompare(right.providerLabel) ||
      left.model.localeCompare(right.model),
  );
}
