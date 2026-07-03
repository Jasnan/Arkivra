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
    searchDocuments: vi.fn(async ({ vaultId, vaultIds, query, pageIndex, pageSize, tagId, tagIds, dateFrom, dateTo, sortBy, includeVersions }) => ({
      query,
      pageIndex,
      pageSize,
      resultsCount: 1,
      filters: {
        vaultId: vaultId ?? null,
        tagId: tagId ?? null,
        tagIds: tagIds ?? (tagId ? [tagId] : []),
        dateFrom: dateFrom?.toISOString() ?? null,
        dateTo: dateTo?.toISOString() ?? null,
        sortBy: sortBy ?? 'created_desc',
        includeVersions: includeVersions ?? 'latest',
      },
      results: [
        {
          vaultId: vaultId ?? vaultIds?.[0] ?? 'vlt_1',
          vaultName: 'Test Vault',
          documentId: 'doc_1',
          documentVersionId: 'dvr_1',
          versionNumber: 1,
          name: 'arkivra-e2e.pdf',
          originalName: 'arkivra-e2e.pdf',
          originalSize: 42000,
          mimeType: 'application/pdf',
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
            matchType: 'keyword',
          },
        },
      ],
      vaultId,
    })),
    searchHybrid: vi.fn(async ({ query, limit, mode }) => ({
      query,
      limit,
      mode: mode ?? 'hybrid',
      citations: [
        {
          chunkId: 'chk_1',
          documentId: 'doc_1',
          documentVersionId: 'dvr_1',
          versionNumber: 1,
          vaultId: 'vlt_1',
          vaultName: 'Test Vault',
          documentName: 'arkivra-e2e.pdf',
          pageStart: 1,
          pageEnd: 1,
          section: 'Overview',
          sectionPath: ['Overview'],
          sourceElementIds: ['el_chunk_1'],
          tableSourceElementIds: [],
          snippet: 'Arkivra search test content',
          boundingBoxes: [],
          citationPrecision: 'page',
          assetType: 'text',
          tablesHtml: [],
          imageAssetIds: [],
          imageAssets: [],
          score: 0.9,
        },
      ],
    })),
  } as unknown as DocumentSearchServices;
}

