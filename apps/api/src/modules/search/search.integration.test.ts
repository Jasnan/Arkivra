import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { DocumentSearchServices } from './search.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerSearchRoutes } from './search.routes.js';

function createMockSearchServices() {
  return {
    name: 'test-search',
    searchDocuments: vi.fn(async ({ vaultId, query, pageIndex, pageSize }) => ({
      query,
      pageIndex,
      pageSize,
      resultsCount: 1,
      results: [
        {
          documentId: 'doc_1',
          name: 'arkivra-e2e.pdf',
          originalName: 'arkivra-e2e.pdf',
          mimeType: 'application/pdf',
          documentDate: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          matchedChunksCount: 1,
          bestChunk: {
            chunkIndex: 0,
            chunkType: 'heading',
            pageNumber: 1,
            content: 'Arkivra search test content',
            snippet: '<mark>Arkivra</mark> search test content',
            score: 0.75,
          },
        },
      ],
      vaultId,
    })),
  } as unknown as DocumentSearchServices;
}

function createMockVaultsServices() {
  return {
    createVault: vi.fn(),
    getMember: vi.fn(async () => null),
    getVaultForUser: vi.fn(async () => ({ id: 'vlt_1', name: 'Test', role: 'owner' })),
    listMembers: vi.fn(async () => []),
    listUserVaults: vi.fn(async () => []),
    removeMember: vi.fn(),
    softDeleteVault: vi.fn(),
    updateVaultName: vi.fn(),
    upsertMember: vi.fn(),
  } as unknown as VaultsServices;
}

function createTestApp({
  searchServices,
  vaultServices,
}: {
  searchServices: DocumentSearchServices;
  vaultServices?: VaultsServices;
}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
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
  registerSearchRoutes({ app, db: mockDb, services: searchServices, vaultServices: vs });

  return app;
}

describe('search integration', () => {
  test('returns 401 for unauthenticated search', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search?q=arkivra');

    expect(response.status).toBe(401);
  });

  test('returns 403 when user has no vault access', async () => {
    const searchServices = createMockSearchServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => null);
    const app = createTestApp({ searchServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/search?q=arkivra', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(403);
  });

  test('returns 400 for missing search query', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'search.invalid_query',
        message: 'Search query is required',
      },
    });
  });

  test('returns 400 for invalid pagination', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search?q=arkivra&pageIndex=-1&pageSize=500', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'search.invalid_page_index',
        message: 'pageIndex must be an integer >= 0',
      },
    });
  });

  test('returns search results for authenticated vault members', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search?q=arkivra&pageIndex=1&pageSize=5', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);

    const body = await response.json() as any;
    expect(body.resultsCount).toBe(1);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].documentId).toBe('doc_1');
    expect(body.results[0].bestChunk.snippet).toContain('<mark>Arkivra</mark>');
    expect((searchServices as any).searchDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      query: 'arkivra',
      pageIndex: 1,
      pageSize: 5,
    });
  });
});
