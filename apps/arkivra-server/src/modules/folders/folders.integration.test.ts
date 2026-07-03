import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { FoldersServices } from './folders.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerFolderRoutes } from './folders.routes.js';

function createMockFolder(
  id: string,
  name: string,
  parentId: string | null = null,
  createdBy = 'usr_1',
) {
  return {
    id,
    vaultId: 'vlt_1',
    parentId,
    name,
    createdBy,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}

function createMockFoldersServices() {
  const rootFolder = createMockFolder('fld_finance', 'Finance');
  const childFolder = createMockFolder('fld_tax', 'Tax', 'fld_finance');
  const document = {
    id: 'doc_1',
    name: 'Report',
    originalName: 'report.pdf',
    folderId: null,
    originalSize: 1024,
    mimeType: 'application/pdf',
    processingStatus: 'completed',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    isDeleted: false,
    deletedAt: null,
  };
  const nestedDocument = {
    id: 'doc_2',
    name: 'Tax Return',
    originalName: 'tax-return.pdf',
    folderId: 'fld_tax',
    originalSize: 2048,
    mimeType: 'application/pdf',
    processingStatus: 'completed',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    isDeleted: false,
    deletedAt: null,
  };

  return {
    listActiveFoldersForVault: vi.fn(async () => [rootFolder, childFolder]),
    listActiveDocumentsForVault: vi.fn(async () => [document, nestedDocument]),
    listFolderItems: vi.fn(async () => ({
      success: true,
      folder: null,
      breadcrumbs: [],
      folders: [rootFolder],
      documents: [document],
      items: [
        { type: 'folder', folder: rootFolder },
        { type: 'document', document },
      ],
    })),
    createFolder: vi.fn(async ({ name, parentId, createdBy }) => ({
      success: true,
      folder: createMockFolder('fld_new', name.trim(), parentId, createdBy),
    })),
    getFolderAncestors: vi.fn(async () => [rootFolder, childFolder]),
    renameFolder: vi.fn(async ({ name }) => ({
      success: true,
      folder: createMockFolder('fld_finance', name.trim()),
    })),
    moveFolder: vi.fn(async ({ parentId }) => ({
      success: true,
      folder: createMockFolder('fld_tax', 'Tax', parentId),
    })),
    softDeleteFolder: vi.fn(async () => ({
      success: true,
      folder: { id: 'fld_tax' },
    })),
    restoreFolder: vi.fn(async () => ({
      success: true,
      folder: { id: 'fld_tax' },
    })),
  } as unknown as FoldersServices;
}

function createMockVaultsServices({
  role = 'owner',
  permissions = [],
}: {
  role?: 'owner' | 'editor' | 'viewer';
  permissions?: string[];
} = {}) {
  return {
    createVault: vi.fn(),
    getMember: vi.fn(async () => null),
    getVaultForUser: vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role,
      permissions,
      isAdmin: false,
    })),
    listMembers: vi.fn(async () => []),
    listUserVaults: vi.fn(async () => []),
    removeMember: vi.fn(),
    hardDeleteVault: vi.fn(),
    updateVaultIdentity: vi.fn(),
    upsertMember: vi.fn(),
  } as unknown as VaultsServices;
}

