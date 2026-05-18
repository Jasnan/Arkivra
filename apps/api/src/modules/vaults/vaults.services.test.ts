import type { Database } from '../database/database.js';
import { describe, expect, test, vi } from 'vitest';
import { createVaultsServices } from './vaults.services.js';

describe('vaults services', () => {
  test('lists each admin vault once when a vault has multiple owners', async () => {
    const firstCreatedAt = new Date('2026-04-02T00:00:00.000Z');
    const secondCreatedAt = new Date('2026-04-01T00:00:00.000Z');
    const updatedAt = new Date('2026-04-10T00:00:00.000Z');
    const rows = [
      {
        id: 'vlt_1',
        name: 'Shared Root Vault',
        createdAt: firstCreatedAt,
        updatedAt,
        ownerUserId: 'usr_root_1',
        ownerEmail: 'root-one@example.com',
        ownerName: 'Root One',
      },
      {
        id: 'vlt_1',
        name: 'Shared Root Vault',
        createdAt: firstCreatedAt,
        updatedAt,
        ownerUserId: 'usr_root_2',
        ownerEmail: 'root-two@example.com',
        ownerName: 'Root Two',
      },
      {
        id: 'vlt_2',
        name: 'Personal Vault',
        createdAt: secondCreatedAt,
        updatedAt,
        ownerUserId: 'usr_root_1',
        ownerEmail: 'root-one@example.com',
        ownerName: 'Root One',
      },
    ];
    let query: {
      from: ReturnType<typeof vi.fn>;
      leftJoin: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      orderBy: ReturnType<typeof vi.fn>;
    };
    query = {
      from: vi.fn(() => query),
      leftJoin: vi.fn(() => query),
      where: vi.fn(() => query),
      orderBy: vi.fn(async () => rows),
    };
    let memberCountQuery: {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    memberCountQuery = {
      from: vi.fn(() => memberCountQuery),
      where: vi.fn(() => memberCountQuery),
      groupBy: vi.fn(async () => [
        { vaultId: 'vlt_1', memberCount: 2 },
        { vaultId: 'vlt_2', memberCount: 1 },
      ]),
    };
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(query)
        .mockReturnValueOnce(memberCountQuery),
    } as unknown as Database;
    const services = createVaultsServices({ db });

    const vaults = await services.listAllVaults();

    expect(vaults).toHaveLength(2);
    expect(vaults.map(vault => vault.id)).toEqual(['vlt_1', 'vlt_2']);
    expect(vaults[0]).toMatchObject({
      id: 'vlt_1',
      ownerUserId: 'usr_root_1',
      ownerEmail: 'root-one@example.com',
      memberCount: 2,
    });
  });
});
