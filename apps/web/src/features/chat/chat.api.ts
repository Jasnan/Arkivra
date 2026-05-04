import { fetchJson } from '@/lib/api';
import type {
  ChatConversation,
  ChatConversationDetail,
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

function getChatBasePath({ vaultId, documentId }: ChatApiScope) {
  if (vaultId && documentId) {
    return `/api/vaults/${vaultId}/documents/${documentId}/chats`;
  }

  if (vaultId) {
    return `/api/vaults/${vaultId}/chats`;
  }

  return '/api/chats';
}

export async function listChatConversations(scope: ChatApiScope) {
  return fetchJson<{ conversations: ChatConversation[] }>(getChatBasePath(scope));
}

export async function createChatConversation({
  title,
  ...scope
}: ChatApiScope & {
  title?: string;
}) {
  return fetchJson<{ conversation: ChatConversation }>(getChatBasePath(scope), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function getChatConversation({
  chatId,
  ...scope
}: ChatApiScope & {
  chatId: string;
}) {
  return fetchJson<{ conversation: ChatConversationDetail }>(
    `${getChatBasePath(scope)}/${chatId}`,
  );
}

export async function deleteChatConversation({
  chatId,
  ...scope
}: ChatApiScope & {
  chatId: string;
}) {
  return fetchJson<void>(`${getChatBasePath(scope)}/${chatId}`, {
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
  vaultId,
  documentId,
  chatId,
  content,
  responseMode = 'multimodal',
  signal,
  ...callbacks
}: ChatApiScope & {
  chatId: string;
  content: string;
  responseMode?: ChatResponseMode;
  signal?: AbortSignal;
} & StreamCallbacks) {
  const response = await fetch(`${getChatBasePath({ vaultId, documentId })}/${chatId}/messages/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, responseMode }),
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
