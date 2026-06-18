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
}

interface EmbeddingModelCatalogEntry {
  provider: AdminAiSettings['embedding']['provider'];
  model: string;
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

export const popularEmbeddingModelCatalog: EmbeddingModelCatalogEntry[] = [
  { provider: 'ollama', model: 'bge-m3' },
  { provider: 'ollama', model: 'embeddinggemma' },
  { provider: 'ollama', model: 'nomic-embed-text' },
  { provider: 'ollama', model: 'mxbai-embed-large' },
  { provider: 'ollama', model: 'all-minilm' },
  { provider: 'ollama', model: 'snowflake-arctic-embed' },
  { provider: 'ollama', model: 'granite-embedding' },
  { provider: 'ollama', model: 'qwen3-embedding:0.6b' },
  { provider: 'ollama', model: 'qwen3-embedding:4b' },
  { provider: 'ollama', model: 'qwen3-embedding:8b' },
];

const latestModelTagPattern = /:latest$/;

function normalizeModelCatalogName(model: string) {
  return model.trim().toLowerCase().replace(latestModelTagPattern, '');
}

function getModelNameBase(model: string) {
  return normalizeModelCatalogName(model).split(':')[0] ?? '';
}

export function formatProvider(provider: string) {
  if (provider === 'ollama') return 'Ollama';
  if (provider === 'gemini') return 'Google Gemini';
  return provider;
}

export function matchesCatalogModel(discoveredModel: string, catalogModel: string) {
  const normalizedCatalogModel = normalizeModelCatalogName(catalogModel);

  if (normalizedCatalogModel.includes(':')) {
    return normalizeModelCatalogName(discoveredModel) === normalizedCatalogModel;
  }

  return getModelNameBase(discoveredModel) === normalizedCatalogModel;
}

export function isCatalogEmbeddingModel(
  provider: AdminAiSettings['embedding']['provider'],
  model: string,
) {
  return popularEmbeddingModelCatalog.some(
    (entry) => entry.provider === provider && matchesCatalogModel(model, entry.model),
  );
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
  discoveredModels: Array<{ name: string; size?: number | null; modifiedAt?: string | null }>;
  model: string;
  provider: AdminAiSettings['embedding']['provider'];
  savedEmbedding: AdminAiSettings['embedding'];
}) {
  const configuredModel = savedEmbedding.model.trim() || model.trim();
  const activeModel = activeIndex?.model.trim() ?? '';
  const optionByKey = new Map<string, EmbeddingModelOption>();

  function addModelOption(optionModel: string) {
    if (optionModel.length === 0) return;

    const discovered = discoveredModels.find((item) => item.name === optionModel);
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
    });
  }

  for (const catalogModel of popularEmbeddingModelCatalog) {
    if (catalogModel.provider !== provider) {
      continue;
    }

    for (const discovered of discoveredModels) {
      if (matchesCatalogModel(discovered.name, catalogModel.model)) {
        addModelOption(discovered.name);
      }
    }
  }

  if (discoveredModels.some((item) => item.name === configuredModel)) {
    addModelOption(configuredModel);
  }
  if (discoveredModels.some((item) => item.name === activeModel)) {
    addModelOption(activeModel);
  }

  return Array.from(optionByKey.values()).sort(
    (left, right) =>
      left.providerLabel.localeCompare(right.providerLabel) || left.model.localeCompare(right.model),
  );
}
