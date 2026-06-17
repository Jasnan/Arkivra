import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ServerContext } from '../server/server.types.js';
import type { DocumentsServices } from './documents.services.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerDocumentRoutes } from './documents.routes.js';

function createMockDocumentsServices() {
  return {
    downloadDocument: vi.fn(),
    finalizeUploadedDocument: vi.fn(),
    getDocument: vi.fn(),
    getChunkAsset: vi.fn(async () => ({
      assetType: 'table',
      mimeType: 'text/html; charset=utf-8',
      inlinePayload: '<table><tr><td>42</td></tr></table>',
      sourceElementId: 'docling-table-1',
      byteSize: 35,
      etag: '"asset-table"',
    })),
    hardDeleteDocument: vi.fn(),
    listDeletedDocuments: vi.fn(async () => []),
    listDocuments: vi.fn(async () => []),
    renameDocument: vi.fn(),
    renderDocumentPagePreview: vi.fn(),
    restoreDocument: vi.fn(),
    softDeleteDocument: vi.fn(),
    updateDocumentProcessingStatus: vi.fn(),
    uploadDocument: vi.fn(),
  } as unknown as DocumentsServices;
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
    })),
    listMembers: vi.fn(async () => []),
    listUserVaults: vi.fn(async () => []),
    removeMember: vi.fn(),
    softDeleteVault: vi.fn(),
    updateVaultIdentity: vi.fn(),
    upsertMember: vi.fn(),
  } as unknown as VaultsServices;
}

function createTestApp({
  docServices,
  vaultServices,
}: {
  docServices: DocumentsServices;
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
  registerDocumentRoutes({
    app,
    db: mockDb,
    storage: {} as StorageDriver,
    encryption: {} as EncryptionServices,
    services: docServices,
    retentionDays: 30,
    vaultServices: vs,
  });

  return app;
}

describe('chunk asset routes', () => {
  test('returns 401 for unauthenticated asset requests', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/chunks/chk_1/assets/cas_1');

    expect(response.status).toBe(401);
  });

  test('returns inline HTML for table assets', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/chunks/chk_1/assets/cas_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('etag')).toBe('"asset-table"');
    expect(response.headers.get('x-arkivra-source-element-id')).toBe('docling-table-1');
    expect(response.headers.get('cache-control')).toContain('private');
    expect(await response.text()).toContain('<table>');
    expect((docServices as any).getChunkAsset).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      chunkId: 'chk_1',
      assetId: 'cas_1',
    });
  });

  test('returns binary chunk asset payloads', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).getChunkAsset = vi.fn(async () => ({
      assetType: 'image',
      mimeType: 'image/png',
      fileData: Buffer.from('png-bytes'),
      sourceElementId: 'docling-image-1',
      byteSize: 9,
      etag: '"asset-image"',
    }));
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/chunks/chk_1/assets/cas_2', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-arkivra-source-element-id')).toBe('docling-image-1');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('png-bytes');
  });

  test('returns 304 for matching asset etag', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/chunks/chk_1/assets/cas_1', {
      headers: {
        'x-test-user-id': 'usr_1',
        'if-none-match': '"asset-table"',
      },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"asset-table"');
    expect(response.headers.get('x-arkivra-source-element-id')).toBe('docling-table-1');
  });

  test('returns 404 for unknown chunk assets', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).getChunkAsset = vi.fn(async () => null);
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/chunks/chk_missing/assets/cas_missing', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: 'chunk_asset.not_found',
        message: 'Chunk asset not found',
      },
    });
  });
});
