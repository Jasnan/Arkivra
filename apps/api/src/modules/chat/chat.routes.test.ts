import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { ChatServices } from './chat.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerChatRoutes } from './chat.routes.js';

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
      aiAccessLevel: 'full',
      isAdmin: false,
    })),
    listUserVaults: vi.fn(async () => []),
  } as unknown as VaultsServices;
}

function createMockChatServices(overrides: Partial<ChatServices> = {}) {
  const conversation = {
    id: 'cht_1',
    vaultId: 'vlt_1',
    documentId: 'doc_deleted',
    scope: 'document' as const,
    contextSnapshot: {
      type: 'document' as const,
      vaultId: 'vlt_1',
      documentId: 'doc_deleted',
      vaultName: 'Finance',
      documentName: 'Deleted source.pdf',
    },
    contextAvailability: { status: 'available' as const, readOnly: false as const },
    userId: 'usr_1',
    title: 'Deleted source chat',
    createdAt: '2026-05-05T10:00:00.000Z',
    updatedAt: '2026-05-05T10:05:00.000Z',
    messages: [
      {
        id: 'msg_1',
        conversationId: 'cht_1',
        vaultId: 'vlt_1',
        documentId: 'doc_deleted',
        scope: 'document' as const,
        userId: 'usr_1',
        role: 'user' as const,
        content: 'What is in this document?',
        metadata: null,
        citations: [],
        generationMetrics: null,
        generationStatus: null,
        generationError: null,
        createdAt: '2026-05-05T10:00:00.000Z',
        updatedAt: '2026-05-05T10:00:00.000Z',
      },
    ],
  };

  return {
    listConversations: vi.fn(async () => ({ conversations: [] })),
    createConversation: vi.fn(),
    updatePristineConversationContext: vi.fn(),
    getConversation: vi.fn(async () => conversation),
    deleteConversation: vi.fn(async () => true),
    getModelOptions: vi.fn(async () => ({ defaultModel: 'llama3.2', models: ['llama3.2'] })),
    createMessageStream: vi.fn(),
    ...overrides,
  } as unknown as ChatServices;
}

function createTestApp({
  db = createMockDb(),
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

describe('chat routes', () => {
  test('opens deleted-source conversations as read-only history', async () => {
    const { app } = createTestApp({ db: createMockDb([]) });

    const response = await app.request('/api/chats/cht_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      conversation: {
        id: 'cht_1',
        messages: [{ content: 'What is in this document?' }],
        contextAvailability: {
          status: 'source_document_deleted',
          readOnly: true,
          message: expect.stringContaining('read-only history'),
        },
      },
    });
  });

  test('still rejects new messages when the source document is deleted', async () => {
    const services = createMockChatServices();
    const { app } = createTestApp({ db: createMockDb([]), services });

    const response = await app.request('/api/chats/cht_1/messages/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({ content: 'Can we continue?' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'chat.not_found',
        message: 'Document not found',
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

  test('updates context for a pristine conversation', async () => {
    const services = createMockChatServices({
      updatePristineConversationContext: vi.fn(async () => ({
        status: 'updated' as const,
        conversation: {
          id: 'cht_1',
          vaultId: 'vlt_1',
          documentId: null,
          scope: 'vault' as const,
          contextSnapshot: { type: 'vault' as const, vaultId: 'vlt_1', vaultName: 'Finance' },
          userId: 'usr_1',
          title: 'Updated context',
          createdAt: '2026-05-05T10:00:00.000Z',
          updatedAt: '2026-05-05T10:10:00.000Z',
        },
      })),
    });
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/cht_1/context', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({ contextSnapshot: { type: 'vault', vaultId: 'vlt_1' } }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      conversation: {
        id: 'cht_1',
        contextSnapshot: { type: 'vault', vaultId: 'vlt_1', vaultName: 'Finance' },
      },
    });
    expect(services.updatePristineConversationContext).toHaveBeenCalledWith({
      userId: 'usr_1',
      chatId: 'cht_1',
      scope: { type: 'vault', vaultId: 'vlt_1', vaultName: 'Finance' },
    });
  });

  test('rejects context updates once a conversation has messages', async () => {
    const services = createMockChatServices({
      updatePristineConversationContext: vi.fn(async () => ({ status: 'not_pristine' as const })),
    });
    const { app } = createTestApp({ services });

    const response = await app.request('/api/chats/cht_1/context', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-test-user-id': 'usr_1' },
      body: JSON.stringify({ contextSnapshot: { type: 'vault', vaultId: 'vlt_1' } }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'chat.not_pristine',
        message: 'Conversation context can only be changed before the first message.',
      },
    });
  });
});
