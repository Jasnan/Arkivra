import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatConversation, getChatModelOptions } from './chat.api';

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

  it('creates a pre-scoped vault conversation through the unified chat endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      conversation: {
        id: 'cht_1',
        vaultId: 'vlt_1',
        documentId: null,
        scope: 'vault',
        contextSnapshot: { type: 'vault', vaultId: 'vlt_1' },
        userId: 'usr_1',
        title: 'Retention',
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createChatConversation({ vaultId: 'vlt_1', title: 'Retention' });

    expect(result.conversation.id).toBe('cht_1');
    expect(fetchMock).toHaveBeenCalledWith('/api/chats', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        title: 'Retention',
        contextSnapshot: { type: 'vault', vaultId: 'vlt_1' },
      }),
    }));
  });

  it('creates a composed context conversation through the unified chat endpoint', async () => {
    const contextSnapshot = {
      type: 'selection' as const,
      vaults: [{ vaultId: 'vlt_1', name: 'Finance' }],
      documents: [{ vaultId: 'vlt_2', documentId: 'doc_2', name: 'Passport.pdf', vaultName: 'Identity' }],
    };
    const fetchMock = vi.fn(async () => jsonResponse({
      conversation: {
        id: 'cht_2',
        vaultId: null,
        documentId: null,
        scope: 'global',
        contextSnapshot,
        userId: 'usr_1',
        title: 'Compare context',
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createChatConversation({ title: 'Compare context', contextSnapshot });

    expect(result.conversation.contextSnapshot).toEqual(contextSnapshot);
    expect(fetchMock).toHaveBeenCalledWith('/api/chats', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        title: 'Compare context',
        contextSnapshot,
      }),
    }));
  });

  it('loads chat model options from the unified endpoint', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      options: {
        defaultModel: 'gemma4:e4b',
        models: ['gemma4:e4b', 'qwen2.5:7b'],
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getChatModelOptions();

    expect(result.options.models).toEqual(['gemma4:e4b', 'qwen2.5:7b']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chats/options',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

});
