import type { Hono } from 'hono';
import type { Config } from '../../config/config.js';
import type { ServerContext } from '../../server/server.types.js';
import type { BackupServices } from './backups.services.js';
import type { CreateBackupJobResult, RestoreBackupJobResult } from './backups.types.js';
import { createBackupServices } from './backups.services.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { requireRoot } from '../../authorization/authorization.middleware.js';

type BackupQueue = {
  enqueueCreateBackup: () => Promise<CreateBackupJobResult>;
  enqueueRestoreBackup: (args: { backupId: string }) => Promise<RestoreBackupJobResult>;
};

export function registerBackupRoutes({
  app,
  config,
  backupQueue,
  backupServices,
}: {
  app: Hono<ServerContext>;
  config: Config;
  backupQueue?: BackupQueue;
  backupServices?: BackupServices;
}) {
  const services = backupServices ?? createBackupServices({ config });

  app.use('/api/admin/backups', requireAuthentication(), requireRoot());
  app.use('/api/admin/backups/*', requireAuthentication(), requireRoot());

  app.post('/api/admin/backups', async (context) => {
    if (backupQueue === undefined) {
      return context.json(
        { error: { code: 'backup.queue_unavailable', message: 'Backup queue unavailable' } },
        503,
      );
    }

    const result = await backupQueue.enqueueCreateBackup();
    return context.json(result, 202);
  });

  app.get('/api/admin/backups', async (context) => {
    const backups = await services.listBackups();
    return context.json({ backups });
  });

  app.get('/api/admin/backups/:backupId/download', async (context) => {
    const backupId = context.req.param('backupId');
    const backup = await services.readBackupFile({ backupId });

    if (backup === null) {
      return context.json(
        { error: { code: 'backup.not_found', message: 'Backup not found' } },
        404,
      );
    }

    return new Response(backup.file, {
      status: 200,
      headers: {
        'content-type': 'application/gzip',
        'content-length': String(backup.file.length),
        'content-disposition': `attachment; filename="${encodeURIComponent(backup.fileName)}"`,
      },
    });
  });

  app.post('/api/admin/backups/restore', async (context) => {
    if (backupQueue === undefined) {
      return context.json(
        { error: { code: 'backup.queue_unavailable', message: 'Backup queue unavailable' } },
        503,
      );
    }

    const body = await context.req.json().catch(() => null);
    const backupId = typeof body?.backupId === 'string' ? body.backupId : null;

    if (backupId === null || backupId.length === 0) {
      return context.json(
        { error: { code: 'backup.invalid_restore_payload', message: 'backupId is required' } },
        400,
      );
    }

    const exists = await services.backupExists({ backupId });

    if (!exists) {
      return context.json(
        { error: { code: 'backup.not_found', message: 'Backup not found' } },
        404,
      );
    }

    const result = await backupQueue.enqueueRestoreBackup({ backupId });
    return context.json(result, 202);
  });
}
