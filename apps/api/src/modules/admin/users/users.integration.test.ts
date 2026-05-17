import type { ServerContext } from '../../server/server.types.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerAdminUserRoutes } from './users.routes.js';

function createMockAuthorizationServices() {
  return {
    getUserAuthorizationState: vi.fn(async () => null),
    grantRoot: vi.fn(async ({ userId }) => ({
      id: userId,
      systemRole: 'root',
      isRoot: true,
      canCreateVault: true,
    })),
    grantSystemCapability: vi.fn(async ({ userId, capability }) => ({
      id: userId,
      systemCapabilities: [capability],
      isRoot: false,
      canCreateVault: true,
    })),
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
        canCreateVault: true,
      },
    ]),
    revokeRoot: vi.fn(async ({ userId }) => ({
      id: userId,
      systemRole: 'member',
      isRoot: false,
      canCreateVault: false,
    })),
    revokeSystemCapability: vi.fn(async ({ userId }) => ({
      id: userId,
      systemCapabilities: [],
      isRoot: false,
      canCreateVault: false,
    })),
    setUserDisabled: vi.fn(async ({ userId, disabled }) => ({
      id: userId,
      disabledAt: disabled ? new Date('2025-01-02T00:00:00.000Z') : null,
      canCreateVault: false,
    })),
  };
}

function createTestApp({
  isAuthenticated = true,
  isRoot = true,
  authorizationServices = createMockAuthorizationServices(),
}: {
  isAuthenticated?: boolean;
  isRoot?: boolean;
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
    context.set('systemRole', isRoot ? 'root' : 'member');
    context.set('systemCapabilities', []);
    context.set('isRoot', isRoot);
    context.set('canCreateVault', false);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultAiAccessLevel', 'none');
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

  test('returns 403 when authenticated user is not a root', async () => {
    const { app } = createTestApp({ isRoot: false });
    const response = await app.request('/api/admin/users');
    expect(response.status).toBe(403);
  });

  test('lists users for root', async () => {
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

  test('maps last root guard to 409', async () => {
    const authorizationServices = createMockAuthorizationServices();
    authorizationServices.setUserDisabled = vi.fn(async () => {
      throw new Error('authorization.last_root');
    });

    const { app } = createTestApp({ authorizationServices });
    const response = await app.request('/api/admin/users/usr_1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    });

    expect(response.status).toBe(409);
  });

  test('grants and revokes root role', async () => {
    const { app, authorizationServices } = createTestApp({});

    const grantResponse = await app.request('/api/admin/users/usr_2/root', {
      method: 'POST',
    });
    expect(grantResponse.status).toBe(200);
    expect(authorizationServices.grantRoot).toHaveBeenCalledWith({ userId: 'usr_2' });

    const revokeResponse = await app.request('/api/admin/users/usr_2/root', {
      method: 'DELETE',
    });
    expect(revokeResponse.status).toBe(200);
    expect(authorizationServices.revokeRoot).toHaveBeenCalledWith({ userId: 'usr_2' });
  });

  test('grants and revokes system create-vault capability', async () => {
    const { app, authorizationServices } = createTestApp({});

    const grantResponse = await app.request('/api/admin/users/usr_2/system-capabilities/system.create_vaults', {
      method: 'POST',
    });
    expect(grantResponse.status).toBe(200);
    expect(authorizationServices.grantSystemCapability).toHaveBeenCalledWith({
      userId: 'usr_2',
      capability: 'system.create_vaults',
      createdBy: 'usr_test',
    });

    const revokeResponse = await app.request('/api/admin/users/usr_2/system-capabilities/system.create_vaults', {
      method: 'DELETE',
    });
    expect(revokeResponse.status).toBe(200);
    expect(authorizationServices.revokeSystemCapability).toHaveBeenCalledWith({
      userId: 'usr_2',
      capability: 'system.create_vaults',
    });
  });
});
