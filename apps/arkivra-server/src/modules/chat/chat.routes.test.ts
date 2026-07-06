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

  test('opens deleted-source conversations as read-only history', async () => {
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
          message: expect.stringContaining('read-only history'),
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
              'One or more source documents were deleted. This conversation is available as read-only history.',
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
          'One or more source documents were deleted. This conversation is available as read-only history.',
      },
    });
    expect(services.createMessageStream).not.toHaveBeenCalled();
  });

  test('checks vault access before unavailable-source stream rejection', async () => {
    const services = createMockChatServices({
      getConversation: vi.fn(async () =>
        createConversation({
          contextAvailability: {
            status: 'source_document_deleted' as const,
            readOnly: true as const,
            message:
              'One or more source documents were deleted. This conversation is available as read-only history.',
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
});
