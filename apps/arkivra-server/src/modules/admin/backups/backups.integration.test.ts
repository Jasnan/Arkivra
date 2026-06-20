import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerContext } from '../../server/server.types.js';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { parseConfig } from '../../config/config.js';
import { registerBackupRoutes } from './backups.routes.js';

const requiredEncryptionKeys = `1:${'a'.repeat(64)}`;

function createAuthenticatedApp({
  activeAdmin = true,
  backupQueue,
  backupDirectory,
  restoreBootstrapToken = 'restore-token',
}: {
  activeAdmin?: boolean;
  backupQueue?: {
    enqueueCreateBackup: () => Promise<{ jobId: string }>;
    enqueueRestoreBackup: (args: { backupId: string }) => Promise<{ jobId: string }>;
  };
  backupDirectory: string;
  restoreBootstrapToken?: string;
}) {
  const app = new Hono<ServerContext>();
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (activeAdmin ? [{ id: 'usr_admin' }] : []),
        }),
      }),
    }),
  };

  app.use('*', async (context, next) => {
    context.set('userId', 'usr_test');
    context.set('session', {
      id: 'ses_test',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'usr_test',
      expiresAt: new Date(Date.now() + 3600_000),
      token: 'tok_test',
    });
    context.set('userDisabled', false);
    context.set('isAdmin', true);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    await next();
  });

  const { config } = parseConfig({
    env: {
      ARKIVRA_BACKUPS_PATH: backupDirectory,
      ARKIVRA_BACKUP_ENCRYPTION_KEY: 'c'.repeat(64),
      ARKIVRA_ENCRYPTION_KEYS: requiredEncryptionKeys,
      ARKIVRA_RESTORE_BOOTSTRAP_TOKEN: restoreBootstrapToken,
    },
  });

  registerBackupRoutes({
    app,
    db: db as any,
    config,
    backupQueue: backupQueue as any,
  });

  return app;
}

