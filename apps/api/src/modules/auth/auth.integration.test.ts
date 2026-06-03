import type { Auth } from './auth.services.js';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { describe, expect, test, vi } from 'vitest';
import { parseConfig } from '../config/config.js';
import { createServer } from '../server/server.js';

function createMockAuth() {
  const hash = vi.fn(async (password: string) => `hashed:${password}`);
  const verify = vi.fn(async ({ password }: { password: string }) => password === 'secret123');
  const changeEmail = vi.fn(async () => ({ status: true, message: 'Confirmation email sent.' }));
  const linkSocialAccount = vi.fn(async () => ({
    redirect: true,
    url: 'https://accounts.google.com/oauth',
  }));
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
        verify,
      },
      secretConfig: 'test-secret',
    }),
    handler,
    api: {
      changeEmail,
      getSession,
      linkSocialAccount,
    },
  } as unknown as Auth;

  return { auth, changeEmail, handler, getSession, hash, linkSocialAccount, verify };
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

function createMockSensitiveActionDb(
  accounts: Array<{ id: string; password: string | null; providerId: string; userId: string }>,
  options?: { existingEmailUserId?: string | null },
) {
  const insertReturning = vi.fn(async () => [{
    actorDisplayName: 'Alex',
    actorId: 'usr_test_1',
    actorType: 'user',
    after: null,
    before: null,
    createdAt: new Date(),
    documentId: null,
    eventCategory: 'auth',
    eventType: 'auth.password_set',
    id: 'aud_test_1',
    ipAddress: null,
    metadata: null,
    occurredAt: new Date(),
    outcome: 'success',
    requestId: null,
    schemaVersion: 1,
    severity: 'notice',
    source: 'api',
    targetDisplayName: 'Alex',
    targetId: 'usr_test_1',
    targetType: 'user',
    userAgent: null,
    vaultId: null,
  }]);
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
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
              limit: vi.fn(async () => (
                options?.existingEmailUserId ? [{ id: options.existingEmailUserId }] : []
              )),
            };
          }),
        }),
      }),
      update: vi.fn(() => ({
        set: updateSet,
      })),
    } as unknown as Database,
    insertReturning,
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
    expect(insertValues).not.toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'credential',
    }));
  });

  test('requests an email change only after password verification', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, changeEmail, getSession, verify } = createMockAuth();
    const { db, insertValues } = createMockSensitiveActionDb([
      {
        id: 'acc_credential_1',
        password: 'hashed_password',
        providerId: 'credential',
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

    const response = await app.request('/api/security/email/change', {
      method: 'POST',
      body: JSON.stringify({
        callbackURL: 'http://localhost:3000/settings/security',
        newEmail: 'NEW@example.com',
        password: 'secret123',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true, message: 'Confirmation email sent.' });
    expect(verify).toHaveBeenCalledWith({
      hash: 'hashed_password',
      password: 'secret123',
    });
    expect(changeEmail).toHaveBeenCalledWith(expect.objectContaining({
      body: {
        callbackURL: 'http://localhost:3000/settings/security',
        newEmail: 'new@example.com',
      },
    }));
  });

  test('rejects email change for OAuth-only accounts', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, changeEmail, getSession } = createMockAuth();
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

    const response = await app.request('/api/security/email/change', {
      method: 'POST',
      body: JSON.stringify({
        callbackURL: 'http://localhost:3000/settings/security',
        newEmail: 'new@example.com',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'security.password_required',
        message: 'Set a password before changing your email address.',
      },
    });
    expect(changeEmail).not.toHaveBeenCalled();
  });

  test('rejects email change when another account already uses the requested email', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, changeEmail, getSession } = createMockAuth();
    const { db, insertValues } = createMockSensitiveActionDb([
      {
        id: 'acc_credential_1',
        password: 'hashed_password',
        providerId: 'credential',
        userId: 'usr_test_1',
      },
    ], { existingEmailUserId: 'usr_other' });

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

    const response = await app.request('/api/security/email/change', {
      method: 'POST',
      body: JSON.stringify({
        callbackURL: 'http://localhost:3000/settings/security',
        newEmail: 'taken@example.com',
        password: 'secret123',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'security.email_in_use',
        message: 'That email address is already used by another account.',
      },
    });
    expect(changeEmail).not.toHaveBeenCalled();
  });

  test('starts OAuth account linking only after password verification', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, getSession, linkSocialAccount, verify } = createMockAuth();
    const { db, insertValues } = createMockSensitiveActionDb([
      {
        id: 'acc_credential_1',
        password: 'hashed_password',
        providerId: 'credential',
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

    const response = await app.request('/api/security/oauth/link', {
      method: 'POST',
      body: JSON.stringify({
        callbackURL: 'http://localhost:3000/settings/security',
        password: 'secret123',
        provider: 'google',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      redirect: true,
      url: 'https://accounts.google.com/oauth',
    });
    expect(verify).toHaveBeenCalledWith({
      hash: 'hashed_password',
      password: 'secret123',
    });
    expect(linkSocialAccount).toHaveBeenCalledWith(expect.objectContaining({
      body: {
        callbackURL: 'http://localhost:3000/settings/security',
        provider: 'google',
      },
    }));
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'auth.oauth_link_requested',
      metadata: {
        provider: 'google',
        verification_method: 'password',
      },
      outcome: 'success',
    }));
  });

  test('rejects OAuth account linking when current password is wrong', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, getSession, linkSocialAccount } = createMockAuth();
    const { db } = createMockSensitiveActionDb([
      {
        id: 'acc_credential_1',
        password: 'hashed_password',
        providerId: 'credential',
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

    const response = await app.request('/api/security/oauth/link', {
      method: 'POST',
      body: JSON.stringify({
        callbackURL: 'http://localhost:3000/settings/security',
        password: 'wrong-password',
        provider: 'google',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'security.identity_verification_failed',
        message: 'Current password is incorrect.',
      },
    });
    expect(linkSocialAccount).not.toHaveBeenCalled();
  });

  test('rejects OAuth account linking when provider is already connected', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, getSession, linkSocialAccount } = createMockAuth();
    const { db } = createMockSensitiveActionDb([
      {
        id: 'acc_credential_1',
        password: 'hashed_password',
        providerId: 'credential',
        userId: 'usr_test_1',
      },
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

    const response = await app.request('/api/security/oauth/link', {
      method: 'POST',
      body: JSON.stringify({
        callbackURL: 'http://localhost:3000/settings/security',
        password: 'secret123',
        provider: 'google',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'security.provider_already_linked',
        message: 'That sign-in provider is already connected.',
      },
    });
    expect(linkSocialAccount).not.toHaveBeenCalled();
  });

  test('blocks and audits direct Better Auth social-link endpoint access', async () => {
    const { config } = parseConfig({ env: {} });
    const { auth, getSession, handler } = createMockAuth();
    const { db, insertValues } = createMockSensitiveActionDb([
      {
        id: 'acc_credential_1',
        password: 'hashed_password',
        providerId: 'credential',
        userId: 'usr_test_1',
      },
    ]);

    getSession.mockResolvedValue({
      user: {
        email: 'alex@example.com',
        id: 'usr_test_1',
        name: 'Alex',
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

    const response = await app.request('/api/auth/link-social', {
      method: 'POST',
      body: JSON.stringify({
        callbackURL: 'http://localhost:3000/settings/security',
        provider: 'google',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'security.use_sensitive_action_route',
        message: 'Connect sign-in providers from Security settings.',
      },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'auth.sensitive_action_denied',
      metadata: {
        action: 'oauth.link',
        reason: 'direct_auth_endpoint_blocked',
      },
      outcome: 'denied',
    }));
  });
});
