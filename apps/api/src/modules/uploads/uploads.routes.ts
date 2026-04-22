import type { Hono } from 'hono';
import type { Config } from '../config/config.js';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { DocumentsServices } from '../documents/documents.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';
import { requireVaultPermission } from '../vaults/vaults.middleware.js';
import { createUploadsServices } from './uploads.services.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData & { replaceExisting?: boolean }) => Promise<void>;
};

export function registerUploadRoutes({
  app,
  db,
  config,
  documentsServices,
  documentQueue,
}: {
  app: Hono<ServerContext>;
  db: Database;
  config: Config;
  documentsServices: DocumentsServices;
  documentQueue?: DocumentQueue;
}) {
  const uploadsServices = createUploadsServices({
    db,
    documentsServices,
    stagingPath: config.uploads.stagingPath,
    partSizeBytes: config.uploads.partSizeBytes,
    maxFileSizeBytes: config.uploads.maxFileSizeBytes,
    sessionTtlHours: config.uploads.sessionTtlHours,
  });

  app.post('/api/vaults/:vaultId/uploads/init', requireVaultPermission('documents.create'), async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const body = await context.req.json();
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream';
    const totalSize = Number(body.totalSize);

    if (fileName.length === 0 || !Number.isFinite(totalSize)) {
      return context.json(
        { error: { code: 'upload.invalid_payload', message: 'fileName and totalSize are required' } },
        400,
      );
    }

    try {
      const upload = await uploadsServices.initUpload({
        vaultId,
        userId,
        fileName,
        mimeType,
        totalSize,
      });

      return context.json({ upload }, 201);
    } catch (error) {
      if (error instanceof Error && error.name === 'UploadTooLargeError') {
        return context.json(
          { error: { code: 'upload.file_too_large', message: error.message } },
          413,
        );
      }

      return context.json(
        { error: { code: 'upload.invalid_payload', message: error instanceof Error ? error.message : 'Invalid upload payload' } },
        400,
      );
    }
  });

  app.get('/api/vaults/:vaultId/uploads', requireVaultPermission('documents.create'), async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const activeOnly = context.req.query('active') === 'true';
    const uploads = await uploadsServices.listUploadSessions({
      vaultId,
      userId,
      statuses: activeOnly ? ['initialized', 'uploading', 'paused', 'failed'] : undefined,
    });

    return context.json({ uploads });
  });

  app.get('/api/vaults/:vaultId/uploads/:uploadId', requireVaultPermission('documents.create'), async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const uploadId = context.req.param('uploadId');
    const upload = await uploadsServices.getUploadSession({ uploadId, vaultId, userId });

    if (upload === null) {
      return context.json({ error: { code: 'upload.not_found', message: 'Upload session not found' } }, 404);
    }

    return context.json({ upload });
  });

  app.put('/api/vaults/:vaultId/uploads/:uploadId/parts/:partNumber', requireVaultPermission('documents.create'), async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const uploadId = context.req.param('uploadId');
    const partNumber = Number(context.req.param('partNumber'));

    if (!Number.isInteger(partNumber) || partNumber < 1) {
      return context.json({ error: { code: 'upload.invalid_part', message: 'Invalid part number' } }, 400);
    }

    const arrayBuffer = await context.req.arrayBuffer();

    try {
      const upload = await uploadsServices.uploadPart({
        uploadId,
        vaultId,
        userId,
        partNumber,
        fileData: Buffer.from(arrayBuffer),
      });

      if (upload === null) {
        return context.json({ error: { code: 'upload.not_found', message: 'Upload session not found' } }, 404);
      }

      return context.json({ upload });
    } catch (error) {
      return context.json(
        { error: { code: 'upload.invalid_part', message: error instanceof Error ? error.message : 'Could not upload part' } },
        400,
      );
    }
  });

  app.post('/api/vaults/:vaultId/uploads/:uploadId/complete', requireVaultPermission('documents.create'), async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const uploadId = context.req.param('uploadId');

    try {
      const result = await uploadsServices.completeUpload({ uploadId, vaultId, userId });

      if (result === null) {
        return context.json({ error: { code: 'upload.not_found', message: 'Upload session not found' } }, 404);
      }

      if (result.duplicate) {
        return context.json(
          {
            error: {
              code: 'document.duplicate',
              message: 'A document with the same content already exists in this vault',
              existingId: result.existingId,
            },
            upload: result.upload,
          },
          409,
        );
      }

      if (documentQueue !== undefined && result.document !== null) {
        await documentQueue.enqueueProcessDocument({
          documentId: result.document.id,
          vaultId,
        });
      }

      return context.json({ upload: result.upload, document: result.document }, 201);
    } catch (error) {
      return context.json(
        { error: { code: 'upload.incomplete', message: error instanceof Error ? error.message : 'Could not complete upload' } },
        400,
      );
    }
  });

  app.post('/api/vaults/:vaultId/uploads/:uploadId/abort', requireVaultPermission('documents.create'), async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const uploadId = context.req.param('uploadId');
    const upload = await uploadsServices.abortUpload({ uploadId, vaultId, userId });

    if (upload === null) {
      return context.json({ error: { code: 'upload.not_found', message: 'Upload session not found' } }, 404);
    }

    return context.json({ upload });
  });
}