function createMockVaultsServices() {
  return {
    createVault: vi.fn(),
    getMember: vi.fn(async () => null),
    getVaultForUser: vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      isAdmin: false,
    })),
    listMembers: vi.fn(async () => []),
    listUserVaults: vi.fn(async () => []),
    removeMember: vi.fn(),
    hardDeleteVault: vi.fn(),
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
    context.set('userDisabled', false);
    context.set('canCreateVault', false);
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

  test('returns 403 when member lacks documents.read permission', async () => {
    const searchServices = createMockSearchServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: null,
      isAdmin: false,
    }));

    const app = createTestApp({ searchServices, vaultServices });
    const response = await app.request('/api/vaults/vlt_1/search?q=arkivra', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(403);
  });

  test('supports browse mode without a search query', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect((searchServices as any).searchDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      query: '',
      pageIndex: 0,
      pageSize: 20,
      tagId: undefined,
      tagIds: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: 'created_desc',
      includeVersions: 'latest',
    });
  });

  test('returns 400 for invalid pagination', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request(
      '/api/vaults/vlt_1/search?q=arkivra&pageIndex=-1&pageSize=500',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'search.invalid_page_index',
        message: 'pageIndex must be an integer >= 0',
      },
    });
  });

  test('returns 400 for invalid date filters', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search?q=arkivra&dateFrom=not-a-date', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'search.invalid_date_from',
        message: 'dateFrom must be a valid date',
      },
    });
  });

  test('returns hybrid citations for authenticated vault members', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search/hybrid', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({
        query: 'arkivra',
        limit: 5,
        mode: 'hybrid',
        documentVersionIds: ['dvr_1'],
      }),
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as any;
    expect(body.citations).toHaveLength(1);
    expect(body.citations[0].chunkId).toBe('chk_1');
    expect((searchServices as any).searchHybrid).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentVersionIds: ['dvr_1'],
      query: 'arkivra',
      limit: 5,
      mode: 'hybrid',
    });
  });

  test('returns 403 for hybrid search without the platform Use AI privilege', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search/hybrid', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
        'x-test-can-use-ai': 'false',
      },
      body: JSON.stringify({
        query: 'arkivra',
        limit: 5,
        mode: 'hybrid',
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'authorization.use_ai_required',
        message: 'Use AI privilege required',
      },
    });
    expect((searchServices as any).searchHybrid).not.toHaveBeenCalled();
  });

  test('returns 401 for unauthenticated hybrid search', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search/hybrid', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'arkivra' }),
    });

    expect(response.status).toBe(401);
  });

  test('returns 403 for hybrid search without vault access', async () => {
    const searchServices = createMockSearchServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => null);
    const app = createTestApp({ searchServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/search/hybrid', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ query: 'arkivra' }),
    });

    expect(response.status).toBe(403);
  });

  test('allows hybrid search for readable vaults with the platform Use AI privilege', async () => {
    const searchServices = createMockSearchServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'viewer',
      isAdmin: false,
    }));
    const app = createTestApp({ searchServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/search/hybrid', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ query: 'arkivra' }),
    });

    expect(response.status).toBe(200);
    expect((searchServices as any).searchHybrid).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentVersionIds: undefined,
      query: 'arkivra',
      limit: 10,
      mode: 'hybrid',
    });
  });

  test('returns 400 for invalid hybrid search payload', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search/hybrid', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({
        query: '',
        limit: 0,
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'search.invalid_query',
        message: 'query must be a non-empty string',
      },
    });
  });

  test('returns 400 for invalid hybrid document version ids', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search/hybrid', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({
        query: 'arkivra',
        documentVersionIds: ['dvr_1', 42],
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'search.invalid_document_version_ids',
        message: 'documentVersionIds must be an array of at most 100 strings',
      },
    });
  });

  test('returns 400 for oversized hybrid document version id lists', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request('/api/vaults/vlt_1/search/hybrid', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({
        query: 'arkivra',
        documentVersionIds: Array.from({ length: 101 }, (_, index) => `dvr_${index}`),
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'search.invalid_document_version_ids',
        message: 'documentVersionIds must be an array of at most 100 strings',
      },
    });
  });

  test('returns search results for authenticated vault members', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request(
      '/api/vaults/vlt_1/search?q=arkivra&pageIndex=1&pageSize=5',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as any;
    expect(body.resultsCount).toBe(1);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].documentId).toBe('doc_1');
    expect(body.results[0].bestChunk.snippet).toContain('<mark>Arkivra</mark>');
    expect((searchServices as any).searchDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      query: 'arkivra',
      pageIndex: 1,
      pageSize: 5,
      tagId: undefined,
      tagIds: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: 'created_desc',
      includeVersions: 'latest',
    });
  });

  test('enables hybrid document search when requested', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request(
      '/api/vaults/vlt_1/search?q=bills&searchMode=hybrid&pageSize=5',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    expect((searchServices as any).searchDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      query: 'bills',
      pageIndex: 0,
      pageSize: 5,
      tagId: undefined,
      tagIds: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: 'created_desc',
      searchMode: 'hybrid',
      includeVersions: 'latest',
    });
  });

  test('passes historical version mode to vault search services', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request(
      '/api/vaults/vlt_1/search?q=arkivra&includeVersions=historical',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    expect((searchServices as any).searchDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      query: 'arkivra',
      pageIndex: 0,
      pageSize: 20,
      tagId: undefined,
      tagIds: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: 'created_desc',
      includeVersions: 'historical',
    });
  });

  test('passes tag, date, and sort filters to search services', async () => {
    const searchServices = createMockSearchServices();
    const app = createTestApp({ searchServices });

    const response = await app.request(
      '/api/vaults/vlt_1/search?q=arkivra&tagIds=tag_1,tag_2&dateFrom=2026-04-01&dateTo=2026-04-30&sortBy=name_asc',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    expect((searchServices as any).searchDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      query: 'arkivra',
      pageIndex: 0,
      pageSize: 20,
      tagId: undefined,
      tagIds: ['tag_1', 'tag_2'],
      dateFrom: new Date('2026-04-01'),
      dateTo: new Date('2026-04-30T23:59:59.999Z'),
      sortBy: 'name_asc',
      includeVersions: 'latest',
    });
  });

  test('searches across accessible vaults on the global endpoint', async () => {
    const searchServices = createMockSearchServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).listUserVaults = vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Alpha',
        role: 'owner',
        isAdmin: false,
      },
      {
        id: 'vlt_2',
        name: 'Beta',
        role: 'viewer',
        isAdmin: false,
      },
    ]);

    const app = createTestApp({ searchServices, vaultServices });
    const response = await app.request('/api/search?q=arkivra', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect((searchServices as any).searchDocuments).toHaveBeenCalledWith({
      vaultIds: ['vlt_1', 'vlt_2'],
      vaultId: undefined,
      query: 'arkivra',
      pageIndex: 0,
      pageSize: 20,
      tagId: undefined,
      tagIds: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: 'created_desc',
      includeVersions: 'latest',
    });
  });

  test('passes hybrid mode through the global endpoint', async () => {
    const searchServices = createMockSearchServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).listUserVaults = vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Alpha',
        role: 'owner',
        isAdmin: false,
      },
    ]);

    const app = createTestApp({ searchServices, vaultServices });
    const response = await app.request('/api/search?q=bills&searchMode=hybrid', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect((searchServices as any).searchDocuments).toHaveBeenCalledWith({
      vaultIds: ['vlt_1'],
      vaultId: undefined,
      query: 'bills',
      pageIndex: 0,
      pageSize: 20,
      tagId: undefined,
      tagIds: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      sortBy: 'created_desc',
      searchMode: 'hybrid',
      includeVersions: 'latest',
    });
  });

  test('returns 403 for a forbidden vault on the global endpoint', async () => {
    const searchServices = createMockSearchServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).listUserVaults = vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Alpha',
        role: 'owner',
        isAdmin: false,
      },
    ]);

    const app = createTestApp({ searchServices, vaultServices });
    const response = await app.request('/api/search?q=arkivra&vaultId=vlt_2', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(403);
  });

  test('returns 403 for requested global vault filters when the user has no readable vaults', async () => {
    const searchServices = createMockSearchServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).listUserVaults = vi.fn(async () => []);

    const app = createTestApp({ searchServices, vaultServices });
    const singleResponse = await app.request('/api/search?q=arkivra&vaultId=vlt_forbidden', {
      headers: { 'x-test-user-id': 'usr_1' },
    });
    const multiResponse = await app.request('/api/search?q=arkivra&vaultIds=vlt_forbidden,vlt_other', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(singleResponse.status).toBe(403);
    expect(multiResponse.status).toBe(403);
    expect((searchServices as any).searchDocuments).not.toHaveBeenCalled();
  });
});
