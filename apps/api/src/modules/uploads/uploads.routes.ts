import type { Context, Hono } from 'hono';
import type { Config } from '../config/config.js';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { DocumentsServices, UploadConflictStrategy } from '../documents/documents.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';
import type { createAuditServices } from '../audit/audit.services.js';
import type { createActivityServices } from '../activity/activity.services.js';
import { requireCanMutateVaultDocuments } from '../vaults/vaults.middleware.js';
import { createUploadsServices } from './uploads.services.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import { getUploadConflictResponse } from './upload-conflict-response.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData & { replaceExisting?: boolean }) => Promise<void>;
};

function parseUploadConflictStrategy(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return { valid: true as const, strategy: undefined };
  }

  if (typeof value !== 'string') {
    return { valid: false as const };
  }

  const normalized = value.trim();
  if (normalized === 'skip' || normalized === 'keep_both' || normalized === 'new_version') {
    return { valid: true as const, strategy: normalized as UploadConflictStrategy };
  }

  return { valid: false as const };
}

async function parseCompleteUploadConflictStrategy(context: Context<ServerContext>) {
  const queryStrategy = parseUploadConflictStrategy(context.req.query('conflictStrategy'));
  if (!queryStrategy.valid || queryStrategy.strategy !== undefined) {
    return queryStrategy;
  }

  const contentType = context.req.header('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return queryStrategy;
  }

  const body = await context.req.json().catch(() => ({})) as { conflictStrategy?: unknown };
  return parseUploadConflictStrategy(body.conflictStrategy);
}

