import type { ServerContext } from '../server/server.types.js';
import type { AuthorizationServices } from './authorization.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { parseConfig } from '../config/config.js';
import { registerAuthorizationRoutes } from './authorization.routes.js';

const requiredEnv = {
  ARKIVRA_ENCRYPTION_KEYS: `1:${'a'.repeat(64)}`,
  ARKIVRA_DOCLING_URL: 'http://127.0.0.1:5001',
  ARKIVRA_PUBLIC_URL: 'http://localhost:5174',
};

function createTestApp({
  authorizationServices,
  config,
}: {
  authorizationServices: AuthorizationServices;
  config?: ReturnType<typeof parseConfig>['config'];
}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', 'usr_root');
    context.set('session', {
      id: 'ses_root',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'usr_root',
      expiresAt: new Date(Date.now() + 3600_000),
      token: 'tok_root',
    });
    context.set('userDisabled', false);
    context.set('isAdmin', true);
    context.set('canCreateVault', true);
    context.set('canUseAI', true);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultIsMember', false);
    await next();
  });

  registerAuthorizationRoutes({ app, authorizationServices, config });

  return app;
}

describe('authorization routes', () => {
  test('creates and sends a platform account invitation', async () => {
    const { config } = parseConfig({ env: requiredEnv });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const invitation = {
      id: 'invite_1',
      type: 'platform_account',
      status: 'pending',
      email: 'invitee@example.com',
      tokenHash: 'hashed-token',
      invitedBy: 'usr_root',
      acceptedBy: null,
      acceptedAt: null,
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      vaultId: null,
      vaultMemberId: null,
      vaultRole: null,
      systemRole: 'member',
      payload: { systemCapabilities: ['system.use_ai'] },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const authorizationServices = {
      createEmailInvitation: vi.fn(async () => invitation),
    } as unknown as AuthorizationServices;
    const app = createTestApp({ authorizationServices, config });

    const response = await app.request('/api/admin/email-invitations', {
      method: 'POST',
      body: JSON.stringify({
        type: 'platform_account',
        email: 'Invitee@Example.com',
        systemRole: 'member',
        systemCapabilities: ['system.use_ai'],
        expiresAt: '2026-02-01T00:00:00.000Z',
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(201);
    const json = await response.json() as { invitation: Record<string, unknown> };
    expect(json.invitation.email).toBe('invitee@example.com');
    expect(json.invitation.tokenHash).toBeUndefined();
    expect(authorizationServices.createEmailInvitation).toHaveBeenCalledWith(expect.objectContaining({
      email: 'invitee@example.com',
      tokenHash: expect.any(String),
    }));
    expect(infoSpy).toHaveBeenCalledWith('[Auth email] To: invitee@example.com');
    infoSpy.mockRestore();
  });

  test('returns 409 when inviting an existing user email', async () => {
    const { config } = parseConfig({ env: requiredEnv });
    const authorizationServices = {
      createEmailInvitation: vi.fn(async () => {
        throw new Error('authorization.invitation_user_exists');
      }),
    } as unknown as AuthorizationServices;
    const app = createTestApp({ authorizationServices, config });

    const response = await app.request('/api/admin/email-invitations', {
      method: 'POST',
      body: JSON.stringify({
        type: 'platform_account',
        email: 'existing@example.com',
        systemRole: 'member',
        systemCapabilities: [],
      }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: 'authorization.invitation_user_exists',
        message: 'A user already exists for this email address.',
      },
    });
  });

  test('returns 404 when approving a vault deletion request for a missing vault', async () => {
    const authorizationServices = {
      approvePermissionRequest: vi.fn(async () => {
        throw new Error('authorization.vault_not_found');
      }),
    } as unknown as AuthorizationServices;
    const app = createTestApp({ authorizationServices });

    const response = await app.request('/api/admin/permission-requests/perm_1/approve', {
      method: 'POST',
    });

    expect(response.status).toBe(404);
    expect(authorizationServices.approvePermissionRequest).toHaveBeenCalledWith({
      requestId: 'perm_1',
      reviewedBy: 'usr_root',
    });
    expect(await response.json()).toEqual({
      error: {
        code: 'vault.not_found',
        message: 'Vault not found',
      },
    });
  });
});
