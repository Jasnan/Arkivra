import type { Config } from '../../config/config.js';
import { normalizeOllamaHost } from '../../ai/providers/index.js';
import type { AdminAiChatProviderKind, AdminAiSettings } from './ai.types.js';

const DEFAULT_GEMINI_API_KEY_SECRET_REF = 'GEMINI_API_KEY';
const RAW_GOOGLE_API_KEY_PATTERN = /^AIza[\w-]{20,}$/;

export const INSTANCE_AI_SETTINGS_ID = 'instance_ai_settings';
export const GEMINI_OPENAI_COMPATIBLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
export const CURATED_GEMINI_CHAT_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

const OLLAMA_EMBEDDING_MODEL_PATTERNS = [
  /^bge[-:]/i,
  /^e5[-:]/i,
  /^gte[-:]/i,
  /^mxbai[-:]/i,
  /^nomic-embed/i,
  /^snowflake-arctic-embed/i,
  /^all-minilm/i,
  /^jina-embeddings/i,
  /^qwen\d+(?:\.\d+)?-embedding/i,
  /^granite-embedding/i,
  /^embeddinggemma/i,
  /(?:^|[-:])embed(?:$|[-:])/i,
  /(?:^|[-:])embedding(?:$|[-:])/i,
] as const;

export function isLikelyEmbeddingModelName(modelName: string) {
  return OLLAMA_EMBEDDING_MODEL_PATTERNS.some(pattern => pattern.test(modelName));
}

export function normalizeHost(host: string) {
  return normalizeOllamaHost(host);
}

export function normalizeGeminiBaseUrl(baseUrl: string | null | undefined) {
  return (baseUrl ?? GEMINI_OPENAI_COMPATIBLE_BASE_URL).trim().replace(/\/+$/, '');
}

export function normalizeChatBaseUrl({
  provider,
  baseUrl,
  fallbackOllamaHost,
}: {
  provider: AdminAiSettings['chat']['provider'];
  baseUrl: string | null | undefined;
  fallbackOllamaHost: string;
}) {
  return provider === 'gemini'
    ? normalizeGeminiBaseUrl(baseUrl)
    : normalizeHost(baseUrl ?? fallbackOllamaHost);
}

