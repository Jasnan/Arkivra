import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel, LanguageModelUsage } from 'ai';
import type { ChatGenerationMetrics } from './chat.types.js';

const DEFAULT_GEMINI_API_KEY_SECRET_REF = 'GEMINI_API_KEY';
const RAW_GOOGLE_API_KEY_PATTERN = /^AIza[\w-]{20,}$/;

export type ChatAiRuntimeSettings = {
  provider: 'ollama' | 'gemini';
  baseUrl: string;
  apiKey?: string;
};

export function buildChatGenerationMetrics({
  usage,
  timeToFirstTokenMs,
  startedAtMs,
  finishedAtMs,
}: {
  usage: LanguageModelUsage | null;
  timeToFirstTokenMs: number | null;
  startedAtMs: number | null;
  finishedAtMs: number | null;
}): ChatGenerationMetrics | null {
  if (usage === null && timeToFirstTokenMs === null) {
    return null;
  }

  const elapsedSeconds =
    startedAtMs !== null && finishedAtMs !== null ? (finishedAtMs - startedAtMs) / 1000 : null;
  const tokensPerSecond =
    usage?.outputTokens !== undefined && elapsedSeconds !== null && elapsedSeconds > 0
      ? Math.round((usage.outputTokens / elapsedSeconds) * 10) / 10
      : null;

  return {
    promptEvalCount: usage?.inputTokens ?? null,
    promptEvalDurationMs: null,
    evalCount: usage?.outputTokens ?? null,
    evalDurationMs: null,
    totalDurationMs:
      startedAtMs !== null && finishedAtMs !== null ? finishedAtMs - startedAtMs : null,
    loadDurationMs: null,
    tokensPerSecond,
    timeToFirstTokenMs,
  };
}

function normalizeOpenAICompatibleBaseUrl(baseUrl: string, provider: ChatAiRuntimeSettings['provider']) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (provider === 'gemini') {
    return normalized;
  }

  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

export function transformChatRequestBody(body: Record<string, unknown>) {
  return {
    ...body,
    think: false,
    stream_options: body.stream === true ? { include_usage: true } : undefined,
  };
}

export function transformOllamaChatRequestBody(body: Record<string, unknown>) {
  return transformChatRequestBody(body);
}

function normalizeApiKeySecretRef(secretRef: string | null | undefined) {
  const trimmed = secretRef?.trim();
  if (!trimmed || RAW_GOOGLE_API_KEY_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function resolveChatProviderApiKey({
  provider,
  apiKeySecretRef,
  providerApiKeySecretRef,
  env = process.env,
}: {
  provider: ChatAiRuntimeSettings['provider'];
  apiKeySecretRef?: string | null;
  providerApiKeySecretRef?: string | null;
  env?: NodeJS.ProcessEnv;
}) {
  const secretRefs = provider === 'gemini'
    ? [providerApiKeySecretRef, apiKeySecretRef, DEFAULT_GEMINI_API_KEY_SECRET_REF]
    : [apiKeySecretRef];

  for (const secretRef of secretRefs) {
    const normalizedSecretRef = normalizeApiKeySecretRef(secretRef);
    if (!normalizedSecretRef) continue;
    const apiKey = env[normalizedSecretRef];
    if (apiKey) return apiKey;
  }

  return undefined;
}

export function createChatModel({
  settings,
  model,
}: {
  settings: ChatAiRuntimeSettings;
  model: string;
}): LanguageModel {
  if (settings.provider === 'gemini' && !settings.apiKey) {
    throw new Error('Gemini API key environment variable is not configured on the API server.');
  }

  const provider = createOpenAICompatible({
    name: settings.provider,
    baseURL: normalizeOpenAICompatibleBaseUrl(settings.baseUrl, settings.provider),
    ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
    includeUsage: true,
    supportsStructuredOutputs: false,
    ...(settings.provider === 'ollama'
      ? { transformRequestBody: transformOllamaChatRequestBody }
      : {}),
  });

  return provider.chatModel(model);
}
