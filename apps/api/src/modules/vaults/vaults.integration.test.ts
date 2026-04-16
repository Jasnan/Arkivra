import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from './vaults.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerVaultRoutes } from './vaults.routes.js';

function createMockVaultsServices() {
  const services = {
    createVault: vi.fn(async ({ name, userId }) => ({
      id: 'vlt_test_1',
      name,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      permissions: [],
      isGlobalAdmin: false,
      userId,
    })),
    getMember: vi.fn(async () => null),
    getVaultForUser: vi.fn(async () => null),
    listMembers: vi.fn(async () => []),
    listUserVaults: vi.fn(async () => []),
    removeMember: vi.fn(async () => ({ userId: 'usr_member_1' })),
    softDeleteVault: vi.fn(async () => ({ id: 'vlt_test_1' })),
    updateVaultName: vi.fn(async ({ name }) => ({ id: 'vlt_test_1', name })),
    upsertMember: vi.fn(async ({ role, userId }) => ({ role, userId })),
  };

  return services as unknown as VaultsServices;
}

function createTestApp({
  services,
  canCreateVault = true,
}: {
  services: VaultsServices;
  canCreateVault?: boolean;
}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
    context.set('userDisabled', false);
    context.set('isGlobalAdmin', false);
    context.set('canCreateVault', canCreateVault);
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

  registerVaultRoutes({
    app,
    db: {} as Database,
    services,
  });

  return app;
}

describe('vaults integration', () => {
  test('returns 401 for unauthenticated vault listing', async () => {
    const services = createMockVaultsServices();
    const app = createTestApp({ services });

    const response = await app.request('/api/vaults');

    expect(response.status).toBe(401);
  });

  test('lists vaults for authenticated user', async () => {
    const services = createMockVaultsServices();
    (services as any).listUserVaults = vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Personal Vault',
        role: 'owner',
      },
    ]);

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(services.listUserVaults).toHaveBeenCalledWith({ userId: 'usr_1' });
    expect(await response.json()).toEqual({
      vaults: [
        {
          id: 'vlt_1',
          name: 'Personal Vault',
          role: 'owner',
        },
      ],
    });
  });

  test('creates vault for authenticated user', async () => {
    const services = createMockVaultsServices();
    const app = createTestApp({ services });

    const response = await app.request('/api/vaults', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ name: 'Finance' }),
    });

    expect(response.status).toBe(201);
    expect(services.createVault).toHaveBeenCalledWith({
      userId: 'usr_1',
      name: 'Finance',
    });
  });

  test('forbids vault creation when user lacks vault creation permission', async () => {
    const services = createMockVaultsServices();
    const app = createTestApp({ services, canCreateVault: false });

    const response = await app.request('/api/vaults', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ name: 'Finance' }),
    });

    expect(response.status).toBe(403);
    expect(services.createVault).not.toHaveBeenCalled();
  });

  test('forbids vault detail access when user is not a member', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => null);

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(403);
  });

  test('returns vault detail for member', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      permissions: [],
      isGlobalAdmin: false,
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.vault.id).toBe('vlt_1');
    expect(body.vault.name).toBe('Team Vault');
    expect(body.vault.role).toBe('owner');
  });

  test('blocks member from adding vault members', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'member',
      permissions: ['documents.read'],
      isGlobalAdmin: false,
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/members', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ userId: 'usr_2', role: 'member', permissions: ['documents.read'] }),
    });

    expect(response.status).toBe(403);
  });

  test('allows owner to add vault members', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      permissions: [],
      isGlobalAdmin: false,
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/members', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_owner',
      },
      body: JSON.stringify({
        userId: 'usr_2',
        role: 'member',
        permissions: ['documents.read', 'documents.create'],
      }),
    });

    expect(response.status).toBe(201);
    expect(services.upsertMember).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      userId: 'usr_2',
      role: 'member',
      permissions: ['documents.read', 'documents.create'],
    });
  });

  test('allows member with members.manage permission to add vault members', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'member',
      permissions: ['members.manage'],
      isGlobalAdmin: false,
    }));

    const app = createTestApp({ services });
    const response = await app.request('/api/vaults/vlt_1/members', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_member',
      },
      body: JSON.stringify({ userId: 'usr_3', role: 'member', permissions: ['documents.read'] }),
    });

    expect(response.status).toBe(201);
  });

  test('transfers ownership to another member', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      permissions: [],
      isGlobalAdmin: false,
    }));

    const app = createTestApp({ services });
    const response = await app.request('/api/vaults/vlt_1/ownership', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_owner',
      },
      body: JSON.stringify({ userId: 'usr_2' }),
    });

    expect(response.status).toBe(200);
    expect(services.upsertMember).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      userId: 'usr_2',
      role: 'owner',
    });
  });
});
