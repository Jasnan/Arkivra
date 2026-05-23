import type { Database } from '../database/database.js';
import { describe, expect, test, vi } from 'vitest';
import { createAuthorizationServices } from './authorization.services.js';

describe('authorization services', () => {
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
    let requestQuery: {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
    };
    requestQuery = {
      from: vi.fn(() => requestQuery),
      where: vi.fn(() => requestQuery),
      limit: vi.fn(async () => [request]),
    };
    let documentCountQuery: {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
    };
    documentCountQuery = {
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
