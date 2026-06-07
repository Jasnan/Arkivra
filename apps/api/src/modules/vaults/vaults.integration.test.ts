import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from './vaults.services.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerVaultRoutes } from './vaults.routes.js';

function createMockVaultsServices() {
  const services = {
    countVaultContents: vi.fn(async () => ({ documentCount: 0, folderCount: 0, totalCount: 0 })),
    createVault: vi.fn(async ({ name, description, userId }) => ({
      id: 'vlt_test_1',
      name,
      description,
      fileCount: 0,
      totalSize: 0,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      userId,
    })),
    getMember: vi.fn(async () => null),
    getVaultForUser: vi.fn(async () => null),
    listMembers: vi.fn(async () => []),
    listPendingInvitations: vi.fn(async () => []),
    listUserVaults: vi.fn(async () => []),
    createEmailInvitation: vi.fn(async ({ email, invitedBy, vaultId, role, aiAccessLevel, expiresAt }) => ({
      id: 'emi_1',
      type: 'vault_member',
      status: 'pending',
      email,
      invitedBy,
      vaultId,
      vaultRole: role,
      aiAccessLevel,
      expiresAt,
    })),
    createPermissionRequest: vi.fn(async ({ type, requestedBy, vaultId, targetUserId, payload }) => ({
      id: 'perm_req_1',
      type,
      status: 'pending',
      requestedBy,
      vaultId: vaultId ?? null,
      targetUserId: targetUserId ?? null,
      payload: payload ?? {},
    })),
    removeMember: vi.fn(async () => ({ userId: 'usr_member_1' })),
    softDeleteVault: vi.fn(async () => ({ id: 'vlt_test_1' })),
    updateVaultIdentity: vi.fn(async ({ name, description }) => ({ id: 'vlt_test_1', name, description })),
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
    context.set('isAdmin', false);
    context.set('canCreateVault', canCreateVault);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultAiAccessLevel', 'none');
    context.set('vaultIsMember', false);
    context.set('vaultAccessMode', null);

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
        description: 'Household and personal records',
        fileCount: 3,
        totalSize: 6144,
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
          description: 'Household and personal records',
          fileCount: 3,
          totalSize: 6144,
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
      body: JSON.stringify({ name: 'Finance', description: 'Bank statements and receipts' }),
    });

    expect(response.status).toBe(201);
    expect(services.createVault).toHaveBeenCalledWith({
      userId: 'usr_1',
      name: 'Finance',
      description: 'Bank statements and receipts',
    });
  });

  test('creates vault with omitted optional description', async () => {
    const services = createMockVaultsServices();
    const app = createTestApp({ services });

    const response = await app.request('/api/vaults', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ name: 'Finance', description: null }),
    });

    expect(response.status).toBe(201);
    expect(services.createVault).toHaveBeenCalledWith({
      userId: 'usr_1',
      name: 'Finance',
      description: null,
    });
  });

  test('updates vault identity for owner', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      description: 'Old description',
      fileCount: 2,
      totalSize: 2048,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ name: 'Team Vault', description: 'Updated description' }),
    });

    expect(response.status).toBe(200);
    expect(services.updateVaultIdentity).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      name: 'Team Vault',
      description: 'Updated description',
    });
  });

  test('updates vault identity with omitted optional description', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      description: 'Old description',
      fileCount: 2,
      totalSize: 2048,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ name: 'Team Vault', description: null }),
    });

    expect(response.status).toBe(200);
    expect(services.updateVaultIdentity).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      name: 'Team Vault',
      description: null,
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

    expect(response.status).toBe(202);
    expect(services.createVault).not.toHaveBeenCalled();
    expect(services.createPermissionRequest).toHaveBeenCalledWith({
      type: 'vault.create',
      requestedBy: 'usr_1',
      payload: { name: 'Finance', description: null },
    });
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
      description: 'Shared finance documents',
      fileCount: 2,
      totalSize: 2048,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.vault.id).toBe('vlt_1');
    expect(body.vault.name).toBe('Team Vault');
    expect(body.vault.description).toBe('Shared finance documents');
    expect(body.vault.role).toBe('owner');
  });

  test('allows admin administrative read access without membership', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      description: 'Shared finance documents',
      fileCount: 2,
      totalSize: 2048,
      role: null,
      aiAccessLevel: 'none',
      isAdmin: true,
      isMember: false,
      accessMode: 'admin',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      headers: { 'x-test-user-id': 'usr_root' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.vault.role).toBeNull();
    expect(body.vault.accessMode).toBe('admin');
  });

  test('blocks editor from reading vault members roster', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'editor',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/members', {
      headers: { 'x-test-user-id': 'usr_editor' },
    });

    expect(response.status).toBe(403);
    expect(services.listMembers).not.toHaveBeenCalled();
  });

  test('allows admin to read vault members roster without membership', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: null,
      aiAccessLevel: 'none',
      isAdmin: true,
      isMember: false,
      accessMode: 'admin',
    }));
    (services as any).listMembers = vi.fn(async () => [
      {
        userId: 'usr_owner',
        role: 'owner',
        email: 'owner@example.com',
        name: 'Owner',
        aiAccessLevel: 'full',
      },
    ]);

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/members', {
      headers: { 'x-test-user-id': 'usr_root' },
    });

    expect(response.status).toBe(200);
    expect(services.listMembers).toHaveBeenCalledWith({ vaultId: 'vlt_1' });
  });

  test('allows owner to read pending vault invitations', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    (services as any).listPendingInvitations = vi.fn(async () => [
      {
        id: 'perm_req_1',
        source: 'permission_request',
        status: 'approval_pending',
        email: 'pending@example.com',
        role: 'viewer',
        aiAccessLevel: 'none',
        requestedBy: 'usr_owner',
        expiresAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/invitations', {
      headers: { 'x-test-user-id': 'usr_owner' },
    });

    expect(response.status).toBe(200);
    expect(services.listPendingInvitations).toHaveBeenCalledWith({ vaultId: 'vlt_1' });
    expect(await response.json()).toEqual({
      invitations: [
        {
          id: 'perm_req_1',
          source: 'permission_request',
          status: 'approval_pending',
          email: 'pending@example.com',
          role: 'viewer',
          aiAccessLevel: 'none',
          requestedBy: 'usr_owner',
          expiresAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  test('blocks admin administrative access from mutating vault settings', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      description: 'Shared finance documents',
      fileCount: 2,
      totalSize: 2048,
      role: null,
      aiAccessLevel: 'none',
      isAdmin: true,
      isMember: false,
      accessMode: 'admin',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_root',
      },
      body: JSON.stringify({ name: 'New name' }),
    });

    expect(response.status).toBe(403);
    expect(services.updateVaultIdentity).not.toHaveBeenCalled();
  });

  test('queues vault deletion request for non-admin owner when vault is empty', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_owner' },
    });

    expect(response.status).toBe(202);
    expect(services.countVaultContents).toHaveBeenCalledWith({ vaultId: 'vlt_1' });
    expect(services.createPermissionRequest).toHaveBeenCalledWith({
      type: 'vault.delete',
      requestedBy: 'usr_owner',
      vaultId: 'vlt_1',
      payload: {},
    });
  });

  test('rejects vault deletion request when vault has contents', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    (services as any).countVaultContents = vi.fn(async () => ({
      documentCount: 1,
      folderCount: 0,
      totalCount: 1,
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_owner' },
    });

    expect(response.status).toBe(409);
    expect(services.createPermissionRequest).not.toHaveBeenCalled();
    expect(services.softDeleteVault).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      error: {
        code: 'vault.not_empty',
        message: 'Empty the vault before deleting it.',
        details: {
          documentCount: 1,
          folderCount: 0,
          totalCount: 1,
        },
      },
    });
  });

  test('rejects admin vault deletion when vault has folders', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: true,
      isMember: true,
      accessMode: 'member',
    }));
    (services as any).countVaultContents = vi.fn(async () => ({
      documentCount: 0,
      folderCount: 1,
      totalCount: 1,
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_root' },
    });

    expect(response.status).toBe(409);
    expect(services.softDeleteVault).not.toHaveBeenCalled();
  });

  test('allows admin vault deletion when vault is empty', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: true,
      isMember: true,
      accessMode: 'member',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_root' },
    });

    expect(response.status).toBe(204);
    expect(services.softDeleteVault).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      deletedBy: 'usr_root',
    });
  });

  test('allows admin administrative user to join vault as explicit member', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      description: 'Shared finance documents',
      fileCount: 2,
      totalSize: 2048,
      role: null,
      aiAccessLevel: 'none',
      isAdmin: true,
      isMember: false,
      accessMode: 'admin',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/membership/self', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_root',
      },
      body: JSON.stringify({ role: 'owner', aiAccessLevel: 'full' }),
    });

    expect(response.status).toBe(201);
    expect(services.upsertMember).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      userId: 'usr_root',
      role: 'owner',
      aiAccessLevel: 'full',
    });
  });

  test('allows admin explicit member to leave vault membership', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      description: 'Shared finance documents',
      fileCount: 2,
      totalSize: 2048,
      role: 'editor',
      aiAccessLevel: 'full',
      isAdmin: true,
      isMember: true,
      accessMode: 'member',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/membership/self', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_root' },
    });

    expect(response.status).toBe(204);
    expect(services.removeMember).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      userId: 'usr_root',
    });
  });

  test('blocks member from adding vault members', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'editor',
      aiAccessLevel: 'none',
      isAdmin: false,
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/members', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ userId: 'usr_2', role: 'editor' }),
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
      aiAccessLevel: 'none',
      isAdmin: false,
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
        role: 'editor',
        aiAccessLevel: 'none',
      }),
    });

    expect(response.status).toBe(201);
    expect(services.upsertMember).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      userId: 'usr_2',
      role: 'editor',
      aiAccessLevel: 'none',
    });
  });

  test('queues owner email invitation for admin approval', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/email-invitations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_owner',
      },
      body: JSON.stringify({
        email: 'Pending@Example.com',
        role: 'viewer',
        aiAccessLevel: 'none',
        expiresAt: null,
      }),
    });

    expect(response.status).toBe(202);
    expect(services.createPermissionRequest).toHaveBeenCalledWith({
      type: 'vault.email_invitation',
      requestedBy: 'usr_owner',
      vaultId: 'vlt_1',
      payload: {
        email: 'pending@example.com',
        role: 'viewer',
        aiAccessLevel: 'none',
        expiresAt: null,
      },
    });
    expect(services.createEmailInvitation).not.toHaveBeenCalled();
  });

  test('creates admin owner email invitation immediately', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: true,
      isMember: true,
      accessMode: 'member',
    }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/email-invitations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_root',
      },
      body: JSON.stringify({
        email: 'Invitee@Example.com',
        role: 'editor',
        aiAccessLevel: 'document_chat',
        expiresAt: '2026-02-01T00:00:00.000Z',
      }),
    });

    expect(response.status).toBe(201);
    expect(services.createEmailInvitation).toHaveBeenCalledWith({
      email: 'invitee@example.com',
      invitedBy: 'usr_root',
      vaultId: 'vlt_1',
      role: 'editor',
      aiAccessLevel: 'document_chat',
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(services.createPermissionRequest).not.toHaveBeenCalled();
  });

  test('allows owner to remove another owner when another owner remains', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    (services as any).getMember = vi.fn(async () => ({
      userId: 'usr_2',
      role: 'owner',
      aiAccessLevel: 'full',
    }));
    (services as any).removeMember = vi.fn(async () => ({ userId: 'usr_2' }));

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/members/usr_2', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_owner' },
    });

    expect(response.status).toBe(204);
    expect(services.removeMember).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      userId: 'usr_2',
    });
  });

  test('returns forbidden when demoting the last owner', async () => {
    const services = createMockVaultsServices();
    (services as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Team Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    (services as any).getMember = vi.fn(async () => ({
      userId: 'usr_owner',
      role: 'owner',
      aiAccessLevel: 'full',
    }));
    (services as any).upsertMember = vi.fn(async () => {
      throw new Error('authorization.last_vault_owner');
    });

    const app = createTestApp({ services });

    const response = await app.request('/api/vaults/vlt_1/members/usr_owner', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_owner',
      },
      body: JSON.stringify({
        role: 'viewer',
        aiAccessLevel: 'full',
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'vault.last_owner',
        message: 'At least one owner is required',
      },
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
      role: 'editor',
      aiAccessLevel: 'none',
      isAdmin: false,
    }));

    const app = createTestApp({ services });
    const response = await app.request('/api/vaults/vlt_1/members', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_member',
      },
      body: JSON.stringify({ userId: 'usr_3', role: 'editor' }),
    });

    expect(response.status).toBe(403);
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
      aiAccessLevel: 'none',
      isAdmin: false,
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

    expect(response.status).toBe(202);
    expect(services.createPermissionRequest).toHaveBeenCalledWith({
      type: 'vault.owner_promote',
      requestedBy: 'usr_owner',
      vaultId: 'vlt_1',
      targetUserId: 'usr_2',
      payload: { role: 'owner' },
    });
  });
});
