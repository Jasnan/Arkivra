import type { Auth } from './auth.services.js';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { describe, expect, test, vi } from 'vitest';
import { parseConfig } from '../config/config.js';
import { createServer } from '../server/server.js';

function createMockAuth() {
  const hash = vi.fn(async (password: string) => `hashed:${password}`);
  const handler = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

  const getSession = vi.fn(async () => null as unknown);

  const auth = {
    $context: Promise.resolve({
      appName: 'Arkivra',
      password: {
        config: {
          maxPasswordLength: 128,
          minPasswordLength: 8,
        },
        hash,
      },
      secretConfig: 'test-secret',
    }),
    handler,
    api: {
      getSession,
    },
  } as unknown as Auth;

  return { auth, handler, getSession, hash };
}

const mockDb = {} as Database;
function createMockDbWithAccounts(accounts: Array<{ password: string | null; providerId: string }>) {
  return {
    select: (selection?: unknown) => ({
      from: () => ({
        where: vi.fn(() => {
          if (selection === undefined) {
            return Promise.resolve(accounts);
          }

          return {
            limit: vi.fn(async () => []),
          };
        }),
      }),
    }),
  } as unknown as Database;
}

function createMockSensitiveActionDb(accounts: Array<{ id: string; password: string | null; providerId: string; userId: string }>) {
  const insertValues = vi.fn(async () => undefined);
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));

  return {
    db: {
      insert: vi.fn(() => ({
        values: insertValues,
      })),
      select: (selection?: unknown) => ({
        from: () => ({
          where: vi.fn(() => {
            if (selection === undefined) {
              return Promise.resolve(accounts);
            }

            return {
              limit: vi.fn(async () => []),
            };
          }),
        }),
      }),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    } as unknown as Database,
    insertValues,
    updateSet,
    updateWhere,
  };
}
const mockStorage = {
  write: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  exists: vi.fn(),
} as unknown as StorageDriver;
const mockEncryption = {
  isEnabled: () => false,
  encrypt: vi.fn(),
  decrypt: vi.fn(),
} as unknown as EncryptionServices;
const mockAuthorizationServices = {
  countActiveGlobalAdmins: vi.fn(),
  ensureBootstrapGlobalAdmin: vi.fn(async () => false),
  ensureBootstrapAdmin: vi.fn(async () => false),
  getUserAuthorizationState: vi.fn(async () => ({
    userId: 'usr_test_1',
    disabledAt: null,
    systemRole: 'member',
    systemCapabilities: [],
    isAdmin: false,
    canCreateVault: false,
  })),
  getUserWithRoles: vi.fn(),
  grantGlobalAdmin: vi.fn(),
  listGlobalRolesForUser: vi.fn(async () => []),
  listUsers: vi.fn(async () => []),
  revokeGlobalAdmin: vi.fn(),
  setUserDisabled: vi.fn(),
};

describe('auth integration', () => {
  test('delegates signup route to Better Auth handler', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, handler } = createMockAuth();

    const { app } = createServer({
      config,
      auth,
      db: mockDb,
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/auth/sign-up/email', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('delegates login route to Better Auth handler', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, handler } = createMockAuth();

    const { app } = createServer({
      config,
      auth,
      db: mockDb,
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/auth/sign-in/email', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('delegates social login route to Better Auth handler', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, handler } = createMockAuth();

    const { app } = createServer({
      config,
      auth,
      db: mockDb,
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/auth/sign-in/social', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('delegates 2FA route to Better Auth handler', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, handler } = createMockAuth();

    const { app } = createServer({
      config,
      auth,
      db: mockDb,
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/auth/two-factor/verify', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('returns 401 on /api/me when session is missing', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth } = createMockAuth();

    const { app } = createServer({
      config,
      auth,
      db: mockDb,
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/me', { method: 'GET' });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: 'auth.unauthorized',
        message: 'Unauthorized',
      },
    });
  });

  test('returns current user data on /api/me when session is present', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, getSession } = createMockAuth();

    getSession.mockResolvedValue({
      user: {
        email: 'alex@example.com',
        id: 'usr_test_1',
      },
      session: {
        id: 'ses_test_1',
      },
    });

    const { app } = createServer({
      config,
      auth,
      db: createMockDbWithAccounts([
        { password: 'hashed_password', providerId: 'credential' },
        { password: null, providerId: 'github' },
      ]),
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/me', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: 'usr_test_1',
      sessionId: 'ses_test_1',
      systemRole: 'member',
      systemCapabilities: [],
      isAdmin: false,
      canCreateVault: false,
      aiFeaturesEnabled: false,
      authMethods: {
        hasPassword: true,
        oauthProviders: ['github'],
        primaryOAuthProvider: 'github',
      },
      twoFactor: {
        authenticatorLinkedAt: null,
        backupCodeCount: null,
        backupCodesUpdatedAt: null,
      },
    });
  });

  test('sets a password for a recently verified OAuth-only account', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, getSession, hash } = createMockAuth();
    const { db, insertValues } = createMockSensitiveActionDb([
      {
        id: 'acc_google_1',
        password: null,
        providerId: 'google',
        userId: 'usr_test_1',
      },
    ]);

    getSession.mockResolvedValue({
      user: {
        email: 'alex@example.com',
        id: 'usr_test_1',
      },
      session: {
        id: 'ses_test_1',
        updatedAt: new Date(),
        userId: 'usr_test_1',
      },
    });

    const { app } = createServer({
      config,
      auth,
      db,
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/security/password/set', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'strongpass123' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    expect(hash).toHaveBeenCalledWith('strongpass123');
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'usr_test_1',
      password: 'hashed:strongpass123',
      providerId: 'credential',
      userId: 'usr_test_1',
    }));
  });

  test('rejects setting a password when OAuth verification is stale', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, getSession, hash } = createMockAuth();
    const { db, insertValues } = createMockSensitiveActionDb([
      {
        id: 'acc_google_1',
        password: null,
        providerId: 'google',
        userId: 'usr_test_1',
      },
    ]);

    getSession.mockResolvedValue({
      user: {
        email: 'alex@example.com',
        id: 'usr_test_1',
      },
      session: {
        id: 'ses_test_1',
        updatedAt: new Date(Date.now() - 20 * 60 * 1000),
        userId: 'usr_test_1',
      },
    });

    const { app } = createServer({
      config,
      auth,
      db,
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/security/password/set', {
      method: 'POST',
      body: JSON.stringify({ newPassword: 'strongpass123' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'security.identity_verification_failed',
        message: 'Confirm your linked sign-in provider before setting a password.',
      },
    });
    expect(hash).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });
});
