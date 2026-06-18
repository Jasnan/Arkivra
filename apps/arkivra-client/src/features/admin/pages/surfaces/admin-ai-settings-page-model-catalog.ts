import type {
  AdminAiSettings,
  AdminEmbeddingIndexSummary,
} from '@/features/admin/admin.types';

export interface EmbeddingModelOption {
  key: string;
  provider: AdminAiSettings['embedding']['provider'];
  providerLabel: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  isActive: boolean;
  isConfigured: boolean;
  isDiscovered: boolean;
  size: number | null;
  modifiedAt: string | null;
  capabilities: string[];
}

export const geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
export const curatedGeminiChatModels = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const ollamaLatestTagPattern = /:latest$/;

export function formatProvider(provider: string) {
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

function findDiscoveredModel(
  discoveredModels: Array<{
    name: string;
    size?: number | null;
    modifiedAt?: string | null;
    capabilities?: string[];
  }>,
  model: string,
) {
  return discoveredModels.find((item) => isSameOllamaModel(item.name, model));
}

export function buildEmbeddingModelOptions({
  activeIndex,
  baseUrl,
  dimensions,
  discoveredModels,
  model,
  provider,
  savedEmbedding,
}: {
  activeIndex: AdminEmbeddingIndexSummary | null;
  baseUrl: string;
  dimensions: number;
  discoveredModels: Array<{
    name: string;
    size?: number | null;
    modifiedAt?: string | null;
    capabilities?: string[];
  }>;
  model: string;
  provider: AdminAiSettings['embedding']['provider'];
  savedEmbedding: AdminAiSettings['embedding'];
}) {
  const configuredModel = savedEmbedding.model.trim() || model.trim();
  const activeModel = activeIndex?.model.trim() ?? '';
  const optionByKey = new Map<string, EmbeddingModelOption>();

  function addModelOption(optionModel: string) {
    if (optionModel.length === 0) return;

    const discovered = findDiscoveredModel(discoveredModels, optionModel);
    const key = `${provider}:${baseUrl}:${optionModel}`;

    optionByKey.set(key, {
      key,
      provider,
      providerLabel: formatProvider(provider),
      baseUrl,
      model: optionModel,
      dimensions,
      isActive: activeIndex?.provider === provider && activeIndex.model === optionModel,
      isConfigured: savedEmbedding.provider === provider && savedEmbedding.model === optionModel,
      isDiscovered: discovered !== undefined,
      size: discovered?.size ?? null,
      modifiedAt: discovered?.modifiedAt ?? null,
      capabilities: discovered?.capabilities ?? [],
    });
  }

  for (const discovered of discoveredModels) {
    if (hasModelCapability(discovered, 'embedding')) {
      const optionModel = configuredModel.length > 0 && isSameOllamaModel(discovered.name, configuredModel)
        ? configuredModel
        : activeModel.length > 0 && isSameOllamaModel(discovered.name, activeModel)
          ? activeModel
          : discovered.name;

      addModelOption(optionModel);
    }
  }

  if (
    discoveredModels.some(
      (item) => isSameOllamaModel(item.name, configuredModel) && hasModelCapability(item, 'embedding'),
    )
  ) {
    addModelOption(configuredModel);
  }
  if (
    discoveredModels.some(
      (item) => isSameOllamaModel(item.name, activeModel) && hasModelCapability(item, 'embedding'),
    )
  ) {
    addModelOption(activeModel);
  }

  return Array.from(optionByKey.values()).sort(
    (left, right) =>
      left.providerLabel.localeCompare(right.providerLabel) || left.model.localeCompare(right.model),
  );
}
