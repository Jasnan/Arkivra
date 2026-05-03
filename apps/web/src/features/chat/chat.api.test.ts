import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatConversation, streamChatMessage } from './chat.api';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('chat api helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a vault conversation', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      conversation: {
        id: 'cht_1',
        vaultId: 'vlt_1',
        createdBy: 'usr_1',
        title: 'Retention',
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createChatConversation({ vaultId: 'vlt_1', title: 'Retention' });

    expect(result.conversation.id).toBe('cht_1');
    expect(fetchMock).toHaveBeenCalledWith('/api/vaults/vlt_1/chats', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
  });

  it('parses streaming status, token, done, and error events', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: status\ndata: {"label":"retrieval"}\n\n'));
        controller.enqueue(encoder.encode('event: token\ndata: {"token":"Hi"}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {"userMessage":{"id":"msg_1"},"assistantMessage":{"id":"msg_2"}}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })));
    const statuses: string[] = [];
    const tokens: string[] = [];
    const doneIds: string[] = [];

    await streamChatMessage({
      vaultId: 'vlt_1',
      chatId: 'cht_1',
      content: 'Hello',
      onStatus: status => statuses.push(status),
      onToken: token => tokens.push(token),
      onDone: payload => {
        doneIds.push(payload.userMessage.id, payload.assistantMessage.id);
      },
    });

    expect(statuses).toEqual(['retrieval']);
    expect(tokens).toEqual(['Hi']);
    expect(doneIds).toEqual(['msg_1', 'msg_2']);
  });
});
