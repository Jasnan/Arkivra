import { privatemodeProviderSettings } from '../../ai/providers/privatemode.provider.js';
import type { Config } from '../../config/config.js';
import { normalizeOllamaHost } from '../../ai/providers/index.js';
import type { AdminAiChatProviderKind, AdminAiProviderKind, AdminAiSettings } from './ai.types.js';

const DEFAULT_GEMINI_API_KEY_SECRET_REF = 'GEMINI_API_KEY';
const RAW_GOOGLE_API_KEY_PATTERN = /^AIza[\w-]{20,}$/;

export const INSTANCE_AI_SETTINGS_ID = 'instance_ai_settings';
export const GEMINI_OPENAI_COMPATIBLE_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai';
export const LEGACY_DEFAULT_OLLAMA_CHAT_MODEL = 'gemma4:e4b';

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
  if (provider === 'privatemode') return privatemodeProviderSettings().baseUrl;
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

function formatChatModelValue({ provider, model }: { provider: ChatProvider; model: string }) {
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

  if (maybeProvider === 'ollama' || maybeProvider === 'gemini' || maybeProvider === 'privatemode') {
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

export function isAdminAiProviderKind(provider: unknown): provider is AdminAiProviderKind {
  return provider === 'ollama' || provider === 'gemini' || provider === 'privatemode';
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
  const defaultSelection =
    model.trim().length > 0
      ? parseChatModelSelection({ value: model, fallbackProvider: provider })
      : null;
  const candidates = normalizeModelList([
    ...(allowedModels ?? []),
    ...(defaultSelection ? [defaultSelection.value] : []),
  ]);
  const filtered = candidates
    .map((candidate) => parseChatModelSelection({ value: candidate, fallbackProvider: provider }))
    .filter((selection) => selection.model.length > 0)
    .map((selection) => selection.value);

  return normalizeModelList(filtered);
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
  const ollamaHost = config.ollama.configured === false ? '' : config.ollama.host;
  const model = '';

  return {
    aiFeaturesEnabled: false,
    chat: {
      provider: 'ollama',
      baseUrl: ollamaHost,
      apiKeySecretRef: null,
      model,
      allowedModels: [],
    },
    translation: {
      provider: 'ollama',
      baseUrl: ollamaHost,
      apiKeySecretRef: null,
      model: '',
    },
    embedding: {
      provider: null,
      baseUrl: '',
      apiKeySecretRef: null,
      model: null,
      dimensions: null,
    },
    providers: {
      privatemode: privatemodeProviderSettings(),
      gemini: {
        baseUrl: GEMINI_OPENAI_COMPATIBLE_BASE_URL,
        apiKeySecretRef: null,
        configured: resolveApiKey() !== null,
      },
    },
    ollamaHost,
    model,
  };
}

export function createDefaultIngestionSettings(config: Config) {
  const captioningModel = config.ollama.imageCaptioningModel ?? '';
  const ollamaHost = config.ollama.configured === false ? '' : config.ollama.host;

  return {
    embeddingEnabled: false,
    embeddingHost: ollamaHost,
    embeddingModel: null,
    embeddingDimensions: null,
    captioningEnabled:
      ollamaHost.length > 0 &&
      config.ollama.imageCaptioningEnabled === true &&
      captioningModel.length > 0,
    captioningHost: ollamaHost,
    captioningModel,
  };
}

export function normalizeSettings(input: AdminAiSettings): AdminAiSettings {
  const requestedChatProvider = isAdminAiProviderKind(input.chat?.provider)
    ? input.chat.provider
    : 'ollama';
  const requestedChatModel = (input.chat?.model ?? '').trim();
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
  const requestedTranslationProvider = isAdminAiProviderKind(input.translation?.provider)
    ? input.translation.provider
    : 'ollama';
  const translationBaseUrl = normalizeChatBaseUrl({
    provider: requestedTranslationProvider,
    baseUrl: input.translation?.baseUrl,
    fallbackOllamaHost: input.ollamaHost,
  });
  const translationModel = (input.translation?.model ?? '').trim();
  const requestedEmbeddingProvider = input.embedding?.provider;
  const embeddingProvider = isAdminAiProviderKind(requestedEmbeddingProvider)
    ? requestedEmbeddingProvider
    : null;
  const embeddingBaseUrl =
    embeddingProvider === null
      ? ''
      : embeddingProvider === 'privatemode'
        ? privatemodeProviderSettings().baseUrl
        : embeddingProvider === 'gemini'
          ? normalizeGeminiBaseUrl(input.embedding?.baseUrl)
          : normalizeHost(input.embedding?.baseUrl ?? chatBaseUrl);
  const embeddingModel = input.embedding?.model?.trim() || null;
  const embeddingDimensions =
    typeof input.embedding?.dimensions === 'number' && input.embedding.dimensions > 0
      ? input.embedding.dimensions
      : null;
  const embeddingApiKeySecretRef =
    embeddingProvider === 'privatemode'
      ? 'PRIVATEMODE_API_KEY'
      : embeddingProvider === 'gemini'
        ? normalizeApiKeySecretRef(
            input.embedding?.apiKeySecretRef ??
              input.providers?.gemini?.apiKeySecretRef ??
              (chatProvider === 'gemini' ? input.chat?.apiKeySecretRef : null),
          )
        : null;
  const hasEmbeddingSelection = embeddingProvider !== null && embeddingModel !== null;
  const legacyOllamaHost =
    chatProvider === 'ollama'
      ? chatBaseUrl
      : requestedTranslationProvider === 'ollama'
        ? translationBaseUrl
        : input.ollamaHost || embeddingBaseUrl;
  const legacyOllamaModel =
    chatProvider === 'ollama'
      ? chatModel
      : requestedTranslationProvider === 'ollama'
        ? translationModel
        : input.model || embeddingModel || '';
  const geminiApiKeySecretRef =
    input.providers?.gemini?.apiKeySecretRef ??
    (chatProvider === 'gemini' ? input.chat?.apiKeySecretRef : null);

  return {
    aiFeaturesEnabled: input.aiFeaturesEnabled && hasEmbeddingSelection,
    chat: {
      provider: chatProvider,
      baseUrl: chatBaseUrl,
      apiKeySecretRef:
        chatProvider === 'privatemode'
          ? 'PRIVATEMODE_API_KEY'
          : normalizeApiKeySecretRef(input.chat?.apiKeySecretRef),
      model: chatModel,
      allowedModels: allowedChatModels,
    },
    translation: {
      provider: requestedTranslationProvider,
      baseUrl: translationBaseUrl,
      apiKeySecretRef:
        requestedTranslationProvider === 'privatemode'
          ? 'PRIVATEMODE_API_KEY'
          : requestedTranslationProvider === 'gemini'
            ? normalizeApiKeySecretRef(input.translation?.apiKeySecretRef ?? geminiApiKeySecretRef)
            : null,
      model: translationModel,
    },
    embedding: {
      provider: embeddingProvider,
      baseUrl: embeddingBaseUrl,
      apiKeySecretRef: embeddingApiKeySecretRef,
      model: embeddingModel,
      dimensions: embeddingDimensions,
    },
    providers: {
      privatemode: privatemodeProviderSettings(),
      gemini: {
        baseUrl: GEMINI_OPENAI_COMPATIBLE_BASE_URL,
        apiKeySecretRef: normalizeApiKeySecretRef(geminiApiKeySecretRef),
      },
    },
    ollamaHost: legacyOllamaHost,
    model: legacyOllamaModel,
  };
}
