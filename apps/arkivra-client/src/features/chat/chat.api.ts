import { fetchJson } from '@/lib/api';
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatContextSnapshot,
  ChatModelOptions,
} from './chat.types';

export interface ChatApiScope {
  vaultId?: string;
  documentId?: string;
}

export type ChatResponseMode = 'text' | 'multimodal';

export function getChatContextSnapshot({ vaultId, documentId }: ChatApiScope): ChatContextSnapshot {
  if (vaultId && documentId) {
    return { type: 'document', vaultId, documentId };
  }

  if (vaultId) {
    return { type: 'vault', vaultId };
  }

  return { type: 'global', vaultIds: [] };
}

export async function listChatConversations() {
  return fetchJson<{ conversations: ChatConversation[] }>('/api/chats');
}

export async function getChatModelOptions() {
  return fetchJson<{ options: ChatModelOptions }>('/api/chats/options');
}

export async function createChatConversation({
  title,
  contextSnapshot,
  ...scope
}: ChatApiScope & {
  title?: string;
  contextSnapshot?: ChatContextSnapshot;
}) {
  return fetchJson<{ conversation: ChatConversation }>('/api/chats', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, contextSnapshot: contextSnapshot ?? getChatContextSnapshot(scope) }),
  });
}

export async function getChatConversation({
  chatId,
}: {
  chatId: string;
}) {
  return fetchJson<{ conversation: ChatConversationDetail }>(
    `/api/chats/${chatId}`,
  );
}

export async function updateChatConversationContext({
  chatId,
  contextSnapshot,
}: {
  chatId: string;
  contextSnapshot: ChatContextSnapshot;
}) {
  return fetchJson<{ conversation: ChatConversation }>(`/api/chats/${chatId}/context`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contextSnapshot }),
  });
}

export async function deleteChatConversation({
  chatId,
}: {
  chatId: string;
}) {
  return fetchJson<void>(`/api/chats/${chatId}`, {
    method: 'DELETE',
  });
}
