import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerContext } from '../../server/server.types.js';
import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { parseConfig } from '../../config/config.js';
import { registerBackupRoutes } from './backups.routes.js';

function createAuthenticatedApp({
  backupQueue,
  backupDirectory,
}: {
  backupQueue?: {
    enqueueCreateBackup: () => Promise<{ jobId: string }>;
    enqueueRestoreBackup: (args: { backupId: string }) => Promise<{ jobId: string }>;
  };
  backupDirectory: string;
}) {
  const app = new Hono<ServerContext>();

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
    },
  });

  registerBackupRoutes({
    app,
    config,
    backupQueue: backupQueue as any,
  });

  return app;
}

describe('backup routes integration', () => {
  let backupDirectory = '';

  beforeAll(async () => {
    backupDirectory = await mkdtemp(join(tmpdir(), 'arkivra-backup-routes-'));
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(join(backupDirectory, 'arkivra-backup-test.tar.gz'), Buffer.from('backup-data'));
  });

  afterAll(async () => {
    await rm(backupDirectory, { recursive: true, force: true });
  });

  test('lists existing backups', async () => {
    const app = createAuthenticatedApp({ backupDirectory });
    const response = await app.request('/api/admin/backups');

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.backups).toHaveLength(1);
    expect(body.backups[0].id).toBe('arkivra-backup-test.tar.gz');
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
});
