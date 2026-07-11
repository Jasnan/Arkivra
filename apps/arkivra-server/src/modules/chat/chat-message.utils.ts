import type { UIMessageStreamWriter } from 'ai';
import type {
  ChatGenerationMetrics,
  ChatMessage,
  ChatMessageMetadata,
  ChatStreamStatus,
} from './chat.types.js';
import type { Citation } from '../search/search.types.js';
import { MAX_CHAT_HISTORY_MESSAGE_TEXT_LENGTH } from './chat.constants.js';

export function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function hydratePersistedChatMessage(row: {
  id: string;
  conversationId: string;
  vaultId: string | null;
  documentId: string | null;
  scope: 'global' | 'vault' | 'document';
  userId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  message: ChatMessage;
}): ChatMessage {
  return {
    ...row.message,
    id: row.id,
    metadata: {
      ...row.message.metadata,
      conversationId: row.conversationId,
      vaultId: row.vaultId,
      documentId: row.documentId,
      scope: row.scope,
      userId: row.userId,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    },
  };
}

export function getMessageText(message: ChatMessage) {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim();
}

function withArkivraMetadata({
  message,
  metadata,
}: {
  message: ChatMessage;
  metadata: ChatMessageMetadata;
}): ChatMessage {
  return {
    ...message,
    metadata: {
      ...message.metadata,
      ...metadata,
    },
  };
}

export function buildUserMessage({
  id,
  message,
  metadata,
}: {
  id: string;
  message: ChatMessage;
  metadata: ChatMessageMetadata;
}): ChatMessage {
  return withArkivraMetadata({
    message: {
      ...message,
      id,
      role: 'user',
      // Document/image context is resolved server-side. Never persist client-provided file URLs
      // where a later turn could forward them to an AI provider as trusted message history.
      parts: message.parts.filter(part => part.type === 'text'),
    },
    metadata,
  });
}

export function buildAssistantMessage({
  id,
  content,
  metadata,
  citations,
  metrics,
}: {
  id: string;
  content: string;
  metadata: ChatMessageMetadata;
  citations: Citation[];
  metrics: ChatGenerationMetrics | null;
}): ChatMessage {
  const textParts = content.length > 0 ? [{ type: 'text' as const, text: content }] : [];
  const statusParts = metadata.generationStatus === 'pending'
    ? [{ type: 'data-status' as const, data: { label: 'generation' as const } }]
    : [];

  return {
    id,
    role: 'assistant',
    metadata: {
      ...metadata,
      citations,
      generationMetrics: metrics,
      generationStatus: metadata.generationStatus ?? 'completed',
      generationError: metadata.generationError ?? null,
    },
    parts: [
      ...textParts,
      ...statusParts,
      ...(citations.length > 0 ? [{ type: 'data-citations' as const, data: citations }] : []),
      ...(metrics !== null ? [{ type: 'data-metrics' as const, data: metrics }] : []),
    ],
  };
}

export function writeStatus(
  writer: UIMessageStreamWriter<ChatMessage>,
  label: ChatStreamStatus,
) {
  writer.write({
    type: 'data-status',
    data: { label },
    transient: true,
  });
}

export function getLatestUserMessage(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined) continue;
    if (message.role === 'user') {
      return message;
    }
  }

  return null;
}

export function omitMessageId(message: ChatMessage): Omit<ChatMessage, 'id'> {
  const text = getMessageText(message).slice(0, MAX_CHAT_HISTORY_MESSAGE_TEXT_LENGTH);

  return {
    role: message.role,
    parts: text.length > 0 ? [{ type: 'text', text }] : [],
  };
}
