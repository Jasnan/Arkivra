import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAssistantChatTransport } from './assistant-chat-runtime.helpers';
import type { AssistantChatTransportConfig } from './assistant-chat-runtime.helpers';
import type { ChatMessage } from '../chat.types';

function userMessage(id: string, text: string): ChatMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  };
}

function emptyStreamResponse() {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    { status: 200 },
  );
}

describe('assistant chat runtime transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the latest chat config without recreating the transport', async () => {
    const initialResolveChatId = vi.fn(async () => 'chat_created_from_draft');
    const selectedResolveChatId = vi.fn(async () => 'chat_existing');
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return emptyStreamResponse();
    });
    let currentConfig: AssistantChatTransportConfig = {
      chatId: '',
      intent: null,
      model: undefined,
      responseMode: 'text' as const,
      resolveChatId: initialResolveChatId,
    };
    const transport = createAssistantChatTransport({
      getConfig: () => currentConfig,
    });

    vi.stubGlobal('fetch', fetchMock);

    await transport.sendMessages({
      chatId: 'runtime',
      trigger: 'submit-message',
      messageId: undefined,
      messages: [userMessage('msg_1', 'Start a draft')],
      abortSignal: undefined,
    });

    currentConfig = {
      chatId: 'chat_existing',
      intent: 'search',
      model: 'llama3.2',
      responseMode: 'multimodal',
      resolveChatId: selectedResolveChatId,
    };

    await transport.sendMessages({
      chatId: 'runtime',
      trigger: 'submit-message',
      messageId: undefined,
      messages: [userMessage('msg_2', 'Follow up in the existing chat')],
      metadata: { intent: 'summarize' },
      abortSignal: undefined,
    });

    expect(initialResolveChatId).toHaveBeenCalledTimes(1);
    expect(selectedResolveChatId).toHaveBeenCalledTimes(1);
    expect(requests.at(-1)?.input).toBe('/api/chats/chat_existing/messages/stream');
    expect(requests.at(-1)?.init).toMatchObject({
      credentials: 'include',
      method: 'POST',
    });
    expect(JSON.parse(requests[1]?.init?.body as string)).toMatchObject({
      id: 'chat_existing',
      intent: 'summarize',
      model: 'llama3.2',
      responseMode: 'multimodal',
    });
  });
});
