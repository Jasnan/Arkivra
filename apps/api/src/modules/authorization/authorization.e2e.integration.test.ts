import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { systemCapabilitiesTable, usersTable, vaultsTable } from '../database/schema/index.js';
import { createAuth } from '../auth/auth.services.js';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createServer } from '../server/server.js';
import { createStorageDriver } from '../storage/storage.services.js';

describe.sequential('authorization e2e', () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const firstAdminEmail = `auth-admin-${uniqueSuffix}@example.com`;
  const ownerEmail = `auth-owner-${uniqueSuffix}@example.com`;
  const memberEmail = `auth-member-${uniqueSuffix}@example.com`;
  const password = 'Passw0rd!123';

  let storagePath = '';
  let pool: ReturnType<typeof setupDatabase>['pool'] | null = null;
  let db: ReturnType<typeof setupDatabase>['db'] | null = null;
  let app: ReturnType<typeof createServer>['app'] | null = null;

  let firstAdminUserId: string | null = null;
  let ownerUserId: string | null = null;
  let memberUserId: string | null = null;
  let vaultId: string | null = null;

  beforeAll(async () => {
    storagePath = await mkdtemp(join(tmpdir(), 'arkivra-auth-storage-'));

    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
        ARKIVRA_STORAGE_FS_PATH: storagePath,
        ARKIVRA_SERVER_BASE_URL: 'http://localhost:1221',
        ARKIVRA_CORS_ORIGINS: 'http://localhost:1221',
        ARKIVRA_AUTH_TRUSTED_ORIGINS: 'http://localhost:1221',
      },
    });

    const database = setupDatabase({ config });
    db = database.db;
    pool = database.pool;

    const { auth } = createAuth({ db, config });
    const encryption = createEncryptionServices({ kekKeysRaw: config.encryption.keys });
    const storage = createStorageDriver({ config });

    app = createServer({
      config,
      auth,
      db,
      storage,
      encryption,
    }).app;
  });

  afterAll(async () => {
    if (vaultId !== null && db !== null) {
      await db
        .delete(vaultsTable)
        .where(eq(vaultsTable.id, vaultId))
        .catch(() => undefined);
    }

    for (const userId of [firstAdminUserId, ownerUserId, memberUserId]) {
      if (userId !== null && db !== null) {
        await db
          .delete(usersTable)
          .where(eq(usersTable.id, userId))
          .catch(() => undefined);
      }
    }

    if (pool !== null) {
      await pool.end();
    }

    await rm(storagePath, { recursive: true, force: true }).catch(() => undefined);
  });

  test('bootstraps first global admin and enforces vault permissions end-to-end', async () => {
    if (app === null) {
      throw new Error('Authorization e2e app not initialized');
    }

    async function signUp(email: string) {
      const response = await app!.request('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:1221',
        },
        body: JSON.stringify({
          name: email.split('@', 1)[0],
          email,
          password,
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { user: { id: string } };
      const cookie = response.headers.get('set-cookie')!.split(';', 1)[0];
      return { userId: body.user.id, cookie };
    }

    const firstAdmin = await signUp(firstAdminEmail);
    const owner = await signUp(ownerEmail);
    const member = await signUp(memberEmail);

    firstAdminUserId = firstAdmin.userId;
    ownerUserId = owner.userId;
    memberUserId = member.userId;

    const rootRowsBeforeMe =
      db === null
        ? []
        : await db
            .select({ userId: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.systemRole, 'root'));
    const [oldestUser] =
      db === null
        ? []
        : await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .orderBy(asc(usersTable.createdAt))
            .limit(1);

    const firstAdminMeResponse = await app.request('/api/me', {
      headers: { cookie: firstAdmin.cookie },
    });
    expect(firstAdminMeResponse.status).toBe(200);
    const firstAdminMeBody = (await firstAdminMeResponse.json()) as {
      userId: string;
      isGlobalAdmin: boolean;
      canCreateVault: boolean;
    };
    expect(firstAdminMeBody.userId).toBe(firstAdmin.userId);

    if (rootRowsBeforeMe.length === 0 && oldestUser?.id === firstAdmin.userId) {
      expect(firstAdminMeBody.isGlobalAdmin).toBe(true);
      expect(firstAdminMeBody.canCreateVault).toBe(true);
    } else if (db !== null) {
      await db
        .update(usersTable)
        .set({ systemRole: 'root' })
        .where(eq(usersTable.id, firstAdmin.userId));
    }

    const ownerMeResponse = await app.request('/api/me', {
      headers: { cookie: owner.cookie },
    });
    expect(ownerMeResponse.status).toBe(200);
    expect(await ownerMeResponse.json()).toMatchObject({
      userId: owner.userId,
      isGlobalAdmin: false,
      canCreateVault: false,
    });

    const ownerAdminUsersResponse = await app.request('/api/admin/users', {
      headers: { cookie: owner.cookie },
    });
    expect(ownerAdminUsersResponse.status).toBe(403);

    const firstAdminUsersResponse = await app.request('/api/admin/users', {
      headers: { cookie: firstAdmin.cookie },
    });
    expect(firstAdminUsersResponse.status).toBe(200);

    const createVaultResponse = await app.request('/api/vaults', {
      method: 'POST',
      headers: {
        cookie: owner.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Owner Vault' }),
    });
    expect(createVaultResponse.status).toBe(403);
    if (db !== null) {
      await db
        .insert(systemCapabilitiesTable)
        .values({ userId: owner.userId, capability: 'system.create_vaults' })
        .onConflictDoNothing();
    }

    const grantedCreateVaultResponse = await app.request('/api/vaults', {
      method: 'POST',
      headers: {
        cookie: owner.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Owner Vault' }),
    });
    expect(grantedCreateVaultResponse.status).toBe(201);
    const createVaultBody = (await grantedCreateVaultResponse.json()) as { vault: { id: string } };
    vaultId = createVaultBody.vault.id;

    const adminVaultsResponse = await app.request('/api/admin/vaults', {
      headers: { cookie: firstAdmin.cookie },
    });
    expect(adminVaultsResponse.status).toBe(200);
    const adminVaultsBody = (await adminVaultsResponse.json()) as { vaults: Array<{ id: string }> };
    expect(adminVaultsBody.vaults.some((vault) => vault.id === vaultId)).toBe(true);

    const adminVaultDetailResponse = await app.request(`/api/vaults/${vaultId}`, {
      headers: { cookie: firstAdmin.cookie },
    });
    expect(adminVaultDetailResponse.status).toBe(200);

    const addMemberResponse = await app.request(`/api/vaults/${vaultId}/members`, {
      method: 'POST',
      headers: {
        cookie: owner.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        userId: member.userId,
        role: 'member',
        permissions: ['documents.read'],
      }),
    });
    expect(addMemberResponse.status).toBe(201);

    const deniedUploadFormData = new FormData();
    deniedUploadFormData.append(
      'file',
      new File(['hello world'], 'denied.txt', { type: 'text/plain' }),
    );

    const deniedUploadResponse = await app.request(`/api/vaults/${vaultId}/documents`, {
      method: 'POST',
      headers: {
        cookie: member.cookie,
      },
      body: deniedUploadFormData,
    });
    expect(deniedUploadResponse.status).toBe(403);

    const updateMemberResponse = await app.request(
      `/api/vaults/${vaultId}/members/${member.userId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: owner.cookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          role: 'member',
          permissions: ['documents.read', 'documents.create'],
        }),
      },
    );
    expect(updateMemberResponse.status).toBe(200);

    const uploadFormData = new FormData();
    uploadFormData.append('file', new File(['hello world'], 'allowed.txt', { type: 'text/plain' }));

    const allowedUploadResponse = await app.request(`/api/vaults/${vaultId}/documents`, {
      method: 'POST',
      headers: {
        cookie: member.cookie,
      },
      body: uploadFormData,
    });
    expect(allowedUploadResponse.status).toBe(201);

    const activeRootsBeforeRevoke =
      db === null
        ? []
        : await db
            .select({ userId: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.systemRole, 'root'));
    const revokeLastAdminResponse = await app.request(
      `/api/admin/users/${firstAdmin.userId}/global-admin`,
      {
        method: 'DELETE',
        headers: { cookie: firstAdmin.cookie },
      },
    );
    expect([200, 409]).toContain(revokeLastAdminResponse.status);
    expect(revokeLastAdminResponse.status).toBe(
      activeRootsBeforeRevoke.length <= 1 ? 409 : 200,
    );
  }, 30_000);
});
