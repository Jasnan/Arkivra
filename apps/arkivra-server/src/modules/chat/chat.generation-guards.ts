import type { ChatGenerationMetrics } from './chat.types.js';

export function normalizeChatGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Chat generation failed';

  if (message.includes('Controller is already closed') || message.includes('ERR_INVALID_STATE')) {
    return 'The chat response was interrupted before it finished. Please try again.';
  }

  return message;
}

export function isEmptyGeneratedChatContent(content: string) {
  return content.trim().length === 0;
}

export function isLikelyTruncatedSingleTokenAnswer({
  content,
  metrics,
}: {
  content: string;
  metrics: ChatGenerationMetrics | null;
}) {
  const words = content.trim().split(/\s+/).filter(Boolean);

  return words.length === 1 && metrics?.evalCount !== null && metrics?.evalCount !== undefined
    ? metrics.evalCount <= 1
    : false;
}
