import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { TagsServices } from './tags.types.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerTagRoutes } from './tags.routes.js';

function createMockTagsServices() {
  return {
    listTags: vi.fn(async () => [
      {
        id: 'tag_1',
        name: 'Important',
        color: '#FF0000',
        description: 'Flagged for follow-up',
        documentsCount: 2,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ]),
    createTag: vi.fn(async ({ name, color, description }) => ({
      id: 'tag_new',
      name,
      color,
      description,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    })),
    updateTag: vi.fn(async ({ tagId, name, color, description }) => ({
      id: tagId,
      name,
      color,
      description,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-02T00:00:00.000Z'),
    })),
    deleteTag: vi.fn(async () => ({ id: 'tag_1' })),
    listDocumentTags: vi.fn(async () => [
      {
        id: 'tag_1',
        name: 'Important',
        color: '#FF0000',
        description: 'Flagged for follow-up',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ]),
    assignTagToDocument: vi.fn(async () => ({
      success: true,
      tag: {
        id: 'tag_1',
        name: 'Important',
        color: '#FF0000',
        description: 'Flagged for follow-up',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    })),
    removeTagFromDocument: vi.fn(async () => ({ documentId: 'doc_1' })),
  } as unknown as TagsServices;
}

function createMockVaultsServices(role: 'owner' | 'member' = 'owner') {
  return {
    createVault: vi.fn(),
    getMember: vi.fn(async () => null),
    getVaultForUser: vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role,
    })),
    listMembers: vi.fn(async () => []),
    listUserVaults: vi.fn(async () => []),
    removeMember: vi.fn(),
    softDeleteVault: vi.fn(),
    updateVaultName: vi.fn(),
    upsertMember: vi.fn(),
  } as unknown as VaultsServices;
}

function createTestApp({
  tagsServices,
  vaultServices,
}: {
  tagsServices: TagsServices;
  vaultServices?: VaultsServices;
}) {
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

  const mockDb = {} as Database;
  const vs = vaultServices ?? createMockVaultsServices();

  registerVaultRoutes({ app, db: mockDb, services: vs });
  registerTagRoutes({ app, db: mockDb, services: tagsServices, vaultServices: vs });

  return app;
}

describe('tags integration', () => {
  test('lists global tags for an authenticated user', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/tags', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.tags).toHaveLength(1);
    expect(body.tags[0].id).toBe('tag_1');
    expect(body.tags[0].documentsCount).toBe(2);
    expect((tagsServices as any).listTags).toHaveBeenCalledWith({ vaultIds: [] });
  });

  test('creates a global tag', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/tags', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Important', color: '#FF0000', description: 'Flagged for follow-up' }),
    });

    expect(response.status).toBe(201);
    expect((tagsServices as any).createTag).toHaveBeenCalledWith({
      name: 'Important',
      color: '#FF0000',
      description: 'Flagged for follow-up',
    });
  });

  test('allows authenticated members to create global tags', async () => {
    const tagsServices = createMockTagsServices();
    const vaultServices = createMockVaultsServices('member');

    const app = createTestApp({ tagsServices, vaultServices });
    const response = await app.request('/api/tags', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Collaborative', color: '#00FF00', description: 'Shared work' }),
    });

    expect(response.status).toBe(201);
  });

  test('returns 400 for invalid tag color', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/tags', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Important', color: 'red' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'tag.invalid_color',
        message: 'Tag color must be a hex color like #A1B2C3',
      },
    });
  });

  test('updates a tag', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/tags/tag_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Urgent', color: '#00FF00', description: 'Needs action today' }),
    });

    expect(response.status).toBe(200);
    expect((tagsServices as any).updateTag).toHaveBeenCalledWith({
      tagId: 'tag_1',
      name: 'Urgent',
      color: '#00FF00',
      description: 'Needs action today',
    });
  });

  test('deletes a tag', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/tags/tag_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(204);
    expect((tagsServices as any).deleteTag).toHaveBeenCalledWith({
      tagId: 'tag_1',
    });
  });

  test('assigns a tag to a document', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/tags', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ tagId: 'tag_1' }),
    });

    expect(response.status).toBe(201);
    expect((tagsServices as any).assignTagToDocument).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      tagId: 'tag_1',
    });
  });

  test('lists tags assigned to a document', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/tags', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.tags).toHaveLength(1);
    expect((tagsServices as any).listDocumentTags).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
    });
  });

  test('removes a tag from a document', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/tags/tag_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(204);
    expect((tagsServices as any).removeTagFromDocument).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      tagId: 'tag_1',
    });
  });

  test('requires authentication to create a tag', async () => {
    const tagsServices = createMockTagsServices();
    const app = createTestApp({ tagsServices });

    const response = await app.request('/api/tags', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Blocked' }),
    });

    expect(response.status).toBe(401);
  });
});
