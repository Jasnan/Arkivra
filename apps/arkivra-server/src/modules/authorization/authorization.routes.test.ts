import type { ServerContext } from '../server/server.types.js';
import type { AuthorizationServices } from './authorization.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerAuthorizationRoutes } from './authorization.routes.js';

function createTestApp({ authorizationServices }: { authorizationServices: AuthorizationServices }) {
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
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultAiAccessLevel', 'none');
    context.set('vaultIsMember', false);
    context.set('vaultAccessMode', null);
    await next();
  });

  registerAuthorizationRoutes({ app, authorizationServices });

  return app;
}

describe('authorization routes', () => {
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
