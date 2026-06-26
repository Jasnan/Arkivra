import type {
  AdminAiProviderModelOption,
  AdminAiSettings,
  AdminEmbeddingIndexSummary,
} from '@/features/admin/admin.types';

export interface EmbeddingModelOption {
  key: string;
  provider: NonNullable<AdminAiSettings['embedding']['provider']>;
  providerLabel: string;
  baseUrl: string;
  model: string;
  dimensions: number | null;
  isActive: boolean;
  isConfigured: boolean;
  isDiscovered: boolean;
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

function stripLatestTag(model: string) {
  return model.trim().toLowerCase().replace(ollamaLatestTagPattern, '');
}

export function isSameOllamaModel(left: string, right: string) {
  return stripLatestTag(left) === stripLatestTag(right);
}

export function isSameProviderModel({
  provider,
  left,
  right,
}: {
  provider: string | null;
  left: string;
  right: string;
}) {
  return provider === 'ollama' ? isSameOllamaModel(left, right) : left === right;
}

function findProviderModel(
  providerModels: AdminAiProviderModelOption[],
  provider: NonNullable<AdminAiSettings['embedding']['provider']>,
  model: string,
) {
  return providerModels.find((item) =>
    item.provider === provider &&
    isSameProviderModel({ provider, left: item.model, right: model }),
  );
}

export function buildEmbeddingModelOptions({
  activeIndex,
  baseUrl,
  model,
  provider,
  providerBaseUrls,
  providerModels,
  savedEmbedding,
}: {
  activeIndex: AdminEmbeddingIndexSummary | null;
  baseUrl: string;
  model: string | null;
  provider: AdminAiSettings['embedding']['provider'];
  providerBaseUrls?: Partial<Record<NonNullable<AdminAiSettings['embedding']['provider']>, string>>;
  providerModels: AdminAiProviderModelOption[];
  savedEmbedding: AdminAiSettings['embedding'];
}) {
  const configuredModel = savedEmbedding.model?.trim() || model?.trim() || '';
  const activeModel = activeIndex?.model.trim() ?? '';
  const optionByKey = new Map<string, EmbeddingModelOption>();

  function addModelOption(
    optionProvider: NonNullable<AdminAiSettings['embedding']['provider']>,
    optionModel: string,
    providerModel?: AdminAiProviderModelOption,
  ) {
    if (optionModel.length === 0) return;

    const optionBaseUrl = providerBaseUrls?.[optionProvider] ?? baseUrl;
    const key = `${optionProvider}:${optionBaseUrl}:${optionModel}`;
    const dimensions = providerModel?.embeddingDimensions ?? savedEmbedding.dimensions ?? null;

    optionByKey.set(key, {
      key,
      provider: optionProvider,
      providerLabel: formatProvider(optionProvider),
      baseUrl: optionBaseUrl,
      model: optionModel,
      dimensions,
      isActive:
        activeIndex?.provider === optionProvider &&
        isSameProviderModel({ provider: optionProvider, left: activeIndex.model, right: optionModel }),
      isConfigured:
        savedEmbedding.provider === optionProvider &&
        savedEmbedding.model !== null &&
        isSameProviderModel({ provider: optionProvider, left: savedEmbedding.model, right: optionModel }),
      isDiscovered: providerModel !== undefined,
      capabilities: providerModel?.capabilities ?? [],
    });
  }

  for (const providerModel of providerModels) {
    if (hasModelCapability(providerModel, 'embedding')) {
      const optionModel =
        configuredModel.length > 0 &&
        isSameProviderModel({
          provider: providerModel.provider,
          left: providerModel.model,
          right: configuredModel,
        })
        ? configuredModel
        : activeModel.length > 0 &&
          isSameProviderModel({
            provider: providerModel.provider,
            left: providerModel.model,
            right: activeModel,
          })
          ? activeModel
          : providerModel.model;

      addModelOption(providerModel.provider, optionModel, providerModel);
    }
  }

  if (provider !== null && configuredModel.length > 0) {
    addModelOption(
      provider,
      configuredModel,
      findProviderModel(providerModels, provider, configuredModel),
    );
  }

  if (provider !== null && activeModel.length > 0) {
    addModelOption(
      provider,
      activeModel,
      findProviderModel(providerModels, provider, activeModel),
    );
  }

  return Array.from(optionByKey.values()).sort(
    (left, right) =>
      left.providerLabel.localeCompare(right.providerLabel) ||
      left.model.localeCompare(right.model),
  );
}
