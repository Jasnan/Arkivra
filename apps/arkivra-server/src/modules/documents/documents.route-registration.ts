import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { DocumentsServices } from './documents.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import type { createActivityServices } from '../activity/activity.services.js';
import type { AdminAiServices } from '../admin/ai/ai.services.js';
import type { EmbeddingIndexQueue } from '../ai/indexing/index.js';
import { SEARCH_SORT_VALUES } from '../search/search.types.js';
import { createDocumentsServices, normalizeDocumentFileName } from './documents.services.js';
import {
  requireCanMutateVaultDocuments,
  requireCanReadVault,
} from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';
import { createFoldersServices } from '../folders/folders.services.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import { getUploadConflictResponse } from '../uploads/upload-conflict-response.js';
import {
  getBrowserPreviewMimeType,
  getDocumentVersionAuditMetadata,
  getFolderDestinationErrorResponse,
  matchesEtag,
  parseJsonObject,
  parseNullableFolderId,
  parsePageNumber,
  parseSortBy,
  parseUploadConflictStrategy,
} from './documents.route-helpers.js';
import { registerDocumentLifecycleRoutes } from './documents.lifecycle.routes.js';
import { registerDocumentTrashRoutes } from './documents.trash.routes.js';
import { registerDocumentVersionRoutes } from './documents.version.routes.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};

