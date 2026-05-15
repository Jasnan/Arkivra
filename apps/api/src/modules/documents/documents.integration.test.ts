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
  const services = {
    uploadDocument: vi.fn(async ({ fileName, mimeType, vaultId }) => ({
      document: {
        id: 'doc_test_1',
        vaultId,
        name: fileName.normalize('NFC').trim(),
        originalName: fileName.normalize('NFC').trim(),
        originalSize: 100,
        mimeType,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      duplicate: false,
      existingId: null,
      duplicateScope: null,
    })),
    downloadDocument: vi.fn(async () => ({
      fileData: Buffer.from('file-content'),
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 12,
    })),
    renderDocumentPagePreview: vi.fn(async ({ pageNumber }) => ({
      fileData: Buffer.from(`png-page-${pageNumber}`),
      mimeType: 'image/png',
      etag: `"page-${pageNumber}"`,
      pageNumber,
    })),
    getChunkAsset: vi.fn(async () => ({
      assetType: 'image',
      mimeType: 'image/png',
      fileData: Buffer.from('asset-bytes'),
      sourceElementId: 'docling-image-1',
      byteSize: 11,
      etag: '"asset-1"',
    })),
    listDocuments: vi.fn(async () => [
      {
        id: 'doc_1',
        name: 'report.pdf',
        originalName: 'report.pdf',
        folderId: null,
        originalSize: 1024,
        mimeType: 'application/pdf',
        documentDate: null,
        language: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        isDeleted: false,
        deletedAt: null,
      },
    ]),
    getDocument: vi.fn(async () => ({
      id: 'doc_1',
      name: 'report.pdf',
      originalName: 'report.pdf',
      folderId: null,
      originalSize: 1024,
      originalSha256Hash: 'abc123',
      mimeType: 'application/pdf',
      content: '',
      documentDate: null,
      language: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      isDeleted: false,
      deletedAt: null,
      createdBy: 'Jane Doe',
    })),
    renameDocument: vi.fn(async ({ name }) => ({
      success: true,
      document: {
        id: 'doc_1',
        name,
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    })),
    moveDocument: vi.fn(async ({ folderId }) => ({
      success: true,
      document: {
        id: 'doc_1',
        folderId,
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    })),
    updateDocumentDate: vi.fn(async ({ documentDate }) => ({
      id: 'doc_1',
      documentDate,
      updatedAt: '2025-01-01T00:00:00.000Z',
    })),
    updateDocumentLanguage: vi.fn(async ({ language }) => ({
      id: 'doc_1',
      language,
      updatedAt: '2025-01-01T00:00:00.000Z',
    })),
    listDeletedDocuments: vi.fn(async () => [
      {
        id: 'doc_deleted_1',
        vaultId: 'vlt_1',
        vaultName: 'Vault One',
        name: 'trashed.pdf',
        originalName: 'trashed.pdf',
        originalSize: 1024,
        mimeType: 'application/pdf',
        documentDate: null,
        language: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-10T00:00:00.000Z',
        isDeleted: true,
        deletedAt: '2025-01-10T00:00:00.000Z',
      },
    ]),
    softDeleteDocument: vi.fn(async () => ({ id: 'doc_1' })),
    restoreDocument: vi.fn(async () => ({ success: true, id: 'doc_1' })),
    hardDeleteDocument: vi.fn(async () => ({ success: true, id: 'doc_1' })),
    updateDocumentProcessingStatus: vi.fn(async () => undefined),
  };

  return services as unknown as DocumentsServices;
}

function createMockDocumentQueue() {
  return {
    enqueueProcessDocument: vi.fn(async () => undefined),
  };
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
      permissions: [],
      isGlobalAdmin: false,
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
  documentQueue,
}: {
  docServices: DocumentsServices;
  vaultServices?: VaultsServices;
  documentQueue?: { enqueueProcessDocument: (args: any) => Promise<void> };
}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
    context.set('userDisabled', false);
    context.set('isGlobalAdmin', false);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultPermissions', []);

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
    documentQueue,
    retentionDays: 30,
    vaultServices: vs,
  });

  return app;
}

