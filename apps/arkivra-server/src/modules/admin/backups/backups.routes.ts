import type { Context, Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { and, eq, isNull } from 'drizzle-orm';
import type { Config } from '../../config/config.js';
import type { Database } from '../../database/database.js';
import { usersTable } from '../../database/schema/index.js';
import type { ServerContext } from '../../server/server.types.js';
import type { BackupServices } from './backups.services.js';
import type { BackupArchiveManifest } from '../../worker/backup.archive.js';
import type { CreateBackupJobResult, RestoreBackupJobResult } from './backups.types.js';
import { createBackupServices } from './backups.services.js';
import { requireAuthentication } from '../../auth/auth.middleware.js';
import { requireAdmin } from '../../authorization/authorization.middleware.js';

type BackupQueue = {
  enqueueCreateBackup: () => Promise<CreateBackupJobResult>;
  enqueueRestoreBackup: (args: { backupId: string }) => Promise<RestoreBackupJobResult>;
};

export function registerBackupRoutes({
  app,
  db,
  config,
  backupQueue,
  backupServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  config: Config;
  backupQueue?: BackupQueue;
  backupServices?: BackupServices;
}) {
  const services = backupServices ?? createBackupServices({ config });

  function verifyBootstrapToken(token: string | null) {
    const expected = config.restore.bootstrapToken?.trim();
    if (expected === undefined || expected.length === 0 || token === null || token.length === 0) {
      return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(token);
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  async function hasActiveAdmin() {
    const [admin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.systemRole, 'admin'), isNull(usersTable.disabledAt)))
      .limit(1);

    return admin !== undefined;
  }

  async function getBootstrapRestoreAvailability() {
    if (!config.restore.bootstrapToken?.trim()) {
      return {
        available: false,
        reason: 'restore.bootstrap_token_missing',
      };
    }

    if (await hasActiveAdmin()) {
      return {
        available: false,
        reason: 'restore.instance_initialized',
      };
    }

    return {
      available: true,
      reason: null,
    };
  }

  async function requireBootstrapRestore(context: Context<ServerContext>) {
    const availability = await getBootstrapRestoreAvailability();
    const token = context.req.header('x-arkivra-restore-token') ?? null;

    if (!availability.available) {
      return {
        ok: false as const,
        response: context.json(
          {
            error: {
              code: availability.reason ?? 'restore.unavailable',
              message: 'Bootstrap restore is not available for this instance.',
            },
          },
          403,
        ),
      };
    }

    if (!verifyBootstrapToken(token)) {
      return {
        ok: false as const,
        response: context.json(
          { error: { code: 'restore.invalid_bootstrap_token', message: 'Invalid restore token.' } },
          401,
        ),
      };
    }

    return { ok: true as const };
  }

  function backupArchiveKeyIsConfigured() {
    return Boolean(config.encryption.keys?.trim());
  }

  async function rejectMutationDuringMaintenance(context: Context<ServerContext>) {
    if (!(await services.isMaintenanceModeEnabled())) {
      return null;
    }

    return context.json(
      {
        error: {
          code: 'system.maintenance_mode',
          message: 'Backup or restore in progress. Arkivra is temporarily in maintenance mode.',
        },
      },
      503,
    );
  }

  app.use('/api/admin/backups', requireAuthentication(), requireAdmin());
  app.use('/api/admin/backups/*', requireAuthentication(), requireAdmin());

  app.post('/api/admin/backups', async (context) => {
    const maintenanceResponse = await rejectMutationDuringMaintenance(context);
    if (maintenanceResponse !== null) return maintenanceResponse;

    if (backupQueue === undefined) {
      return context.json(
        { error: { code: 'backup.queue_unavailable', message: 'Backup queue unavailable' } },
        503,
      );
    }

    if (!backupArchiveKeyIsConfigured()) {
      return context.json(
        {
          error: {
            code: 'backup.archive_encryption_key_missing',
            message: 'Document encryption keys are not configured.',
          },
        },
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

  app.get('/api/admin/backups/:backupId/parts/:partFileName/download', async (context) => {
    const backupId = context.req.param('backupId');
    const partFileName = context.req.param('partFileName');
    const filePath = services.resolveBackupPartPath({ backupId, partFileName });

    if (filePath === null) {
      return context.json(
        { error: { code: 'backup.part_not_found', message: 'Backup part not found' } },
        404,
      );
    }

    try {
      const fileStats = await stat(filePath);
      return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(fileStats.size),
          'content-disposition': `attachment; filename="${encodeURIComponent(partFileName)}"`,
        },
      });
    }
    catch {
      return context.json(
        { error: { code: 'backup.part_not_found', message: 'Backup part not found' } },
        404,
      );
    }
  });

  app.post('/api/admin/backups/imports', async (context) => {
    const maintenanceResponse = await rejectMutationDuringMaintenance(context);
    if (maintenanceResponse !== null) return maintenanceResponse;

    const body = await context.req.json().catch(() => null) as { manifest?: BackupArchiveManifest } | null;
    const manifest = body?.manifest;

    if (manifest === undefined) {
      return context.json(
        { error: { code: 'backup.invalid_import_payload', message: 'manifest is required' } },
        400,
      );
    }

    const result = await services.writeImportedManifest({ manifest });
    if (!result.ok) {
      if (result.reason === 'already_exists') {
        return context.json(
          { error: { code: 'backup.import_already_exists', message: 'Backup import already exists' } },
          409,
        );
      }

      return context.json(
        { error: { code: 'backup.invalid_import_manifest', message: 'Invalid backup manifest' } },
        400,
      );
    }

    return context.json({ backupId: result.backupId, partCount: result.partCount }, 201);
  });

  app.put('/api/admin/backups/imports/:backupId/parts/:partFileName', async (context) => {
    const maintenanceResponse = await rejectMutationDuringMaintenance(context);
    if (maintenanceResponse !== null) return maintenanceResponse;

    const backupId = context.req.param('backupId');
    const partFileName = context.req.param('partFileName');
    const result = await services.writeImportedPart({
      backupId,
      partFileName,
      body: context.req.raw.body,
    });

    if (!result.ok) {
      if (result.reason === 'already_exists') {
        return context.json(
          { error: { code: 'backup.import_part_already_exists', message: 'Backup part already exists' } },
          409,
        );
      }

      return context.json(
        { error: { code: 'backup.invalid_import_part', message: 'Invalid backup part upload' } },
        400,
      );
    }

    return context.json({ uploaded: true }, 201);
  });

  app.post('/api/admin/backups/restore', async (context) => {
    const maintenanceResponse = await rejectMutationDuringMaintenance(context);
    if (maintenanceResponse !== null) return maintenanceResponse;

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

    if (backupId.endsWith('.manifest.json') && !backupArchiveKeyIsConfigured()) {
      return context.json(
        {
          error: {
            code: 'backup.archive_encryption_key_missing',
            message: 'Document encryption keys are not configured.',
          },
        },
        503,
      );
    }

    const exists = await services.backupExists({ backupId });

    if (!exists) {
      return context.json(
        { error: { code: 'backup.not_found', message: 'Backup not found' } },
        404,
      );
    }

    if (!(await services.backupIsRestorable({ backupId }))) {
      return context.json(
        { error: { code: 'backup.not_restorable', message: 'Backup set is incomplete or invalid' } },
        409,
      );
    }

    const result = await backupQueue.enqueueRestoreBackup({ backupId });
    return context.json(result, 202);
  });

  app.get('/api/restore/bootstrap/status', async (context) => {
    const availability = await getBootstrapRestoreAvailability();
    return context.json({
      available: availability.available,
      reason: availability.reason,
      archiveEncryptionConfigured: backupArchiveKeyIsConfigured(),
    });
  });

  app.post('/api/restore/bootstrap/imports', async (context) => {
    const guard = await requireBootstrapRestore(context);
    if (!guard.ok) return guard.response;

    const maintenanceResponse = await rejectMutationDuringMaintenance(context);
    if (maintenanceResponse !== null) return maintenanceResponse;

    const body = await context.req.json().catch(() => null) as { manifest?: BackupArchiveManifest } | null;
    const manifest = body?.manifest;

    if (manifest === undefined) {
      return context.json(
        { error: { code: 'backup.invalid_import_payload', message: 'manifest is required' } },
        400,
      );
    }

    const result = await services.writeImportedManifest({ manifest });
    if (!result.ok) {
      if (result.reason === 'already_exists') {
        return context.json(
          { error: { code: 'backup.import_already_exists', message: 'Backup import already exists' } },
          409,
        );
      }

      return context.json(
        { error: { code: 'backup.invalid_import_manifest', message: 'Invalid backup manifest' } },
        400,
      );
    }

    return context.json({ backupId: result.backupId, partCount: result.partCount }, 201);
  });

  app.put('/api/restore/bootstrap/imports/:backupId/parts/:partFileName', async (context) => {
    const guard = await requireBootstrapRestore(context);
    if (!guard.ok) return guard.response;

    const maintenanceResponse = await rejectMutationDuringMaintenance(context);
    if (maintenanceResponse !== null) return maintenanceResponse;

    const backupId = context.req.param('backupId');
    const partFileName = context.req.param('partFileName');
    const result = await services.writeImportedPart({
      backupId,
      partFileName,
      body: context.req.raw.body,
    });

    if (!result.ok) {
      if (result.reason === 'already_exists') {
        return context.json(
          { error: { code: 'backup.import_part_already_exists', message: 'Backup part already exists' } },
          409,
        );
      }

      return context.json(
        { error: { code: 'backup.invalid_import_part', message: 'Invalid backup part upload' } },
        400,
      );
    }

    return context.json({ uploaded: true }, 201);
  });

  app.post('/api/restore/bootstrap/restore', async (context) => {
    const guard = await requireBootstrapRestore(context);
    if (!guard.ok) return guard.response;

    const maintenanceResponse = await rejectMutationDuringMaintenance(context);
    if (maintenanceResponse !== null) return maintenanceResponse;

    if (backupQueue === undefined) {
      return context.json(
        { error: { code: 'backup.queue_unavailable', message: 'Backup queue unavailable' } },
        503,
      );
    }

    if (!backupArchiveKeyIsConfigured()) {
      return context.json(
        {
          error: {
            code: 'backup.archive_encryption_key_missing',
            message: 'Document encryption keys are not configured.',
          },
        },
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

    if (!(await services.backupIsRestorable({ backupId }))) {
      return context.json(
        { error: { code: 'backup.not_restorable', message: 'Backup set is incomplete or invalid' } },
        409,
      );
    }

    const result = await backupQueue.enqueueRestoreBackup({ backupId });
    return context.json(result, 202);
  });
}
