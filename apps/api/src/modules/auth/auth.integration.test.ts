import type { Auth } from './auth.services.js';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { describe, expect, test, vi } from 'vitest';
import { parseConfig } from '../config/config.js';
import { createServer } from '../server/server.js';

function createMockAuth() {
  const handler = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );

  const getSession = vi.fn(async () => null as unknown);

  const auth = {
    handler,
    api: {
      getSession,
    },
  } as unknown as Auth;

  return { auth, handler, getSession };
}

const mockDb = {} as Database;
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
  getUserAuthorizationState: vi.fn(async () => ({
    userId: 'usr_test_1',
    disabledAt: null,
    globalRoles: [],
    isGlobalAdmin: false,
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
        id: 'usr_test_1',
      },
      session: {
        id: 'ses_test_1',
      },
    });

    const { app } = createServer({
      config,
      auth,
      db: mockDb,
      storage: mockStorage,
      encryption: mockEncryption,
      authorizationServices: mockAuthorizationServices as any,
    });

    const response = await app.request('/api/me', { method: 'GET' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: 'usr_test_1',
      sessionId: 'ses_test_1',
      isGlobalAdmin: false,
      canCreateVault: false,
    });
  });
});
