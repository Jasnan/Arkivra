import type { Config } from '../config/config.js';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerUploadRoutes } from './uploads.routes.js';

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
    updateVaultIdentity: vi.fn(),
    upsertMember: vi.fn(),
  } as unknown as VaultsServices;
}

function createTestApp() {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
    context.set('userDisabled', false);
    context.set('isAdmin', false);
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

  const db = {} as Database;
  const vaultServices = createMockVaultsServices();
  const documentsServices = {
    updateDocumentVersionProcessingStatus: vi.fn(),
  } as unknown as DocumentsServices;
  const config = {
    uploads: {
      stagingPath: '/tmp/arkivra-test-uploads',
      partSizeBytes: 1024,
      maxFileSizeBytes: 1024 * 1024,
      sessionTtlHours: 24,
    },
  } as Config;

  registerVaultRoutes({ app, db, services: vaultServices });
  registerUploadRoutes({
    app,
    db,
    config,
    documentsServices,
  });

  return { app, documentsServices };
}

describe('upload routes', () => {
  test('returns structured errors for malformed upload init JSON', async () => {
    const { app, documentsServices } = createTestApp();

    const response = await app.request('/api/vaults/vlt_1/uploads/init', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: '{',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'upload.invalid_payload',
        message: 'fileName and totalSize are required',
      },
    });
    expect(documentsServices.updateDocumentVersionProcessingStatus).not.toHaveBeenCalled();
  });
});
