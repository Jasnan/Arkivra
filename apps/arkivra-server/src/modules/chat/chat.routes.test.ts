import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { ChatServices } from './chat.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerChatRoutes } from './chat.routes.js';

const USER_MESSAGE = {
  id: 'msg_user',
  role: 'user' as const,
  parts: [{ type: 'text' as const, text: 'Can we continue?' }],
};

function createMockDb(documentRows: unknown[] = []) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => documentRows),
        })),
      })),
    })),
  } as unknown as Database;
}

function createMockVaultsServices() {
  return {
    getVaultForUser: vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Finance',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      isAdmin: false,
    })),
    listUserVaults: vi.fn(async () => []),
  } as unknown as VaultsServices;
}

function createConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cht_1',
    vaultId: 'vlt_1',
    documentId: 'doc_1',
    scope: 'document' as const,
    contextSnapshot: {
      type: 'document' as const,
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      vaultName: 'Finance',
      documentName: 'Report.pdf',
    },
    contextAvailability: { status: 'available' as const, readOnly: false as const },
    userId: 'usr_1',
    title: 'Report chat',
    createdAt: '2026-05-05T10:00:00.000Z',
    updatedAt: '2026-05-05T10:05:00.000Z',
    messages: [USER_MESSAGE],
    ...overrides,
  };
}

function createMockChatServices(overrides: Partial<ChatServices> = {}) {
  return {
    listConversations: vi.fn(async () => ({ conversations: [] })),
    getConversation: vi.fn(async () => createConversation()),
    createConversation: vi.fn(async () => createConversation()),
    renameConversation: vi.fn(async () => createConversation()),
    deleteConversation: vi.fn(async () => true),
    getModelOptions: vi.fn(async () => ({ defaultModel: 'llama3.2', models: ['llama3.2'] })),
    createMessageStream: vi.fn(async () => new Response('stream')),
    ...overrides,
  } as unknown as ChatServices;
}

