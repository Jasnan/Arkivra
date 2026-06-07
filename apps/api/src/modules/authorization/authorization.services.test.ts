import type { Database } from '../database/database.js';
import { describe, expect, test, vi } from 'vitest';
import { createAuthorizationServices } from './authorization.services.js';

describe('authorization services', () => {
  test('approves vault email invitation request by creating a pending invitation', async () => {
    const request = {
      id: 'perm_invite_1',
      type: 'vault.email_invitation',
      status: 'pending',
      requestedBy: 'usr_owner',
      reviewedBy: null,
      reviewedAt: null,
      vaultId: 'vlt_1',
      targetUserId: null,
      payload: {
        email: 'Invitee@Example.com',
        role: 'editor',
        aiAccessLevel: 'document_chat',
        expiresAt: '2026-02-01T00:00:00.000Z',
      },
      result: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const requestQuery: {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    } = {
      from: vi.fn(() => requestQuery),
      where: vi.fn(() => requestQuery),
      limit: vi.fn(async () => [request]),
    };
    const insertQuery: {
      values: ReturnType<typeof vi.fn>;
      returning: ReturnType<typeof vi.fn>;
    } = {
      values: vi.fn(() => insertQuery),
      returning: vi.fn(async () => [{ id: 'invite_1' }]),
    };
    const updatedRequest = {
      ...request,
      status: 'approved',
      reviewedBy: 'usr_root',
      result: {
        vaultId: 'vlt_1',
        invitationId: 'invite_1',
        email: 'invitee@example.com',
        role: 'editor',
        aiAccessLevel: 'document_chat',
      },
    };
    const updateQuery: {
      set: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      returning: ReturnType<typeof vi.fn>;
    } = {
      set: vi.fn(() => updateQuery),
      where: vi.fn(() => updateQuery),
      returning: vi.fn(async () => [updatedRequest]),
    };
    const tx = {
      select: vi.fn(() => requestQuery),
      insert: vi.fn(() => insertQuery),
      update: vi.fn(() => updateQuery),
    };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as Database;
    const services = createAuthorizationServices({ db });

    await expect(
      services.approvePermissionRequest({
        requestId: 'perm_invite_1',
        reviewedBy: 'usr_root',
      }),
    ).resolves.toEqual(updatedRequest);

    expect(insertQuery.values).toHaveBeenCalledWith({
      type: 'vault_member',
      email: 'invitee@example.com',
      invitedBy: 'usr_owner',
      vaultId: 'vlt_1',
      vaultRole: 'editor',
      aiAccessLevel: 'document_chat',
      systemRole: 'member',
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      payload: {
        systemCapabilities: [],
        vaultMemberships: [],
        permissionRequestId: 'perm_invite_1',
      },
    });
    expect(updateQuery.set).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved',
      reviewedBy: 'usr_root',
      result: {
        vaultId: 'vlt_1',
        invitationId: 'invite_1',
        email: 'invitee@example.com',
        role: 'editor',
        aiAccessLevel: 'document_chat',
      },
    }));
  });

  test('does not approve vault deletion when the vault still has documents', async () => {
    const request = {
      id: 'perm_1',
      type: 'vault.delete',
      status: 'pending',
      requestedBy: 'usr_owner',
      reviewedBy: null,
      reviewedAt: null,
      vaultId: 'vlt_1',
      targetUserId: null,
      payload: {},
      result: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const requestQuery: {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    } = {
      from: vi.fn(() => requestQuery),
      where: vi.fn(() => requestQuery),
      limit: vi.fn(async () => [request]),
    };
    const documentCountQuery: {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
    } = {
      from: vi.fn(() => documentCountQuery),
      where: vi.fn(async () => [{ count: 1 }]),
    };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(requestQuery)
        .mockReturnValueOnce(documentCountQuery),
      update: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    } as unknown as Database;
    const services = createAuthorizationServices({ db });

    await expect(
      services.approvePermissionRequest({
        requestId: 'perm_1',
        reviewedBy: 'usr_root',
      }),
    ).rejects.toThrow('authorization.vault_not_empty');
    expect(tx.update).not.toHaveBeenCalled();
  });
});