export function registerDocumentRoutes({
  app,
  db,
  storage,
  encryption,
  services,
  documentQueue,
  retentionDays = 30,
  vaultServices,
  auditServices,
  activityServices,
  adminAiServices,
  embeddingIndexQueue,
}: {
  app: Hono<ServerContext>;
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  services?: DocumentsServices;
  documentQueue?: DocumentQueue;
  retentionDays?: number;
  vaultServices?: VaultsServices;
  auditServices?: ReturnType<typeof createAuditServices>;
  activityServices?: ReturnType<typeof createActivityServices>;
  adminAiServices?: AdminAiServices;
  embeddingIndexQueue?: EmbeddingIndexQueue;
}) {
  const documentsServices = services ?? createDocumentsServices({ db, storage, encryption });
  const vaultsServices = vaultServices ?? createVaultsServices({ db });
  const foldersServices = createFoldersServices({ db });

  registerDocumentTrashRoutes({ app, documentsServices, vaultsServices, retentionDays });

  // List documents in vault
  app.get(
    '/api/vaults/:vaultId/documents',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const includeDeleted = context.req.query('includeDeleted') === 'true';
      const tagId = context.req.query('tagId');
      const sortBy = parseSortBy(context.req.query('sortBy'));
      const parsedFolderId = parseNullableFolderId(context.req.query('folderId'));

      if (sortBy === null) {
        return context.json(
          {
            error: {
              code: 'document.invalid_sort_by',
              message: `sortBy must be one of ${SEARCH_SORT_VALUES.join(', ')}`,
            },
          },
          400,
        );
      }

      if (!parsedFolderId.valid) {
        return context.json(
          { error: { code: 'folder.invalid_id', message: 'Invalid folder id' } },
          400,
        );
      }

      const documents = await documentsServices.listDocuments({
        vaultId,
        includeDeleted,
        tagId,
        sortBy,
        folderId: parsedFolderId.folderId,
      });

      return context.json({ documents, retentionDays });
    },
  );

  // Upload document
  app.post(
    '/api/vaults/:vaultId/documents',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');
      const userId = context.get('userId');

      if (vaultId === null || userId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const contentType = context.req.header('content-type') ?? '';

      if (!contentType.includes('multipart/form-data')) {
        return context.json(
          { error: { code: 'document.invalid_upload', message: 'Expected multipart/form-data' } },
          400,
        );
      }

      const formData = await context.req.formData();
      const file = formData.get('file');

      if (!(file instanceof File)) {
        return context.json(
          { error: { code: 'document.missing_file', message: 'File field is required' } },
          400,
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const fileData = Buffer.from(arrayBuffer);
      const fileName = normalizeDocumentFileName(file.name || 'untitled');
      const mimeType = getBrowserPreviewMimeType(fileName, file.type || 'application/octet-stream');
      const parsedFolderId = parseNullableFolderId(formData.get('folderId'));
      const relativePathField = formData.get('relativePath');
      const relativePath =
        typeof relativePathField === 'string' && relativePathField.trim().length > 0
          ? relativePathField
          : null;
      const parsedConflictStrategy = parseUploadConflictStrategy(formData.get('conflictStrategy'));

      if (!parsedFolderId.valid || parsedFolderId.folderId === undefined) {
        return context.json(
          { error: { code: 'folder.invalid_id', message: 'Invalid folder id' } },
          400,
        );
      }

      if (!parsedConflictStrategy.valid) {
        return context.json(
          {
            error: {
              code: 'upload.invalid_conflict_strategy',
              message: 'Invalid upload conflict strategy',
            },
          },
          400,
        );
      }

      const destination =
        parsedFolderId.folderId === null && relativePath === null
          ? { success: true as const, folderId: null, relativePath: null }
          : await foldersServices.resolveUploadDestination({
              vaultId,
              parentId: parsedFolderId.folderId,
              relativePath,
              fileName,
              createdBy: userId,
            });

      if (!destination.success) {
        const response = getFolderDestinationErrorResponse(destination.reason);
        return context.json(response.body, response.status as any);
      }

      const result = await documentsServices.uploadDocument({
        vaultId,
        userId,
        fileName,
        mimeType,
        fileData,
        folderId: destination.folderId,
        conflictStrategy: parsedConflictStrategy.strategy,
      });

      if (result.duplicate) {
        return context.json(getUploadConflictResponse(result), 409);
      }

      if (result.skipped) {
        return context.json(
          {
            document: null,
            documentVersion: null,
            documentVersionId: null,
            skipped: true,
            existingId: result.existingId,
            conflictType: result.conflictType,
          },
          200,
        );
      }

      if (result.document !== null) {
        const actor = getAuditActorFromContext(context);
        const documentVersion = result.documentVersion;

        if (documentVersion !== null && documentVersion.versionNumber > 1) {
          const auditEvent = await auditServices?.emitAuditEvent({
            eventType: AUDIT_EVENT_TYPES.documentVersionCreated,
            eventCategory: 'document',
            outcome: 'success',
            actor,
            vaultId,
            documentId: result.document.id,
            target: {
              type: 'document_version',
              id: documentVersion.id,
              displayName: documentVersion.originalName,
            },
            source: 'web',
            requestContext: getAuditRequestContext(context),
            metadata: getDocumentVersionAuditMetadata(documentVersion),
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
              id: documentVersion.id,
              displayName: documentVersion.originalName,
            },
            source: 'web',
            auditEventId: auditEvent?.id,
            metadata: getDocumentVersionAuditMetadata(documentVersion),
          });
        } else {
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
        }
      }

      // Enqueue document processing job
      if (
        documentQueue !== undefined &&
        result.document !== null &&
        result.documentVersion !== null
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

      return context.json(
        {
          document: result.document,
          documentVersion: result.documentVersion,
          documentVersionId: result.documentVersion?.id ?? null,
          skipped: false,
        },
        201,
      );
    },
  );

  app.post(
    '/api/vaults/:vaultId/documents/retry-processing',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      if (documentQueue === undefined) {
        return context.json(
          {
            error: {
              code: 'document.retry_processing_unavailable',
              message: 'Document processing retry is not available in this environment',
            },
          },
          503,
        );
      }

      const body = await parseJsonObject(context);
      if (body === null) {
        return context.json(
          { error: { code: 'document.invalid_payload', message: 'Invalid retry payload' } },
          400,
        );
      }

      const rawDocumentIds = body.documentIds;
      if (
        rawDocumentIds !== undefined &&
        (!Array.isArray(rawDocumentIds) || rawDocumentIds.some((id) => typeof id !== 'string'))
      ) {
        return context.json(
          { error: { code: 'document.invalid_ids', message: 'documentIds must be strings' } },
          400,
        );
      }
      const documentIds = Array.isArray(rawDocumentIds) ? rawDocumentIds : undefined;

      const parsedFolderId =
        body.folderId === undefined
          ? { valid: true as const, folderId: undefined }
          : parseNullableFolderId(body.folderId);
      if (!parsedFolderId.valid) {
        return context.json(
          { error: { code: 'folder.invalid_id', message: 'Invalid folder id' } },
          400,
        );
      }

      const includeSubfolders =
        body.includeSubfolders === undefined ? true : body.includeSubfolders === true;
      if (
        body.includeSubfolders !== undefined &&
        typeof body.includeSubfolders !== 'boolean'
      ) {
        return context.json(
          {
            error: {
              code: 'document.invalid_retry_options',
              message: 'includeSubfolders must be a boolean',
            },
          },
          400,
        );
      }

      const force = body.force === undefined ? false : body.force === true;
      if (body.force !== undefined && typeof body.force !== 'boolean') {
        return context.json(
          {
            error: {
              code: 'document.invalid_retry_options',
              message: 'force must be a boolean',
            },
          },
          400,
        );
      }

      const retryPlan = await documentsServices.listDocumentProcessingRetryCandidates({
        vaultId,
        documentIds,
        folderId: parsedFolderId.folderId,
        includeSubfolders,
        force,
      });
      const actor = getAuditActorFromContext(context);

      for (const candidate of retryPlan.candidates) {
        await documentQueue.enqueueProcessDocument({
          documentId: candidate.documentId,
          documentVersionId: candidate.documentVersionId,
          vaultId,
          replaceExisting: true,
        });
        await documentsServices.updateDocumentVersionProcessingStatus({
          documentId: candidate.documentId,
          documentVersionId: candidate.documentVersionId,
          vaultId,
          processingStatus: 'queued',
        });
        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.documentProcessingStatusChanged,
          entityType: 'document',
          entityId: candidate.documentId,
          actor,
          vaultId,
          documentId: candidate.documentId,
          target: { type: 'document', id: candidate.documentId, displayName: candidate.name },
          source: 'web',
          metadata: {
            processing_status: 'queued',
            retry: true,
            force,
          },
        });
      }

      await auditServices?.emitAuditEvent({
        eventType: 'document.processing_retry_queued',
        eventCategory: 'document',
        outcome: 'success',
        actor,
        vaultId,
        target: { type: 'vault', id: vaultId },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: {
          queued_count: retryPlan.candidates.length,
          skipped_count: retryPlan.skipped.length,
          matched_count: retryPlan.matchedCount,
          requested_count: retryPlan.requestedCount,
          force,
          include_subfolders: includeSubfolders,
        },
      });

      return context.json(
        {
          queued: retryPlan.candidates.length,
          skipped: retryPlan.skipped.length,
          matched: retryPlan.matchedCount,
          requested: retryPlan.requestedCount,
          documents: retryPlan.candidates.map((candidate) => ({
            documentId: candidate.documentId,
            documentVersionId: candidate.documentVersionId,
            processingStatus: 'queued',
          })),
          skippedDocuments: retryPlan.skipped,
        },
        202,
      );
    },
  );

  // Get document details
  app.get(
    '/api/vaults/:vaultId/documents/:documentId',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const document = await documentsServices.getDocument({ documentId, vaultId });

      if (document === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.documentViewed,
        eventCategory: 'document',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: { type: 'document', id: documentId, displayName: document.name },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: { file_name: document.originalName, access_method: 'open' },
        dedupe: { windowMs: 5 * 60 * 1000 },
      });

      return context.json({ document });
    },
  );

  // Download document file
  app.get(
    '/api/vaults/:vaultId/documents/:documentId/download',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const includeDeleted = context.req.query('includeDeleted') === 'true';
      const result = await documentsServices.downloadDocument({
        documentId,
        vaultId,
        ...(includeDeleted ? { includeDeleted: true } : {}),
      });

      if (result === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.documentDownloaded,
        eventCategory: 'document',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: { type: 'document', id: documentId, displayName: result.fileName },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: { file_name: result.fileName, access_method: 'download' },
      });

      return new Response(result.fileData, {
        status: 200,
        headers: {
          'content-type': result.mimeType,
          'content-length': String(result.fileData.length),
          'content-disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
        },
      });
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/file',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const includeDeleted = context.req.query('includeDeleted') === 'true';
      const result = await documentsServices.previewDocumentFile({
        documentId,
        vaultId,
        ...(includeDeleted ? { includeDeleted: true } : {}),
      });

      if (result === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      return new Response(result.fileData, {
        status: 200,
        headers: {
          'content-type': getBrowserPreviewMimeType(result.fileName, result.mimeType),
          'content-length': String(result.fileData.length),
          'content-disposition': `inline; filename="${encodeURIComponent(result.fileName)}"`,
        },
      });
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/page/:pageRef',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const pageNumber = parsePageNumber(context.req.param('pageRef'));
      if (pageNumber === null) {
        return context.json(
          {
            error: {
              code: 'document.invalid_page_number',
              message: 'Page number must be an integer >= 1',
            },
          },
          400,
        );
      }

      const documentId = context.req.param('documentId');
      const includeDeleted = context.req.query('includeDeleted') === 'true';
      const result = await documentsServices.renderDocumentPagePreview({
        documentId,
        vaultId,
        pageNumber,
        ...(includeDeleted ? { includeDeleted: true } : {}),
      });

      if (result === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      if ('error' in result) {
        return context.json(
          {
            error: {
              code:
                result.error === 'invalid_page_number'
                  ? 'document.invalid_page_number'
                  : 'document.page_not_available',
              message:
                result.error === 'invalid_page_number'
                  ? 'Page number must be an integer >= 1'
                  : 'Page preview is not available for this document or page',
            },
          },
          result.error === 'invalid_page_number' ? 400 : 404,
        );
      }

      if (matchesEtag(context.req.header('if-none-match'), result.etag)) {
        return new Response(null, {
          status: 304,
          headers: {
            etag: result.etag,
            'cache-control': 'private, max-age=3600',
          },
        });
      }

      return new Response(result.fileData, {
        status: 200,
        headers: {
          'content-type': result.mimeType,
          'content-length': String(result.fileData.length),
          'cache-control': 'private, max-age=3600',
          etag: result.etag,
        },
      });
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/chunks',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const chunks = await documentsServices.listDocumentChunks({
        vaultId,
        documentId: context.req.param('documentId'),
      });

      if (chunks === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      return context.json({
        chunks: chunks.map((chunk) => ({
          ...chunk,
          createdAt: chunk.createdAt.toISOString(),
        })),
      });
    },
  );

  app.get(
    '/api/vaults/:vaultId/chunks/:chunkId/assets/:assetId',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const result = await documentsServices.getChunkAsset({
        vaultId,
        chunkId: context.req.param('chunkId'),
        assetId: context.req.param('assetId'),
      });

      if (result === null) {
        return context.json(
          { error: { code: 'chunk_asset.not_found', message: 'Chunk asset not found' } },
          404,
        );
      }

      if (matchesEtag(context.req.header('if-none-match'), result.etag)) {
        return new Response(null, {
          status: 304,
          headers: {
            etag: result.etag,
            'cache-control': 'private, max-age=3600',
            ...(result.sourceElementId !== null
              ? { 'x-arkivra-source-element-id': result.sourceElementId }
              : {}),
          },
        });
      }

      if ('inlinePayload' in result) {
        const payload = result.inlinePayload ?? '';
        return new Response(payload, {
          status: 200,
          headers: {
            'content-type': result.mimeType,
            'content-length': String(Buffer.byteLength(payload, 'utf8')),
            'cache-control': 'private, max-age=3600',
            etag: result.etag,
            ...(result.sourceElementId !== null
              ? { 'x-arkivra-source-element-id': result.sourceElementId }
              : {}),
          },
        });
      }

      return new Response(result.fileData, {
        status: 200,
        headers: {
          'content-type': result.mimeType,
          'content-length': String(result.fileData.length),
          'cache-control': 'private, max-age=3600',
          etag: result.etag,
          ...(result.sourceElementId !== null
            ? { 'x-arkivra-source-element-id': result.sourceElementId }
            : {}),
        },
      });
    },
  );

  registerDocumentVersionRoutes({
    app,
    db,
    documentsServices,
    auditServices,
    activityServices,
    adminAiServices,
    embeddingIndexQueue,
  });

  registerDocumentLifecycleRoutes({
    app,
    db,
    documentsServices,
    documentQueue,
    auditServices,
    activityServices,
    adminAiServices,
    embeddingIndexQueue,
  });

}
