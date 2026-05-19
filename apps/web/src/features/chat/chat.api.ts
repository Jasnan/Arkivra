import { fetchJson } from '@/lib/api';
import type {
  ChatConversation,
  ChatConversationDetail,
  ChatContextSnapshot,
  ChatIntent,
  ChatModelOptions,
  ChatStreamDonePayload,
  ChatStreamStatus,
} from './chat.types';

const SSE_EVENT_SEPARATOR_RE = /\n\n/;
const SSE_LINE_SEPARATOR_RE = /\r?\n/;

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

export async function deleteChatConversation({
  chatId,
}: {
  chatId: string;
}) {
  return fetchJson<void>(`/api/chats/${chatId}`, {
    method: 'DELETE',
  });
}

interface StreamCallbacks {
  onStatus?: (status: ChatStreamStatus) => void;
  onToken?: (token: string) => void;
  onDone?: (payload: ChatStreamDonePayload) => void;
  onError?: (message: string) => void;
}

function dispatchSseEvent({
  event,
  data,
  callbacks,
}: {
  event: string;
  data: string;
  callbacks: StreamCallbacks;
}) {
  const parsed = data.length > 0 ? JSON.parse(data) as Record<string, unknown> : {};

  if (event === 'status' && typeof parsed.label === 'string') {
    callbacks.onStatus?.(parsed.label as ChatStreamStatus);
  } else if (event === 'token' && typeof parsed.token === 'string') {
    callbacks.onToken?.(parsed.token);
  } else if (event === 'done') {
    callbacks.onDone?.(parsed as unknown as ChatStreamDonePayload);
  } else if (event === 'error' && typeof parsed.message === 'string') {
    callbacks.onError?.(parsed.message);
  }
}

export async function streamChatMessage({
  chatId,
  content,
  intent,
  model,
  responseMode = 'multimodal',
  signal,
  ...callbacks
}: {
  chatId: string;
  content: string;
  intent?: ChatIntent;
  model?: string;
  responseMode?: ChatResponseMode;
  signal?: AbortSignal;
} & StreamCallbacks) {
  const response = await fetch(`/api/chats/${chatId}/messages/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, intent, responseMode, model }),
    signal,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json() as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
    }
    throw new Error(message);
  }

  if (response.body === null) {
    throw new Error('Chat stream did not return a response body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split(SSE_EVENT_SEPARATOR_RE);
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      const lines = rawEvent.split(SSE_LINE_SEPARATOR_RE);
      const event = lines.find(line => line.startsWith('event: '))?.slice(7).trim() ?? 'message';
      const data = lines
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6))
        .join('\n');

      dispatchSseEvent({ event, data, callbacks });
    }

    if (done) {
      break;
    }
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    const lines = tail.split(SSE_LINE_SEPARATOR_RE);
    const event = lines.find(line => line.startsWith('event: '))?.slice(7).trim() ?? 'message';
    const data = lines
      .filter(line => line.startsWith('data: '))
      .map(line => line.slice(6))
      .join('\n');
    dispatchSseEvent({ event, data, callbacks });
  }
}