function parseNullableFolderId(value: unknown) {
  if (value === undefined || value === null || value === '' || value === 'root') {
    return { valid: true as const, folderId: null };
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return { valid: true as const, folderId: value.trim() };
  }

  return { valid: false as const };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function parseJsonObject(context: Context<ServerContext>) {
  const body = await context.req.json().catch(() => null) as unknown;

  if (!isRecord(body)) {
    return null;
  }

  return body;
}

function getUploadDestinationErrorResponse(message: string) {
  if (message === 'parent_not_found' || message === 'folder_not_found') {
    return {
      status: 404,
      body: { error: { code: 'folder.not_found', message: 'Folder not found' } },
    };
  }

  if (message === 'path_too_long') {
    return {
      status: 400,
      body: { error: { code: 'folder.path_too_long', message: 'Folder path is too long' } },
    };
  }

  if (message === 'duplicate_name') {
    return {
      status: 409,
      body: { error: { code: 'folder.duplicate_name', message: 'A folder with this name already exists here' } },
    };
  }

  if (
    message === 'invalid_relative_path'
    || message === 'invalid_name'
    || message === 'name_too_long'
    || message === 'invalid_path_separator'
    || message === 'max_depth_exceeded'
  ) {
    return {
      status: 400,
      body: { error: { code: 'folder.invalid_relative_path', message: 'Relative path is invalid' } },
    };
  }

  return null;
}

export function registerUploadRoutes({
  app,
  db,
  config,
  documentsServices,
  documentQueue,
  auditServices,
  activityServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  config: Config;
  documentsServices: DocumentsServices;
  documentQueue?: DocumentQueue;
  auditServices?: ReturnType<typeof createAuditServices>;
  activityServices?: ReturnType<typeof createActivityServices>;
}) {
  const uploadsServices = createUploadsServices({
    db,
    documentsServices,
    stagingPath: config.uploads.stagingPath,
    partSizeBytes: config.uploads.partSizeBytes,
    maxFileSizeBytes: config.uploads.maxFileSizeBytes,
    sessionTtlHours: config.uploads.sessionTtlHours,
  });

  app.post('/api/vaults/:vaultId/uploads/init', requireCanMutateVaultDocuments({ auditServices }), async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const body = await parseJsonObject(context);
    if (body === null) {
      return context.json(
        { error: { code: 'upload.invalid_payload', message: 'fileName and totalSize are required' } },
        400,
      );
    }
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream';
    const totalSize = Number(body.totalSize);
    const parsedFolderId = parseNullableFolderId(body.folderId);
    const relativePath = typeof body.relativePath === 'string' && body.relativePath.trim().length > 0
      ? body.relativePath
      : null;

    if (fileName.length === 0 || !Number.isFinite(totalSize)) {
      return context.json(
        { error: { code: 'upload.invalid_payload', message: 'fileName and totalSize are required' } },
        400,
      );
    }

    if (!parsedFolderId.valid) {
      return context.json(
        { error: { code: 'folder.invalid_id', message: 'Invalid folder id' } },
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
        folderId: parsedFolderId.folderId,
        relativePath,
      });

      return context.json({ upload }, 201);
    } catch (error) {
      if (error instanceof Error && error.name === 'UploadTooLargeError') {
        return context.json(
          { error: { code: 'upload.file_too_large', message: error.message } },
          413,
        );
      }

      const destinationError = error instanceof Error
        ? getUploadDestinationErrorResponse(error.message)
        : null;
      if (destinationError !== null) {
        return context.json(destinationError.body, destinationError.status as any);
      }

      return context.json(
        { error: { code: 'upload.invalid_payload', message: error instanceof Error ? error.message : 'Invalid upload payload' } },
        400,
      );
    }
  });

  app.get('/api/vaults/:vaultId/uploads', requireCanMutateVaultDocuments({ auditServices }), async (context) => {
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

  app.get('/api/vaults/:vaultId/uploads/:uploadId', requireCanMutateVaultDocuments({ auditServices }), async (context) => {
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

  app.put('/api/vaults/:vaultId/uploads/:uploadId/parts/:partNumber', requireCanMutateVaultDocuments({ auditServices }), async (context) => {
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

  app.post('/api/vaults/:vaultId/uploads/:uploadId/complete', requireCanMutateVaultDocuments({ auditServices }), async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const uploadId = context.req.param('uploadId');
    const parsedConflictStrategy = await parseCompleteUploadConflictStrategy(context);

    if (!parsedConflictStrategy.valid) {
      return context.json(
        { error: { code: 'upload.invalid_conflict_strategy', message: 'Invalid upload conflict strategy' } },
        400,
      );
    }

    try {
      const result = await uploadsServices.completeUpload({
        uploadId,
        vaultId,
        userId,
        conflictStrategy: parsedConflictStrategy.strategy,
      });

      if (result === null) {
        return context.json({ error: { code: 'upload.not_found', message: 'Upload session not found' } }, 404);
      }

      if (result.duplicate) {
        return context.json(
          {
            ...getUploadConflictResponse(result),
            upload: result.upload,
          },
          409,
        );
      }

      if (result.skipped) {
        return context.json({
          upload: result.upload,
          document: null,
          documentVersion: null,
          documentVersionId: null,
          skipped: true,
          existingId: result.existingId,
          conflictType: result.conflictType,
        }, 200);
      }

      if (result.document !== null) {
        const actor = getAuditActorFromContext(context);
        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.documentUploaded,
          eventCategory: 'document',
          outcome: 'success',
          actor,
          vaultId,
          documentId: result.document.id,
          target: { type: 'document', id: result.document.id, displayName: result.document.name },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: {
            file_name: result.document.originalName,
            file_size: result.document.originalSize,
            mime_type: result.document.mimeType,
          },
        });
        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.documentCreated,
          entityType: 'document',
          entityId: result.document.id,
          actor,
          vaultId,
          documentId: result.document.id,
          target: { type: 'document', id: result.document.id, displayName: result.document.name },
          source: 'web',
          metadata: {
            document_name: result.document.name,
            file_name: result.document.originalName,
            file_size: result.document.originalSize,
            mime_type: result.document.mimeType,
            folder_id: result.document.folderId,
          },
        });

        if (result.documentVersion !== null) {
          const versionMetadata = {
            document_version_id: result.documentVersion.id,
            version_number: result.documentVersion.versionNumber,
            file_name: result.documentVersion.originalName,
            mime_type: result.documentVersion.mimeType,
            original_sha256_hash: result.documentVersion.originalSha256Hash,
            processing_status: result.documentVersion.processingStatus,
            restored_from_version_id: result.documentVersion.restoredFromVersionId,
          };
          const auditEvent = await auditServices?.emitAuditEvent({
            eventType: AUDIT_EVENT_TYPES.documentVersionCreated,
            eventCategory: 'document',
            outcome: 'success',
            actor,
            vaultId,
            documentId: result.document.id,
            target: {
              type: 'document_version',
              id: result.documentVersion.id,
              displayName: result.documentVersion.originalName,
            },
            source: 'web',
            requestContext: getAuditRequestContext(context),
            metadata: versionMetadata,
          });
          await activityServices?.emitActivityEvent({
            activityType: ACTIVITY_EVENT_TYPES.documentVersionCreated,
            entityType: 'document',
            entityId: result.document.id,
            actor,
            vaultId,
            documentId: result.document.id,
            target: {
              type: 'document_version',
              id: result.documentVersion.id,
              displayName: result.documentVersion.originalName,
            },
            source: 'web',
            auditEventId: auditEvent?.id,
            metadata: versionMetadata,
          });
        }
      }

      if (
        documentQueue !== undefined
        && result.document !== null
        && result.documentVersion !== null
      ) {
        await documentQueue.enqueueProcessDocument({
          documentId: result.document.id,
          documentVersionId: result.documentVersion.id,
          vaultId,
        });
        await documentsServices.updateDocumentVersionProcessingStatus({
          documentId: result.document.id,
          documentVersionId: result.documentVersion.id,
          vaultId,
          processingStatus: 'queued',
        });
        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.documentProcessingStatusChanged,
          entityType: 'document',
          entityId: result.document.id,
          actor: { type: 'system', displayName: 'System' },
          vaultId,
          documentId: result.document.id,
          target: { type: 'document', id: result.document.id, displayName: result.document.name },
          source: 'background',
          metadata: { processing_status: 'queued' },
        });
      }

      return context.json({
        upload: result.upload,
        document: result.document,
        documentVersion: result.documentVersion,
        documentVersionId: result.documentVersion?.id ?? null,
        skipped: false,
      }, 201);
    } catch (error) {
      return context.json(
        { error: { code: 'upload.incomplete', message: error instanceof Error ? error.message : 'Could not complete upload' } },
        400,
      );
    }
  });

  app.post('/api/vaults/:vaultId/uploads/:uploadId/abort', requireCanMutateVaultDocuments({ auditServices }), async (context) => {
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
