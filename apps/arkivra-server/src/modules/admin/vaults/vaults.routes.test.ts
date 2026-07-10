import type { Database } from '../../database/database.js';
import type { ServerContext } from '../../server/server.types.js';
import type { VaultsServices } from '../../vaults/vaults.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerAdminVaultRoutes } from './vaults.routes.js';

function createMockVaultsServices() {
  return {
    createVault: vi.fn(),
    getMember: vi.fn(),
    getVaultForUser: vi.fn(),
    listAllVaults: vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Admin View Vault',
        ownerUserId: 'usr_owner',
        ownerEmail: 'owner@example.com',
      },
    ]),
    listMembers: vi.fn(),
    listUserVaults: vi.fn(),
    removeMember: vi.fn(),
    hardDeleteVault: vi.fn(),
    updateVaultName: vi.fn(),
    upsertMember: vi.fn(),
  } as unknown as VaultsServices;
}

function createTestApp({
  isAuthenticated = true,
  isAdmin = true,
  services = createMockVaultsServices(),
}: {
  isAuthenticated?: boolean;
  isAdmin?: boolean;
  services?: VaultsServices;
}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', isAuthenticated ? 'usr_test' : null);
    context.set(
      'session',
      isAuthenticated
        ? {
            id: 'ses_test',
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: 'usr_test',
            expiresAt: new Date(Date.now() + 3600_000),
            token: 'tok_test',
          }
        : null,
    );
    context.set('userDisabled', false);
    context.set('isAdmin', isAdmin);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    await next();
  });

  registerAdminVaultRoutes({
    app,
    db: {} as Database,
    services,
  });

  return { app, services };
}

describe('admin vault routes', () => {
  test('returns 401 when unauthenticated', async () => {
    const { app } = createTestApp({ isAuthenticated: false });
    const response = await app.request('/api/admin/vaults');
    expect(response.status).toBe(401);
  });

  test('returns 403 when caller is not an admin', async () => {
    const { app } = createTestApp({ isAdmin: false });
    const response = await app.request('/api/admin/vaults');
    expect(response.status).toBe(403);
  });

  test('lists vaults for admin', async () => {
    const { app, services } = createTestApp({});
    const response = await app.request('/api/admin/vaults');

    expect(response.status).toBe(200);
    expect(services.listAllVaults).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as any;
    expect(body.vaults).toHaveLength(1);
    expect(body.vaults[0].id).toBe('vlt_1');
  });
});
