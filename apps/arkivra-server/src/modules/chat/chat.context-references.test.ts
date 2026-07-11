import type { Context } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { parseRequestedContext, resolveCreatableContext } from './chat.route-helpers.js';

describe('chat folder context references', () => {
  test('parses folder references as first-class selection targets', () => {
    expect(parseRequestedContext({
      contextSnapshot: {
        type: 'selection',
        vaults: [],
        folders: [{ vaultId: 'vlt_1', folderId: 'fld_1', name: 'Invoices' }],
        documents: [],
      },
    })).toEqual({
      type: 'selection',
      vaults: [],
      folders: [{ vaultId: 'vlt_1', folderId: 'fld_1', name: 'Invoices' }],
      documents: [],
    });
  });

  test('normalizes a selected parent folder over its descendant on the server', async () => {
    const folderRows = [
      { id: 'fld_parent', parentId: null, name: 'Finance' },
      { id: 'fld_child', parentId: 'fld_parent', name: 'Invoices' },
    ];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => folderRows),
        })),
      })),
    } as unknown as Database;
    const vaultServices = {
      getVaultForUser: vi.fn(async () => ({
        id: 'vlt_1',
        name: 'Finance vault',
        role: 'viewer',
        isAdmin: false,
      })),
    } as unknown as VaultsServices;
    const context = {
      get: (key: string) => key === 'userId' ? 'usr_1' : key === 'canUseAI' ? true : null,
    } as unknown as Context<ServerContext>;

    const resolved = await resolveCreatableContext({
      context,
      requestedContext: {
        type: 'selection',
        vaults: [],
        folders: [
          { vaultId: 'vlt_1', folderId: 'fld_child' },
          { vaultId: 'vlt_1', folderId: 'fld_parent' },
        ],
        documents: [],
      },
      db,
      vaultServices,
    });

    expect(resolved).toMatchObject({
      ok: true,
      scope: {
        folders: [{ folderId: 'fld_parent', path: 'Finance' }],
      },
    });
  });
});