describe('backup routes integration', () => {
  let backupDirectory = '';
  const partData = Buffer.from('part-data');
  const validArchiveFields = {
    encrypted: true,
    algorithm: 'aes-256-gcm',
    keyDerivation: 'hkdf-sha256',
    salt: Buffer.alloc(16, 1).toString('base64'),
    iv: Buffer.alloc(12, 2).toString('base64'),
    authTag: Buffer.alloc(16, 3).toString('base64'),
    partSizeBytes: 512 * 1024 * 1024,
  } as const;

  function createManifest(id: string) {
    return {
      id,
      arkivraVersion: 'test',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      formatVersion: 2,
      archive: {
        ...validArchiveFields,
        totalEncryptedSize: partData.length,
        parts: [
          {
            index: 1,
            fileName: `${id}.part001`,
            size: partData.length,
            sha256: createHash('sha256').update(partData).digest('hex'),
          },
        ],
      },
    };
  }

  beforeAll(async () => {
    backupDirectory = await mkdtemp(join(tmpdir(), 'arkivra-backup-routes-'));
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(
      join(backupDirectory, 'arkivra-backup-test.tar.gz'),
      Buffer.from('backup-data'),
    );
  });

  afterAll(async () => {
    await rm(backupDirectory, { recursive: true, force: true });
  });

  test('lists existing backups', async () => {
    const app = createAuthenticatedApp({ backupDirectory });
    const response = await app.request('/api/admin/backups');

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.backups).toHaveLength(1);
    expect(body.backups[0].id).toBe('arkivra-backup-test.tar.gz');
    expect(body.backups[0].format).toBe('legacy_tar_gz');
    expect(body.backups[0].partCount).toBe(1);
    expect(body.backups[0].restorable).toBe(true);
  });

  test('enqueues create-backup jobs', async () => {
    const backupQueue = {
      enqueueCreateBackup: vi.fn(async () => ({ jobId: 'job_create_1' })),
      enqueueRestoreBackup: vi.fn(),
    };
    const app = createAuthenticatedApp({ backupDirectory, backupQueue });
    const response = await app.request('/api/admin/backups', { method: 'POST' });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ jobId: 'job_create_1' });
  });

  test('rejects backup mutations while maintenance mode is active', async () => {
    const backupQueue = {
      enqueueCreateBackup: vi.fn(async () => ({ jobId: 'job_create_1' })),
      enqueueRestoreBackup: vi.fn(),
    };
    await writeFile(join(backupDirectory, '.maintenance-mode'), '{}', 'utf8');

    try {
      const app = createAuthenticatedApp({ backupDirectory, backupQueue });
      const response = await app.request('/api/admin/backups', { method: 'POST' });

      expect(response.status).toBe(503);
      expect(backupQueue.enqueueCreateBackup).not.toHaveBeenCalled();
    } finally {
      await rm(join(backupDirectory, '.maintenance-mode'), { force: true });
    }
  });

  test('downloads existing backups', async () => {
    const app = createAuthenticatedApp({ backupDirectory });
    const response = await app.request('/api/admin/backups/arkivra-backup-test.tar.gz/download');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('arkivra-backup-test.tar.gz');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('backup-data');
  });

  test('enqueues restore-backup jobs', async () => {
    const backupQueue = {
      enqueueCreateBackup: vi.fn(),
      enqueueRestoreBackup: vi.fn(async () => ({ jobId: 'job_restore_1' })),
    };
    const app = createAuthenticatedApp({ backupDirectory, backupQueue });
    const response = await app.request('/api/admin/backups/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backupId: 'arkivra-backup-test.tar.gz' }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ jobId: 'job_restore_1' });
    expect(backupQueue.enqueueRestoreBackup).toHaveBeenCalledWith({
      backupId: 'arkivra-backup-test.tar.gz',
    });
  });

  test('returns 404 when restoring a missing backup', async () => {
    const backupQueue = {
      enqueueCreateBackup: vi.fn(),
      enqueueRestoreBackup: vi.fn(),
    };
    const app = createAuthenticatedApp({ backupDirectory, backupQueue });
    const response = await app.request('/api/admin/backups/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backupId: 'missing.tar.gz' }),
    });

    expect(response.status).toBe(404);
  });

  test('imports encrypted multipart backup files', async () => {
    const app = createAuthenticatedApp({ backupDirectory });
    const manifest = {
      id: 'arkivra-backup-import-test',
      arkivraVersion: 'test',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      formatVersion: 2,
      archive: {
        ...validArchiveFields,
        totalEncryptedSize: partData.length,
        parts: [
          {
            index: 1,
            fileName: 'arkivra-backup-import-test.part001',
            size: partData.length,
            sha256: createHash('sha256').update(partData).digest('hex'),
          },
        ],
      },
    };

    const manifestResponse = await app.request('/api/admin/backups/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest }),
    });

    expect(manifestResponse.status).toBe(201);
    expect(await manifestResponse.json()).toEqual({
      backupId: 'arkivra-backup-import-test.manifest.json',
      partCount: 1,
    });

    const partResponse = await app.request(
      '/api/admin/backups/imports/arkivra-backup-import-test.manifest.json/parts/arkivra-backup-import-test.part001',
      {
        method: 'PUT',
        body: partData,
      },
    );

    expect(partResponse.status).toBe(201);
  });

  test('rejects duplicate imported manifests and invalid part uploads', async () => {
    const app = createAuthenticatedApp({ backupDirectory });
    const manifest = createManifest('arkivra-backup-import-validation-test');

    const firstImportResponse = await app.request('/api/admin/backups/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest }),
    });
    expect(firstImportResponse.status).toBe(201);

    const duplicateImportResponse = await app.request('/api/admin/backups/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest }),
    });
    expect(duplicateImportResponse.status).toBe(409);

    const invalidPartResponse = await app.request(
      '/api/admin/backups/imports/arkivra-backup-import-validation-test.manifest.json/parts/arkivra-backup-import-validation-test.part001',
      {
        method: 'PUT',
        body: Buffer.from('wrong-data'),
      },
    );
    expect(invalidPartResponse.status).toBe(400);
  });

  test('rejects restore for incomplete imported multipart backup sets', async () => {
    const backupQueue = {
      enqueueCreateBackup: vi.fn(),
      enqueueRestoreBackup: vi.fn(),
    };
    const app = createAuthenticatedApp({ backupDirectory, backupQueue });
    const manifest = createManifest('arkivra-backup-incomplete-import-test');

    const importResponse = await app.request('/api/admin/backups/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest }),
    });
    expect(importResponse.status).toBe(201);

    const restoreResponse = await app.request('/api/admin/backups/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backupId: 'arkivra-backup-incomplete-import-test.manifest.json' }),
    });

    expect(restoreResponse.status).toBe(409);
    expect(backupQueue.enqueueRestoreBackup).not.toHaveBeenCalled();
  });

  test('reports bootstrap restore unavailable once an active admin exists', async () => {
    const app = createAuthenticatedApp({ backupDirectory, activeAdmin: true });
    const response = await app.request('/api/restore/bootstrap/status');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: false,
      reason: 'restore.instance_initialized',
      archiveEncryptionConfigured: true,
    });
  });

  test('imports and queues restore through bootstrap restore when no admin exists', async () => {
    const backupQueue = {
      enqueueCreateBackup: vi.fn(),
      enqueueRestoreBackup: vi.fn(async () => ({ jobId: 'job_bootstrap_restore_1' })),
    };
    const app = createAuthenticatedApp({ backupDirectory, activeAdmin: false, backupQueue });
    const manifest = {
      id: 'arkivra-backup-bootstrap-test',
      arkivraVersion: 'test',
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      formatVersion: 2,
      archive: {
        ...validArchiveFields,
        totalEncryptedSize: partData.length,
        parts: [
          {
            index: 1,
            fileName: 'arkivra-backup-bootstrap-test.part001',
            size: partData.length,
            sha256: createHash('sha256').update(partData).digest('hex'),
          },
        ],
      },
    };

    const importResponse = await app.request('/api/restore/bootstrap/imports', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-arkivra-restore-token': 'restore-token',
      },
      body: JSON.stringify({ manifest }),
    });

    expect(importResponse.status).toBe(201);
    const imported = (await importResponse.json()) as { backupId: string };

    const partResponse = await app.request(
      `/api/restore/bootstrap/imports/${imported.backupId}/parts/arkivra-backup-bootstrap-test.part001`,
      {
        method: 'PUT',
        headers: { 'x-arkivra-restore-token': 'restore-token' },
        body: partData,
      },
    );

    expect(partResponse.status).toBe(201);

    const restoreResponse = await app.request('/api/restore/bootstrap/restore', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-arkivra-restore-token': 'restore-token',
      },
      body: JSON.stringify({ backupId: imported.backupId }),
    });

    expect(restoreResponse.status).toBe(202);
    expect(await restoreResponse.json()).toEqual({ jobId: 'job_bootstrap_restore_1' });
  });
});
