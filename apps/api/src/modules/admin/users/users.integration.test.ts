import type { ServerContext } from '../../server/server.types.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerAdminUserRoutes } from './users.routes.js';

function createMockAuthorizationServices() {
  return {
    countActiveGlobalAdmins: vi.fn(async () => 1),
    ensureBootstrapGlobalAdmin: vi.fn(async () => false),
    getUserAuthorizationState: vi.fn(async () => null),
    getUserWithRoles: vi.fn(async () => null),
    grantGlobalAdmin: vi.fn(async ({ userId }) => ({
      id: userId,
      globalRoles: ['global_admin'],
      isGlobalAdmin: true,
      canCreateVault: true,
    })),
    grantVaultCreator: vi.fn(async ({ userId }) => ({
      id: userId,
      globalRoles: ['vault_creator'],
      isGlobalAdmin: false,
      canCreateVault: true,
    })),
    listGlobalRolesForUser: vi.fn(async () => []),
    listUsers: vi.fn(async () => [
      {
        id: 'usr_1',
        email: 'owner@example.com',
        name: 'Owner',
        emailVerified: true,
        twoFactorEnabled: false,
        disabledAt: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        globalRoles: ['global_admin'],
        isGlobalAdmin: true,
        canCreateVault: true,
      },
    ]),
    revokeGlobalAdmin: vi.fn(async ({ userId }) => ({
      id: userId,
      globalRoles: [],
      isGlobalAdmin: false,
      canCreateVault: false,
    })),
    revokeVaultCreator: vi.fn(async ({ userId }) => ({
      id: userId,
      globalRoles: [],
      isGlobalAdmin: false,
      canCreateVault: false,
    })),
    setUserDisabled: vi.fn(async ({ userId, disabled }) => ({
      id: userId,
      disabledAt: disabled ? new Date('2025-01-02T00:00:00.000Z') : null,
      globalRoles: [],
      isGlobalAdmin: false,
      canCreateVault: false,
    })),
  };
}

function createTestApp({
  isAuthenticated = true,
  isGlobalAdmin = true,
  authorizationServices = createMockAuthorizationServices(),
}: {
  isAuthenticated?: boolean;
  isGlobalAdmin?: boolean;
  authorizationServices?: ReturnType<typeof createMockAuthorizationServices>;
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
    context.set('isGlobalAdmin', isGlobalAdmin);
    context.set('canCreateVault', false);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultPermissions', []);
    await next();
  });

  registerAdminUserRoutes({
    app,
    authorizationServices: authorizationServices as any,
  });

  return { app, authorizationServices };
}

describe('admin users routes integration', () => {
  test('returns 401 when unauthenticated', async () => {
    const { app } = createTestApp({ isAuthenticated: false });
    const response = await app.request('/api/admin/users');
    expect(response.status).toBe(401);
  });

  test('returns 403 when authenticated user is not a global admin', async () => {
    const { app } = createTestApp({ isGlobalAdmin: false });
    const response = await app.request('/api/admin/users');
    expect(response.status).toBe(403);
  });

  test('lists users for global admin', async () => {
    const { app } = createTestApp({});
    const response = await app.request('/api/admin/users');
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe('usr_1');
  });

  test('validates disable payload', async () => {
    const { app } = createTestApp({});
    const response = await app.request('/api/admin/users/usr_2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: 'yes' }),
    });
    expect(response.status).toBe(400);
  });

  test('maps last global admin guard to 409', async () => {
    const authorizationServices = createMockAuthorizationServices();
    authorizationServices.setUserDisabled = vi.fn(async () => {
      throw new Error('authorization.last_global_admin');
    });

    const { app } = createTestApp({ authorizationServices });
    const response = await app.request('/api/admin/users/usr_1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });

    expect(response.status).toBe(409);
  });

  test('grants and revokes global admin role', async () => {
    const { app, authorizationServices } = createTestApp({});

    const grantResponse = await app.request('/api/admin/users/usr_2/global-admin', {
      method: 'POST',
    });
    expect(grantResponse.status).toBe(200);
    expect(authorizationServices.grantGlobalAdmin).toHaveBeenCalledWith({ userId: 'usr_2' });

    const revokeResponse = await app.request('/api/admin/users/usr_2/global-admin', {
      method: 'DELETE',
    });
    expect(revokeResponse.status).toBe(200);
    expect(authorizationServices.revokeGlobalAdmin).toHaveBeenCalledWith({ userId: 'usr_2' });
  });

  test('grants and revokes vault creator role', async () => {
    const { app, authorizationServices } = createTestApp({});

    const grantResponse = await app.request('/api/admin/users/usr_2/vault-creator', {
      method: 'POST',
    });
    expect(grantResponse.status).toBe(200);
    expect(authorizationServices.grantVaultCreator).toHaveBeenCalledWith({ userId: 'usr_2' });

    const revokeResponse = await app.request('/api/admin/users/usr_2/vault-creator', {
      method: 'DELETE',
    });
    expect(revokeResponse.status).toBe(200);
    expect(authorizationServices.revokeVaultCreator).toHaveBeenCalledWith({ userId: 'usr_2' });
  });
});