describe('documents integration', () => {
  test('returns 401 for unauthenticated document listing', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents');

    expect(response.status).toBe(401);
  });

  test('returns 403 when user has no vault access', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => null);

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/documents', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(403);
  });

  test('returns 403 when member lacks documents.create permission', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'member',
      permissions: ['documents.read'],
      isGlobalAdmin: false,
    }));

    const app = createTestApp({ docServices, vaultServices });
    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(403);
  });

  test('lists documents in vault for authenticated member', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].id).toBe('doc_1');
    expect(docServices.listDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      includeDeleted: false,
      tagId: undefined,
      sortBy: 'created_desc',
      folderId: undefined,
    });
  });

  test('lists deleted documents across accessible vaults', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).listUserVaults = vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Vault One',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'owner',
        permissions: [],
        isGlobalAdmin: false,
      },
      {
        id: 'vlt_2',
        name: 'Vault Two',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'member',
        permissions: ['documents.read'],
        isGlobalAdmin: false,
      },
    ]);

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/trash', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.documents).toHaveLength(1);
    expect(body.retentionDays).toBe(30);
    expect(docServices.listDeletedDocuments).toHaveBeenCalledWith({
      vaultIds: ['vlt_1', 'vlt_2'],
    });
  });

  test('filters deleted documents by requested accessible vault', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).listUserVaults = vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Vault One',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'owner',
        permissions: [],
        isGlobalAdmin: false,
      },
      {
        id: 'vlt_2',
        name: 'Vault Two',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'member',
        permissions: ['documents.read'],
        isGlobalAdmin: false,
      },
    ]);

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/trash?vaultId=vlt_2', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.listDeletedDocuments).toHaveBeenCalledWith({
      vaultIds: ['vlt_2'],
    });
  });

  test('filters documents by tag id', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents?tagId=tag_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.listDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      includeDeleted: false,
      tagId: 'tag_1',
      sortBy: 'created_desc',
      folderId: undefined,
    });
  });

  test('passes sort by to document listing', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents?sortBy=name_desc', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.listDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      includeDeleted: false,
      tagId: undefined,
      sortBy: 'name_desc',
      folderId: undefined,
    });
  });

  test('filters documents by root folder id sentinel', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents?folderId=root', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.listDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      includeDeleted: false,
      tagId: undefined,
      sortBy: 'created_desc',
      folderId: null,
    });
  });

  test('uploads a document', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.document.id).toBe('doc_test_1');
    expect(body.document.name).toBe('test.txt');
    expect(body.document.originalName).toBe('test.txt');
    expect(docServices.uploadDocument).toHaveBeenCalledTimes(1);
  });

  test('returns 409 for duplicate document upload', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).uploadDocument = vi.fn(async () => ({
      document: null,
      duplicate: true,
      existingId: 'doc_existing_1',
      duplicateScope: 'active',
    }));

    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.duplicate');
    expect(body.error.existingId).toBe('doc_existing_1');
    expect(body.error.duplicateScope).toBe('active');
  });

  test('returns 409 with trash-aware messaging for duplicate document upload in trash', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).uploadDocument = vi.fn(async () => ({
      document: null,
      duplicate: true,
      existingId: 'doc_existing_trashed_1',
      duplicateScope: 'trash',
    }));

    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.duplicate');
    expect(body.error.existingId).toBe('doc_existing_trashed_1');
    expect(body.error.duplicateScope).toBe('trash');
    expect(body.error.message).toContain('trash');
  });

  test('returns 400 for upload without multipart form data', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'test' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.invalid_upload');
  });

  test('gets document details', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.id).toBe('doc_1');
    expect(docServices.getDocument).toHaveBeenCalledWith({ documentId: 'doc_1', vaultId: 'vlt_1' });
  });

  test('returns 404 for non-existent document', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).getDocument = vi.fn(async () => null);

    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_missing', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.not_found');
  });

  test('downloads document file', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/download', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-disposition')).toContain('test.pdf');
    const body = await response.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe('file-content');
  });

  test('serves document file inline for previews', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/file', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('inline');
    expect(response.headers.get('content-disposition')).toContain('test.pdf');
    const body = await response.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe('file-content');
  });

  test('serves soft-deleted document file inline for trash previews', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_deleted_1/file?includeDeleted=true', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('inline');
    expect((docServices as any).downloadDocument).toHaveBeenCalledWith({
      documentId: 'doc_deleted_1',
      vaultId: 'vlt_1',
      includeDeleted: true,
    });
  });

  test('returns 404 when downloading non-existent document', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).downloadDocument = vi.fn(async () => null);

    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_missing/download', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(404);
  });

  test('serves cached page preview png for previews', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/page/2.png', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('etag')).toBe('"page-2"');
    expect(response.headers.get('cache-control')).toContain('private');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('png-page-2');
    expect((docServices as any).renderDocumentPagePreview).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      pageNumber: 2,
    });
  });

  test('serves cached page preview png for trash previews', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_deleted_1/page/2.png?includeDeleted=true', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect((docServices as any).renderDocumentPagePreview).toHaveBeenCalledWith({
      documentId: 'doc_deleted_1',
      vaultId: 'vlt_1',
      pageNumber: 2,
      includeDeleted: true,
    });
  });

  test('returns 304 for matching page preview etag', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/page/2.png', {
      headers: {
        'x-test-user-id': 'usr_1',
        'if-none-match': '"page-2"',
      },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"page-2"');
  });

  test('returns 400 for invalid page preview number', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/page/0.png', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'document.invalid_page_number',
        message: 'Page number must be an integer >= 1',
      },
    });
  });

  test('renames a document', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'new-name.pdf' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.name).toBe('new-name.pdf');
    expect(docServices.renameDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      name: 'new-name.pdf',
    });
  });

  test('updates document source language metadata', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: 'de' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.language).toEqual({
      code: 'de',
      name: 'German',
      confidence: null,
      source: 'user',
    });
    expect(docServices.updateDocumentLanguage).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      language: {
        code: 'de',
        name: 'German',
        confidence: null,
        source: 'user',
      },
    });
  });

  test('clears document source language metadata', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: null }),
    });

    expect(response.status).toBe(200);
    expect(docServices.updateDocumentLanguage).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      language: null,
    });
  });

  test('returns 400 for unsupported document source language', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: 'it' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.unsupported_language');
  });

  test('moves a document into a folder', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/move', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ folderId: 'fld_1' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.folderId).toBe('fld_1');
    expect(docServices.moveDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      folderId: 'fld_1',
    });
  });

  test('moves a document back to vault root', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/move', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ folderId: null }),
    });

    expect(response.status).toBe(200);
    expect(docServices.moveDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      folderId: null,
    });
  });

  test('returns 409 when moving a document into a folder with the same name', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).moveDocument = vi.fn(async () => ({
      success: false,
      reason: 'duplicate_name',
      existingId: 'doc_existing_1',
    }));
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/move', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ folderId: 'fld_1' }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.duplicate_name');
    expect(body.error.existingId).toBe('doc_existing_1');
  });

  test('queues source-file reprocessing for an existing document', async () => {
    const docServices = createMockDocumentsServices();
    const documentQueue = createMockDocumentQueue();
    const app = createTestApp({ docServices, documentQueue });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/reprocess', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      queued: true,
      documentId: 'doc_1',
      mode: 'source_file',
    });
    expect(docServices.getDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
    });
    expect(documentQueue.enqueueProcessDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      replaceExisting: true,
    });
    expect((docServices as any).updateDocumentProcessingStatus).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      processingStatus: 'queued',
    });
  });

  test('returns 503 when document reprocessing is unavailable', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/reprocess', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'document.reprocess_unavailable',
        message: 'Document reprocessing is not available in this environment',
      },
    });
  });

  test('returns 400 for empty rename', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '  ' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.invalid_name');
  });

  test('soft deletes a document', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(204);
    expect(docServices.softDeleteDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      deletedBy: 'usr_1',
    });
  });

  test('restores a soft-deleted document', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/restore', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.id).toBe('doc_1');
    expect(docServices.restoreDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
    });
  });

  test('returns 409 when restoring a document that duplicates an active document', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).restoreDocument = vi.fn(async () => ({
      success: false,
      reason: 'duplicate',
      existingId: 'doc_existing_1',
    }));

    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/restore', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.duplicate');
    expect(body.error.existingId).toBe('doc_existing_1');
  });

  test('hard deletes a soft-deleted document (owner)', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      permissions: [],
      isGlobalAdmin: false,
    }));

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/permanent', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_owner' },
    });

    expect(response.status).toBe(204);
    expect(docServices.hardDeleteDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
    });
  });

  test('forbids hard delete for member role', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'member',
      permissions: ['documents.read'],
      isGlobalAdmin: false,
    }));

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/permanent', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_member' },
    });

    expect(response.status).toBe(403);
  });
});