function createTestApp({
  db = createMockDb([{ id: 'doc_1', name: 'Report.pdf' }]),
  services = createMockChatServices(),
  vaultServices = createMockVaultsServices(),
}: {
  db?: Database;
  services?: ChatServices;
  vaultServices?: VaultsServices;
} = {}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
    context.set('userDisabled', false);
    context.set('canUseAI', context.req.header('x-test-can-use-ai') !== 'false');
    context.set('vaultId', null);
    context.set('vaultRole', null);

    const userIdHeader = context.req.header('x-test-user-id');
    if (typeof userIdHeader === 'string' && userIdHeader.length > 0) {
      context.set('userId', userIdHeader);
      context.set('session', {
        id: `ses_${userIdHeader}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: userIdHeader,
        expiresAt: new Date(Date.now() + 3600_000),
        token: `tok_${userIdHeader}`,
      });
    }

    await next();
  });

  registerChatRoutes({ app, db, services, vaultServices });

  return { app, services };
}

function streamBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    messages: [USER_MESSAGE],
    responseMode: 'text',
    model: 'ollama:llama3.2',
    ...overrides,
  });
}

describe('chat routes', () => {
  test('summarizes selected vault context without requiring user text', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });
    const emptyUserMessage = {
      id: 'msg_empty_summary',
      role: 'user' as const,
      parts: [],
    };

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        contextSnapshot: { type: 'vault', vaultId: 'vlt_1' },
        intent: 'summarize',
        messages: [emptyUserMessage],
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith({
      userId: 'usr_1',
      scope: { type: 'vault', vaultId: 'vlt_1', vaultName: 'Finance' },
      messages: [{
        ...emptyUserMessage,
        parts: [{ type: 'text', text: 'Summarize the selected context.' }],
      }],
      intent: 'summarize',
      responseMode: 'text',
      includeCitations: true,
      model: 'ollama:llama3.2',
    });
  });

  test('rejects an empty summarize request without selected context', async () => {
    const services = createMockChatServices();
    const vaultServices = {
      ...createMockVaultsServices(),
      listUserVaults: vi.fn(async () => [{
        id: 'vlt_1',
        name: 'Finance',
        description: null,
        fileCount: 1,
        totalSize: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'owner',
        isAdmin: false,
        isMember: true,
      }]),
    } as unknown as VaultsServices;
    const { app } = createTestApp({ services, vaultServices });
    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        contextSnapshot: { type: 'global', vaultIds: ['vlt_1'] },
        intent: 'summarize',
        messages: [{ id: 'msg_empty_summary', role: 'user', parts: [] }],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'chat.invalid_content',
        message: 'Select a document or vault before sending summarize without text',
      },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('compares two selected documents without requiring user text', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({
      services,
      db: createMockDb([
        { id: 'doc_1', name: 'January.pdf' },
        { id: 'doc_2', name: 'February.pdf' },
      ]),
    });
    const emptyUserMessage = { id: 'msg_empty_compare', role: 'user' as const, parts: [] };
    const contextSnapshot = {
      type: 'selection' as const,
      vaults: [],
      documents: [
        { vaultId: 'vlt_1', documentId: 'doc_1' },
        { vaultId: 'vlt_1', documentId: 'doc_2' },
      ],
    };

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        contextSnapshot,
        intent: 'compare',
        messages: [emptyUserMessage],
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'compare',
      scope: expect.objectContaining({ type: 'selection' }),
      messages: [{
        ...emptyUserMessage,
        parts: [{ type: 'text', text: 'Compare the selected context.' }],
      }],
    }));
  });

  test('accepts compare instructions when at least two targets are selected', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });
    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        contextSnapshot: {
          type: 'selection',
          vaults: [
            { vaultId: 'vlt_1' },
            { vaultId: 'vlt_2' },
          ],
          documents: [],
        },
        intent: 'compare',
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith(expect.objectContaining({
      intent: 'compare',
      messages: [USER_MESSAGE],
    }));
  });

  test('rejects compare when fewer than two targets are selected even with instructions', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });
    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        contextSnapshot: { type: 'document', vaultId: 'vlt_1', documentId: 'doc_1' },
        intent: 'compare',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'chat.invalid_context',
        message: 'Select at least two documents or vaults to compare',
      },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('rejects first-message streams without the platform Use AI privilege', async () => {
    const { app, services } = createTestApp();

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
        'x-test-can-use-ai': 'false',
      },
      body: streamBody({ contextSnapshot: { type: 'vault', vaultId: 'vlt_1' } }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'authorization.use_ai_required',
        message: 'Use AI privilege required',
      },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('starts a new global conversation stream from readable admin vaults', async () => {
    const services = createMockChatServices();
    const vaultServices = {
      ...createMockVaultsServices(),
      listUserVaults: vi.fn(async () => [
        {
          id: 'vlt_direct',
          name: 'Direct vault',
          description: null,
          fileCount: 1,
          totalSize: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          role: 'owner',
          isAdmin: true,
          isMember: true,
        },
        {
          id: 'vlt_implicit',
          name: 'Implicit admin vault',
          description: null,
          fileCount: 1,
          totalSize: 1,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          deletedAt: null,
          role: null,
          isAdmin: true,
          isMember: false,
        },
      ]),
    } as unknown as VaultsServices;
    const { app } = createTestApp({ services, vaultServices });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_admin' },
      body: streamBody({ contextSnapshot: { type: 'global', vaultIds: [] } }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith({
      userId: 'usr_admin',
      scope: {
        type: 'global',
        vaultIds: ['vlt_direct', 'vlt_implicit'],
      },
      messages: [USER_MESSAGE],
      intent: undefined,
      responseMode: 'text',
      includeCitations: true,
      model: 'ollama:llama3.2',
    });
  });

  test('starts an existing conversation stream with the supplied chat id', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({ chatId: 'cht_1' }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith({
      userId: 'usr_1',
      chatId: 'cht_1',
      messages: [USER_MESSAGE],
      intent: undefined,
      responseMode: 'text',
      includeCitations: true,
      model: 'ollama:llama3.2',
    });
  });

  test('starts an assistant-ui conversation stream with the supplied thread id', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        id: 'cht_1',
        messages: [USER_MESSAGE],
        config: { modelName: 'ollama:llama3.2' },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith({
      userId: 'usr_1',
      chatId: 'cht_1',
      messages: [USER_MESSAGE],
      intent: undefined,
      responseMode: 'text',
      includeCitations: true,
      model: 'ollama:llama3.2',
    });
  });

  test('does not treat local assistant-ui ids as persisted chat ids', async () => {
    const services = createMockChatServices();
    const vaultServices = {
      ...createMockVaultsServices(),
      listUserVaults: vi.fn(async () => [
        {
          id: 'vlt_1',
          name: 'Finance',
          description: null,
          fileCount: 1,
          totalSize: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          role: 'owner',
          isAdmin: false,
          isMember: true,
        },
      ]),
    } as unknown as VaultsServices;
    const { app } = createTestApp({ services, vaultServices });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        id: 'aui-local-thread-id',
        contextSnapshot: { type: 'global', vaultIds: [] },
        messages: [USER_MESSAGE],
        config: { modelName: 'ollama:llama3.2' },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.getConversation).not.toHaveBeenCalled();
    expect(services.createMessageStream).toHaveBeenCalledWith({
      userId: 'usr_1',
      scope: {
        type: 'global',
        vaultIds: ['vlt_1'],
      },
      messages: [USER_MESSAGE],
      intent: undefined,
      responseMode: 'multimodal',
      includeCitations: true,
      model: 'ollama:llama3.2',
    });
  });

  test('accepts attached document context that changes a conversation scope for the new turn', async () => {
    const services = createMockChatServices({
      getConversation: vi.fn(async () =>
        createConversation({
          contextSnapshot: { type: 'global' as const, vaultIds: ['vlt_1', 'vlt_2'] },
        }),
      ),
    });
    const { app } = createTestApp({
      db: createMockDb([{ id: 'doc_selected', name: 'Selected.pdf' }]),
      services,
    });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        id: 'cht_1',
        messages: [
          {
            ...USER_MESSAGE,
            metadata: {
              custom: {
                contextSnapshot: {
                  type: 'selection',
                  vaults: [],
                  documents: [
                    {
                      vaultId: 'vlt_1',
                      documentId: 'doc_selected',
                      name: 'Selected.pdf',
                    },
                  ],
                },
              },
            },
          },
        ],
        config: { modelName: 'ollama:llama3.2' },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          type: 'selection',
          vaults: [],
          documents: [expect.objectContaining({
            vaultId: 'vlt_1',
            documentId: 'doc_selected',
            name: 'Selected.pdf',
          })],
        },
      }),
    );
  });

  test('accepts global rescoping of a conversation from the request body', async () => {
    const services = createMockChatServices({
      getConversation: vi.fn(async () =>
        createConversation({
          contextSnapshot: {
            type: 'selection' as const,
            vaults: [],
            documents: [{ vaultId: 'vlt_1', documentId: 'doc_selected' }],
          },
        }),
      ),
    });
    const vaultServices = {
      ...createMockVaultsServices(),
      listUserVaults: vi.fn(async () => [
        {
          id: 'vlt_1',
          name: 'Finance',
          description: null,
          fileCount: 1,
          totalSize: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          role: 'owner',
          isAdmin: false,
          isMember: true,
        },
      ]),
    } as unknown as VaultsServices;
    const { app } = createTestApp({ services, vaultServices });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        id: 'cht_1',
        contextSnapshot: { type: 'global', vaultIds: [] },
        messages: [USER_MESSAGE],
        config: { modelName: 'ollama:llama3.2' },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { type: 'global', vaultIds: ['vlt_1'] },
      }),
    );
  });

  test('uses explicit new-turn context instead of context from an earlier user message', async () => {
    const services = createMockChatServices({
      getConversation: vi.fn(async () =>
        createConversation({
          contextSnapshot: {
            type: 'selection' as const,
            vaults: [],
            documents: [{ vaultId: 'vlt_1', documentId: 'doc_selected' }],
          },
        }),
      ),
    });
    const vaultServices = {
      ...createMockVaultsServices(),
      listUserVaults: vi.fn(async () => [
        {
          id: 'vlt_1',
          name: 'Finance',
          description: null,
          fileCount: 1,
          totalSize: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          deletedAt: null,
          role: 'owner',
          isAdmin: false,
          isMember: true,
        },
      ]),
    } as unknown as VaultsServices;
    const { app } = createTestApp({ services, vaultServices });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        id: 'cht_1',
        contextSnapshot: { type: 'global', vaultIds: [] },
        messages: [
          {
            id: 'msg_previous_user',
            role: 'user',
            parts: [{ type: 'text', text: 'Use this file' }],
            metadata: {
              custom: {
                contextSnapshot: {
                  type: 'selection',
                  vaults: [],
                  documents: [{ vaultId: 'vlt_1', documentId: 'doc_selected' }],
                },
              },
            },
          },
          {
            id: 'msg_previous_assistant',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Okay.' }],
          },
          USER_MESSAGE,
        ],
        config: { modelName: 'ollama:llama3.2' },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { type: 'global', vaultIds: ['vlt_1'] },
      }),
    );
  });

  test('passes assistant-ui citation preference through stream config', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        id: 'cht_1',
        messages: [USER_MESSAGE],
        config: { modelName: 'ollama:llama3.2', includeCitations: false },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith({
      userId: 'usr_1',
      chatId: 'cht_1',
      messages: [USER_MESSAGE],
      intent: undefined,
      responseMode: 'text',
      includeCitations: false,
      model: 'ollama:llama3.2',
    });
  });

  test('returns a user-bound resumable stream id for assistant-ui streams', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        id: 'cht_1',
        messages: [USER_MESSAGE],
        config: { modelName: 'ollama:llama3.2' },
      }),
    });

    expect(response.status).toBe(200);
    const streamId = response.headers.get('x-resumable-stream-id');
    expect(streamId).toMatch(/^cht_1\.stm_/);

    const resumed = await app.request(`/api/chats/messages/stream/${streamId}`, {
      headers: { 'x-test-user-id': 'usr_1' },
    });
    expect(resumed.status).toBe(200);
    await expect(resumed.text()).resolves.toBe('stream');

    const otherUserResume = await app.request(`/api/chats/messages/stream/${streamId}`, {
      headers: { 'x-test-user-id': 'usr_2' },
    });
    expect(otherUserResume.status).toBe(204);
  });

  test('creates a shell conversation for assistant-ui thread initialization', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        contextSnapshot: {
          type: 'document',
          vaultId: 'vlt_1',
          documentId: 'doc_1',
        },
      }),
    });

    expect(response.status).toBe(201);
    expect(services.createConversation).toHaveBeenCalledWith({
      userId: 'usr_1',
      scope: {
        type: 'document',
        vaultId: 'vlt_1',
        documentId: 'doc_1',
        vaultName: 'Finance',
        documentName: 'Report.pdf',
      },
    });
  });

  test('renames a conversation for assistant-ui generated titles', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/cht_1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({ title: 'Quarterly revenue summary' }),
    });

    expect(response.status).toBe(200);
    expect(services.renameConversation).toHaveBeenCalledWith({
      userId: 'usr_1',
      chatId: 'cht_1',
      title: 'Quarterly revenue summary',
    });
  });

  test('opens deleted-source conversations with guidance to change context', async () => {
    const services = createMockChatServices({
      getConversation: vi.fn(async () =>
        createConversation({
          documentId: 'doc_deleted',
          contextSnapshot: {
            type: 'document' as const,
            vaultId: 'vlt_1',
            documentId: 'doc_deleted',
            vaultName: 'Finance',
            documentName: 'Deleted source.pdf',
          },
        }),
      ),
    });
    const { app } = createTestApp({ db: createMockDb([]), services });

    const response = await app.request('/api/chats/cht_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      conversation: {
        id: 'cht_1',
        messages: [{ parts: [{ type: 'text', text: 'Can we continue?' }] }],
        contextAvailability: {
          status: 'source_document_deleted',
          readOnly: true,
          message: expect.stringContaining('Change the attached context to continue'),
        },
      },
    });
  });

  test('rejects streams for read-only conversations before calling generation', async () => {
    const services = createMockChatServices({
      getConversation: vi.fn(async () =>
        createConversation({
          contextAvailability: {
            status: 'source_document_deleted' as const,
            readOnly: true as const,
            message:
              'One or more sources in the current chat context were deleted. Change the attached context to continue.',
          },
        }),
      ),
    });
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({ chatId: 'cht_1' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'chat.context_unavailable',
        message:
          'One or more sources in the current chat context were deleted. Change the attached context to continue.',
      },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('allows a conversation with a deleted prior source to continue with new valid context', async () => {
    const services = createMockChatServices({
      getConversation: vi.fn(async () =>
        createConversation({
          documentId: 'doc_deleted',
          contextSnapshot: {
            type: 'document' as const,
            vaultId: 'vlt_1',
            documentId: 'doc_deleted',
            vaultName: 'Finance',
            documentName: 'Deleted source.pdf',
          },
          contextAvailability: {
            status: 'source_document_deleted' as const,
            readOnly: true as const,
            message:
              'One or more sources in the current chat context were deleted. Change the attached context to continue.',
          },
        }),
      ),
    });
    const { app } = createTestApp({
      db: createMockDb([{ id: 'doc_selected', name: 'Selected.pdf' }]),
      services,
    });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({
        id: 'cht_1',
        messages: [
          {
            ...USER_MESSAGE,
            metadata: {
              custom: {
                contextSnapshot: {
                  type: 'selection',
                  vaults: [],
                  documents: [{ vaultId: 'vlt_1', documentId: 'doc_selected' }],
                },
              },
            },
          },
        ],
        config: { modelName: 'ollama:llama3.2' },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          type: 'selection',
          documents: [expect.objectContaining({ documentId: 'doc_selected' })],
        }),
      }),
    );
  });

  test('checks vault access before unavailable-source stream rejection', async () => {
    const services = createMockChatServices({
      getConversation: vi.fn(async () =>
        createConversation({
          contextAvailability: {
            status: 'source_document_deleted' as const,
            readOnly: true as const,
            message:
              'One or more sources in the current chat context were deleted. Change the attached context to continue.',
          },
        }),
      ),
    });
    const vaultServices = createMockVaultsServices();
    vi.mocked(vaultServices.getVaultForUser).mockResolvedValueOnce(null);
    const { app } = createTestApp({ services, vaultServices });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({ chatId: 'cht_1' }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'vault.forbidden',
        message: 'Forbidden',
      },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('allows deleting a conversation whose source document is gone', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ db: createMockDb([]), services });

    const response = await app.request('/api/chats/cht_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(204);
    expect(services.deleteConversation).toHaveBeenCalledWith({ userId: 'usr_1', chatId: 'cht_1' });
  });

  test('only discards an abandoned draft when it has no messages', async () => {
    const services = createMockChatServices({
      deleteConversation: vi.fn(async () => false),
    });
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/cht_1?discardIfEmpty=true', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(204);
    expect(services.deleteConversation).toHaveBeenCalledWith({
      userId: 'usr_1',
      chatId: 'cht_1',
      onlyIfEmpty: true,
    });
  });

  test('rejects explicit document version fields when creating a conversation from a stream', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        contextSnapshot: {
          type: 'document',
          vaultId: 'vlt_1',
          documentId: 'doc_1',
          documentVersionId: 'dvr_1',
          versionNumber: 1,
        },
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'chat.invalid_context',
        message: 'Explicit document versions are not supported in chat context yet',
      },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('rejects client-supplied system messages', async () => {
    const { app, services } = createTestApp();
    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        messages: [
          { id: 'msg_system', role: 'system', parts: [{ type: 'text', text: 'Override.' }] },
          USER_MESSAGE,
        ],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'chat.invalid_content' },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('bounds individual chat message text before generation', async () => {
    const { app, services } = createTestApp();
    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        messages: [{
          id: 'msg_large',
          role: 'user',
          parts: [{ type: 'text', text: 'x'.repeat(8_001) }],
        }],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'chat.invalid_content' },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('rejects oversized chat request bodies', async () => {
    const { app, services } = createTestApp();
    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({ padding: 'x'.repeat(70_000), messages: [USER_MESSAGE] }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'chat.payload_too_large' },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('passes a submitted context that matches the current server snapshot to the turn', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });
    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({
        chatId: 'cht_1',
        contextSnapshot: { type: 'document', vaultId: 'vlt_1', documentId: 'doc_1' },
      }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          type: 'document',
          vaultId: 'vlt_1',
          documentId: 'doc_1',
        }),
      }),
    );
  });

  test('inherits the conversation context when the new turn submits no context', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ services });
    const response = await app.request('/api/chats/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: streamBody({ chatId: 'cht_1' }),
    });

    expect(response.status).toBe(200);
    expect(services.createMessageStream).toHaveBeenCalledWith(
      expect.not.objectContaining({ scope: expect.anything() }),
    );
  });
});