function normalizeModelList(models: readonly string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const model of models) {
    const trimmed = model.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

type ChatProvider = AdminAiSettings['chat']['provider'];

function formatChatModelValue({
  provider,
  model,
}: {
  provider: ChatProvider;
  model: string;
}) {
  return `${provider}:${model}`;
}

export function parseChatModelSelection({
  value,
  fallbackProvider,
}: {
  value: string;
  fallbackProvider: ChatProvider;
}): { provider: AdminAiChatProviderKind; model: string; value: string } {
  const trimmed = value.trim();
  const separator = trimmed.indexOf(':');
  const maybeProvider = separator > 0 ? trimmed.slice(0, separator) : '';

  if (maybeProvider === 'ollama' || maybeProvider === 'gemini') {
    const model = trimmed.slice(separator + 1).trim();
    return {
      provider: maybeProvider,
      model,
      value: formatChatModelValue({ provider: maybeProvider, model }),
    };
  }

  return {
    provider: fallbackProvider,
    model: trimmed,
    value: formatChatModelValue({ provider: fallbackProvider, model: trimmed }),
  };
}

export function getDefaultChatModel(
  provider: AdminAiSettings['chat']['provider'],
  fallbackModel: string,
) {
  if (provider === 'gemini') {
    return CURATED_GEMINI_CHAT_MODELS[0];
  }

  return fallbackModel;
}

export function normalizeAllowedChatModels({
  provider,
  model,
  allowedModels,
}: {
  provider: AdminAiSettings['chat']['provider'];
  model: string;
  allowedModels: readonly string[] | null | undefined;
}) {
  const defaultSelection = parseChatModelSelection({ value: model, fallbackProvider: provider });
  const candidates = normalizeModelList([...(allowedModels ?? []), defaultSelection.value]);
  const filtered = candidates
    .map(candidate => parseChatModelSelection({ value: candidate, fallbackProvider: provider }))
    .filter(selection =>
      selection.provider !== 'gemini'
      || CURATED_GEMINI_CHAT_MODELS.includes(selection.model as typeof CURATED_GEMINI_CHAT_MODELS[number]),
    )
    .map(selection => selection.value);

  return filtered.length > 0 ? normalizeModelList(filtered) : [defaultSelection.value];
}

export function normalizeApiKeySecretRef(secretRef: string | null | undefined) {
  const trimmed = secretRef?.trim();
  if (!trimmed || RAW_GOOGLE_API_KEY_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function resolveApiKey(...secretRefs: Array<string | null | undefined>) {
  const candidates = [...secretRefs, DEFAULT_GEMINI_API_KEY_SECRET_REF];

  for (const secretRef of candidates) {
    const normalizedSecretRef = normalizeApiKeySecretRef(secretRef);
    if (!normalizedSecretRef) continue;
    const apiKey = process.env[normalizedSecretRef];
    if (apiKey) return apiKey;
  }

  return null;
}

export function createDefaultSettings(config: Config): AdminAiSettings {
  const ollamaHost = config.ollama.host;
  const model = config.ollama.model;

  return {
    aiFeaturesEnabled: false,
    chat: {
      provider: 'ollama',
      baseUrl: ollamaHost,
      apiKeySecretRef: null,
      model,
      allowedModels: [model],
    },
    translation: {
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
    providers: {
      gemini: {
        baseUrl: GEMINI_OPENAI_COMPATIBLE_BASE_URL,
        apiKeySecretRef: null,
      },
    },
    ollamaHost,
    model,
  };
}

export function createDefaultIngestionSettings(config: Config) {
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

export function normalizeSettings(input: AdminAiSettings): AdminAiSettings {
  const requestedChatProvider = input.chat?.provider === 'gemini' ? 'gemini' : 'ollama';
  const requestedChatModel = (
    input.chat?.model ?? getDefaultChatModel(requestedChatProvider, input.model)
  ).trim();
  const chatSelection = parseChatModelSelection({
    value: requestedChatModel,
    fallbackProvider: requestedChatProvider,
  });
  const chatProvider = chatSelection.provider;
  const chatBaseUrl = normalizeChatBaseUrl({
    provider: chatProvider,
    baseUrl: input.chat?.baseUrl,
    fallbackOllamaHost: input.ollamaHost,
  });
  const chatModel = chatSelection.model;
  const allowedChatModels = normalizeAllowedChatModels({
    provider: chatProvider,
    model: chatModel,
    allowedModels: input.chat?.allowedModels,
  });
  const requestedTranslationProvider = input.translation?.provider === 'gemini' ? 'gemini' : 'ollama';
  const translationBaseUrl = normalizeChatBaseUrl({
    provider: requestedTranslationProvider,
    baseUrl: input.translation?.baseUrl,
    fallbackOllamaHost: input.ollamaHost,
  });
  const translationModel = (input.translation?.model ?? chatModel).trim();
  const embeddingBaseUrl = normalizeHost(input.embedding?.baseUrl ?? chatBaseUrl);
  const embeddingModel = input.embedding.model.trim();
  const legacyOllamaHost =
    chatProvider === 'ollama'
      ? chatBaseUrl
      : requestedTranslationProvider === 'ollama'
        ? translationBaseUrl
        : (input.ollamaHost || embeddingBaseUrl);
  const legacyOllamaModel =
    chatProvider === 'ollama'
      ? chatModel
      : requestedTranslationProvider === 'ollama'
        ? translationModel
        : (input.model || embeddingModel);
  const geminiApiKeySecretRef = (
    input.providers?.gemini?.apiKeySecretRef
    ?? (chatProvider === 'gemini' ? input.chat?.apiKeySecretRef : null)
  );

  return {
    aiFeaturesEnabled: input.aiFeaturesEnabled,
    chat: {
      provider: chatProvider,
      baseUrl: chatBaseUrl,
      apiKeySecretRef: normalizeApiKeySecretRef(input.chat?.apiKeySecretRef),
      model: chatModel,
      allowedModels: allowedChatModels,
    },
    translation: {
      provider: requestedTranslationProvider,
      baseUrl: translationBaseUrl,
      apiKeySecretRef:
        requestedTranslationProvider === 'gemini'
          ? normalizeApiKeySecretRef(input.translation?.apiKeySecretRef ?? geminiApiKeySecretRef)
          : null,
      model: translationModel,
    },
    embedding: {
      provider: 'ollama',
      baseUrl: embeddingBaseUrl,
      apiKeySecretRef: null,
      model: embeddingModel,
      dimensions: input.embedding.dimensions,
    },
    providers: {
      gemini: {
        baseUrl: GEMINI_OPENAI_COMPATIBLE_BASE_URL,
        apiKeySecretRef: normalizeApiKeySecretRef(geminiApiKeySecretRef),
      },
    },
    ollamaHost: legacyOllamaHost,
    model: legacyOllamaModel,
  };
}