function createTestApp({
  folderServices,
  vaultServices,
}: {
  folderServices: FoldersServices;
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
  registerFolderRoutes({ app, db: mockDb, services: folderServices });

  return app;
}

describe('folders integration', () => {
  test('returns 401 for unauthenticated folder item listing', async () => {
    const folderServices = createMockFoldersServices();
    const app = createTestApp({ folderServices });

    const response = await app.request('/api/vaults/vlt_1/folders/items');

    expect(response.status).toBe(401);
  });

  test('lists root folder items for a readable vault', async () => {
    const folderServices = createMockFoldersServices();
    const vaultServices = createMockVaultsServices({
      role: 'viewer',
    });
    const app = createTestApp({ folderServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/folders/items?folderId=root', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.items).toHaveLength(2);
    expect(folderServices.listFolderItems).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      folderId: null,
    });
  });

  test('lists folder tree entries with active documents for a readable vault', async () => {
    const folderServices = createMockFoldersServices();
    const vaultServices = createMockVaultsServices({
      role: 'editor',
    });
    const app = createTestApp({ folderServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/folders/tree', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.folders).toEqual([
      { id: 'fld_finance', parentId: null, name: 'Finance', path: 'Finance', depth: 0 },
      { id: 'fld_tax', parentId: 'fld_finance', name: 'Tax', path: 'Finance/Tax', depth: 1 },
    ]);
    expect(body.documents).toEqual([
      expect.objectContaining({
        id: 'doc_2',
        folderId: 'fld_tax',
        name: 'Tax Return',
        path: 'Finance/Tax/Tax Return',
        depth: 2,
      }),
      expect.objectContaining({
        id: 'doc_1',
        folderId: null,
        name: 'Report',
        path: 'Report',
        depth: 0,
      }),
    ]);
    expect(folderServices.listActiveFoldersForVault).toHaveBeenCalledWith({ vaultId: 'vlt_1' });
    expect(folderServices.listActiveDocumentsForVault).toHaveBeenCalledWith({ vaultId: 'vlt_1' });
  });

  test('creates a folder under the vault root', async () => {
    const folderServices = createMockFoldersServices();
    const vaultServices = createMockVaultsServices({
      role: 'editor',
    });
    const app = createTestApp({ folderServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/folders', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Finance', parentId: null }),
    });

    expect(response.status).toBe(201);
    expect(folderServices.createFolder).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      parentId: null,
      name: 'Finance',
      createdBy: 'usr_1',
    });
  });

  test('forbids folder creation without documents.create permission', async () => {
    const folderServices = createMockFoldersServices();
    const vaultServices = createMockVaultsServices({
      role: 'viewer',
    });
    const app = createTestApp({ folderServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/folders', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Finance' }),
    });

    expect(response.status).toBe(403);
  });

  test('returns folder breadcrumbs', async () => {
    const folderServices = createMockFoldersServices();
    const app = createTestApp({ folderServices });

    const response = await app.request('/api/vaults/vlt_1/folders/fld_tax/breadcrumbs', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.breadcrumbs.map((folder: any) => folder.id)).toEqual(['fld_finance', 'fld_tax']);
  });

  test('returns 409 for duplicate folder rename', async () => {
    const folderServices = createMockFoldersServices();
    (folderServices as any).renameFolder = vi.fn(async () => ({
      success: false,
      reason: 'duplicate_name',
    }));
    const app = createTestApp({ folderServices });

    const response = await app.request('/api/vaults/vlt_1/folders/fld_tax', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Finance' }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('folder.duplicate_name');
  });

  test('returns 400 for folder moves that would create a cycle', async () => {
    const folderServices = createMockFoldersServices();
    (folderServices as any).moveFolder = vi.fn(async () => ({
      success: false,
      reason: 'cycle_detected',
    }));
    const app = createTestApp({ folderServices });

    const response = await app.request('/api/vaults/vlt_1/folders/fld_finance/move', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ parentId: 'fld_tax' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('folder.cycle_detected');
  });

  test('trashes a folder with documents.delete permission', async () => {
    const folderServices = createMockFoldersServices();
    const vaultServices = createMockVaultsServices({
      role: 'editor',
    });
    const app = createTestApp({ folderServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/folders/fld_tax', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(204);
    expect(folderServices.softDeleteFolder).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      folderId: 'fld_tax',
      deletedBy: 'usr_1',
    });
  });

  test('restores a folder with documents.delete permission', async () => {
    const folderServices = createMockFoldersServices();
    const vaultServices = createMockVaultsServices({
      role: 'editor',
    });
    const app = createTestApp({ folderServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/folders/fld_tax/restore', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(folderServices.restoreFolder).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      folderId: 'fld_tax',
    });
  });
});
