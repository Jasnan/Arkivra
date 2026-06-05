import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel, LanguageModelUsage } from 'ai';
import type { ChatGenerationMetrics } from './chat.types.js';

export type ChatAiRuntimeSettings = {
  baseUrl: string;
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

  const elapsedSeconds = startedAtMs !== null && finishedAtMs !== null
    ? (finishedAtMs - startedAtMs) / 1000
    : null;
  const tokensPerSecond = usage?.outputTokens !== undefined
    && elapsedSeconds !== null
    && elapsedSeconds > 0
    ? Math.round((usage.outputTokens / elapsedSeconds) * 10) / 10
    : null;

  return {
    promptEvalCount: usage?.inputTokens ?? null,
    promptEvalDurationMs: null,
    evalCount: usage?.outputTokens ?? null,
    evalDurationMs: null,
    totalDurationMs: startedAtMs !== null && finishedAtMs !== null ? finishedAtMs - startedAtMs : null,
    loadDurationMs: null,
    tokensPerSecond,
    timeToFirstTokenMs,
  };
}

function normalizeOpenAICompatibleBaseUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

export function createChatModel({ settings, model }: { settings: ChatAiRuntimeSettings; model: string }): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'ollama',
    baseURL: normalizeOpenAICompatibleBaseUrl(settings.baseUrl),
    includeUsage: true,
    supportsStructuredOutputs: false,
    transformRequestBody: (body) => ({
      ...body,
      stream_options: body.stream === true ? { include_usage: true } : undefined,
    }),
  });

  return provider.chatModel(model);
}
