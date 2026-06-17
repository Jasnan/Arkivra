import type { Hono } from 'hono';
import type { AdminAiServices } from '../admin/ai/ai.services.js';
import type { EmbeddingIndexQueue } from '../ai/indexing/index.js';
import type { createActivityServices } from '../activity/activity.services.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import { requireCanMutateVaultDocuments } from '../vaults/vaults.middleware.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';
import { buildUserDocumentLanguageMetadata } from './document-language.js';
import type { DocumentsServices } from './documents.services.js';
import {
  getFolderPathLabel,
  isRecord,
  parseImpactLimit,
  parseJsonObject,
  parseNullableFolderId,
  parseUploadConflictStrategy,
  serializeDeletionImpact,
} from './documents.route-helpers.js';
import { getUploadConflictResponse } from '../uploads/upload-conflict-response.js';
import { enqueueSemanticReindexForRestoredDocument } from './documents.semantic-reindex.js';

export type DocumentLifecycleQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};

export function registerDocumentLifecycleRoutes({
  app,
  db,
  documentsServices,
  documentQueue,
  auditServices,
  activityServices,
  adminAiServices,
  embeddingIndexQueue,
}: {
  app: Hono<ServerContext>;
  db: Database;
  documentsServices: DocumentsServices;
  documentQueue?: DocumentLifecycleQueue;
  auditServices?: ReturnType<typeof createAuditServices>;
  activityServices?: ReturnType<typeof createActivityServices>;
  adminAiServices?: AdminAiServices;
  embeddingIndexQueue?: EmbeddingIndexQueue;
}) {
  app.patch(
    '/api/vaults/:vaultId/documents/:documentId',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const body = await parseJsonObject(context);
      if (body === null) {
        return context.json(
          { error: { code: 'document.invalid_payload', message: 'Invalid document payload' } },
          400,
        );
      }
      const actor = getAuditActorFromContext(context);

      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';

        if (name.length === 0) {
          return context.json(
            { error: { code: 'document.invalid_name', message: 'Document name is required' } },
            400,
          );
        }

        const before = await documentsServices.getDocument({ documentId, vaultId });
        const result = await documentsServices.renameDocument({ documentId, vaultId, name });

        if (!result.success && result.reason === 'duplicate_name') {
          return context.json(
            {
              error: {
                code: 'document.duplicate_name',
                message: 'A document with this name already exists here',
                existingId: result.existingId,
              },
            },
            409,
          );
        }

        if (!result.success) {
          return context.json(
            { error: { code: 'document.not_found', message: 'Document not found' } },
            404,
          );
        }

        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.documentMetadataUpdated,
          entityType: 'document',
          entityId: documentId,
          actor,
          vaultId,
          documentId,
          target: { type: 'document', id: documentId, displayName: result.document.name },
          source: 'web',
          metadata: {
            changed_fields: ['name'],
            previous_name: before?.name ?? null,
            next_name: result.document.name,
          },
        });

        return context.json({ document: result.document });
      }

      if (body.language !== undefined) {
        const languageInput = body.language;
        const languageCode =
          languageInput === null
            ? null
            : typeof languageInput === 'string'
              ? languageInput
              : isRecord(languageInput) && typeof languageInput.code === 'string'
                ? languageInput.code
                : undefined;

        if (languageCode === undefined) {
          return context.json(
            { error: { code: 'document.invalid_language', message: 'Invalid document language' } },
            400,
          );
        }

        const language = buildUserDocumentLanguageMetadata(languageCode);
        if (languageCode !== null && language === null) {
          return context.json(
            {
              error: {
                code: 'document.unsupported_language',
                message: 'Unsupported document language',
              },
            },
            400,
          );
        }

        const before = await documentsServices.getDocument({ documentId, vaultId });
        const doc = await documentsServices.updateDocumentLanguage({
          documentId,
          vaultId,
          language,
        });

        if (doc === null) {
          return context.json(
            { error: { code: 'document.not_found', message: 'Document not found' } },
            404,
          );
        }

        await activityServices?.emitActivityEvent({
          activityType: ACTIVITY_EVENT_TYPES.documentMetadataUpdated,
          entityType: 'document',
          entityId: documentId,
          actor,
          vaultId,
          documentId,
          target: { type: 'document', id: documentId, displayName: before?.name ?? documentId },
          source: 'web',
          metadata: {
            changed_fields: ['language'],
            previous_language: before?.language?.name ?? null,
            next_language: doc.language?.name ?? null,
          },
        });

        return context.json({ document: doc });
      }

      return context.json(
        { error: { code: 'document.invalid_payload', message: 'Provide name or language' } },
        400,
      );
    },
  );

  app.post(
    '/api/vaults/:vaultId/documents/:documentId/move',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const body = await parseJsonObject(context);
      if (body === null) {
        return context.json(
          { error: { code: 'document.invalid_payload', message: 'Invalid document payload' } },
          400,
        );
      }
      const parsedFolderId = parseNullableFolderId(body.folderId);

      if (!parsedFolderId.valid || parsedFolderId.folderId === undefined) {
        return context.json(
          { error: { code: 'folder.invalid_id', message: 'Invalid folder id' } },
          400,
        );
      }

      const before = await documentsServices.getDocument({ documentId, vaultId });
      const result = await documentsServices.moveDocument({
        documentId,
        vaultId,
        folderId: parsedFolderId.folderId,
      });

      if (!result.success && result.reason === 'folder_not_found') {
        return context.json(
          { error: { code: 'folder.not_found', message: 'Folder not found' } },
          404,
        );
      }

      if (!result.success && result.reason === 'duplicate_name') {
        return context.json(
          {
            error: {
              code: 'document.duplicate_name',
              message: 'A document with this name already exists here',
              existingId: result.existingId,
            },
          },
          409,
        );
      }

      if (!result.success) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      const fromPath =
        activityServices === undefined
          ? null
          : await getFolderPathLabel({ db, vaultId, folderId: before?.folderId ?? null });
      const toPath =
        activityServices === undefined
          ? null
          : await getFolderPathLabel({ db, vaultId, folderId: result.document.folderId });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.documentMoved,
        entityType: 'document',
        entityId: documentId,
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: { type: 'document', id: documentId, displayName: before?.name ?? documentId },
        source: 'web',
        metadata: {
          from_folder_id: before?.folderId ?? null,
          to_folder_id: result.document.folderId,
          from_path: fromPath ?? 'Unknown location',
          to_path: toPath ?? 'Unknown location',
        },
      });

      return context.json({ document: result.document });
    },
  );

  app.post(
    '/api/vaults/:vaultId/documents/:documentId/reprocess',
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
              code: 'document.reprocess_unavailable',
              message: 'Document reprocessing is not available in this environment',
            },
          },
          503,
        );
      }

      const documentId = context.req.param('documentId');
      const document = await documentsServices.getDocument({ documentId, vaultId });

      if (document === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      const version = await documentsServices.resolveLatestDocumentVersion({
        documentId,
        vaultId,
      });

      if (version === null) {
        return context.json(
          { error: { code: 'document.version_not_found', message: 'Document version not found' } },
          404,
        );
      }

      await documentQueue.enqueueProcessDocument({
        documentId,
        documentVersionId: version.id,
        vaultId,
        replaceExisting: true,
      });
      await documentsServices.updateDocumentVersionProcessingStatus({
        documentId,
        documentVersionId: version.id,
        vaultId,
        processingStatus: 'queued',
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.documentProcessingStatusChanged,
        entityType: 'document',
        entityId: documentId,
        actor: { type: 'system', displayName: 'System' },
        vaultId,
        documentId,
        target: { type: 'document', id: documentId, displayName: document.name },
        source: 'background',
        metadata: { processing_status: 'queued', reprocess: true },
      });

      return context.json(
        {
          queued: true,
          documentId,
          mode: 'source_file',
        },
        202,
      );
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/deletion-impact',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const limit = parseImpactLimit(context.req.query('limit'));
      if (limit === null) {
        return context.json(
          { error: { code: 'document.invalid_limit', message: 'limit must be an integer >= 0' } },
          400,
        );
      }

      const result = await documentsServices.getDocumentDeletionImpact({
        vaultId,
        documentId: context.req.param('documentId'),
        limit,
        includeDeletedDocument: context.req.query('includeDeleted') === 'true',
      });

      if (!result.success) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      return context.json({
        impact: {
          ...serializeDeletionImpact(result.impact),
          versionCount: result.impact.versionCount,
        },
      });
    },
  );

  // Soft delete document
  app.delete(
    '/api/vaults/:vaultId/documents/:documentId',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');
      const userId = context.get('userId');

      if (vaultId === null || userId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const document = await documentsServices.getDocument({ documentId, vaultId });
      const doc = await documentsServices.softDeleteDocument({
        documentId,
        vaultId,
        deletedBy: userId,
      });

      if (doc === null) {
        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.documentDeleteFailed,
          eventCategory: 'document',
          outcome: 'failure',
          actor: getAuditActorFromContext(context),
          vaultId,
          documentId,
          target: { type: 'document', id: documentId },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: {
            document_name: document?.name ?? undefined,
            file_name: document?.originalName ?? document?.name ?? undefined,
            deletion_type: 'soft',
            reason: 'not_found',
          },
        });

        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.documentDeleted,
        eventCategory: 'document',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: { type: 'document', id: documentId, displayName: document?.name ?? null },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: {
          document_name: document?.name ?? undefined,
          file_name: document?.originalName ?? document?.name ?? undefined,
          deletion_type: 'soft',
        },
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.documentDeleted,
        entityType: 'document',
        entityId: documentId,
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: { type: 'document', id: documentId, displayName: document?.name ?? documentId },
        source: 'web',
        metadata: {
          document_name: document?.name ?? null,
          deletion_type: 'soft',
        },
      });

      return context.body(null, 204);
    },
  );

  // Restore soft-deleted document
  app.post(
    '/api/vaults/:vaultId/documents/:documentId/restore',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      let parsedConflictStrategy: ReturnType<typeof parseUploadConflictStrategy> = {
        valid: true,
        strategy: undefined,
      };

      if ((context.req.header('content-type') ?? '').includes('application/json')) {
        const body = await context.req.json().catch(() => null);

        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          return context.json(
            { error: { code: 'document.invalid_payload', message: 'Expected JSON object' } },
            400,
          );
        }

        parsedConflictStrategy = parseUploadConflictStrategy(
          (body as { conflictStrategy?: unknown }).conflictStrategy,
        );

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
      }

      const doc = await documentsServices.restoreDocument({
        documentId,
        vaultId,
        conflictStrategy: parsedConflictStrategy.strategy,
      });

      if (!doc.success && doc.reason === 'duplicate') {
        return context.json(
          getUploadConflictResponse({
            existingId: doc.existingId,
            duplicateScope: 'active',
            conflictType: 'hash',
          }),
          409,
        );
      }

      if (!doc.success && doc.reason === 'skipped') {
        return context.json({
          document: null,
          skipped: true,
          existingId: doc.existingId,
          conflictType: 'hash',
        });
      }

      if (!doc.success) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found or not deleted' } },
          404,
        );
      }

      await enqueueSemanticReindexForRestoredDocument({
        db,
        adminAiServices,
        embeddingIndexQueue,
        documentsServices,
        documentId: doc.id,
        vaultId,
      });

      const auditEvent = await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.documentRestored,
        eventCategory: 'document',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId: doc.id,
        target: { type: 'document', id: doc.id, displayName: doc.originalName },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: {
          document_name: doc.originalName,
          folder_id: doc.folderId,
          hierarchy_recreated: doc.hierarchyRecreated,
        },
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.documentRestored,
        entityType: 'document',
        entityId: doc.id,
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId: doc.id,
        target: { type: 'document', id: doc.id, displayName: doc.originalName },
        source: 'web',
        auditEventId: auditEvent?.id,
        metadata: {
          document_name: doc.originalName,
          folder_id: doc.folderId,
          hierarchy_recreated: doc.hierarchyRecreated,
        },
      });

      return context.json({
        document: {
          id: doc.id,
          folderId: doc.folderId,
          originalName: doc.originalName,
        },
        message: doc.hierarchyRecreated
          ? 'Original folders were recreated and file restored'
          : 'File restored to original location',
      });
    },
  );

  // Hard delete (permanently remove soft-deleted document)
  app.delete(
    '/api/vaults/:vaultId/documents/:documentId/permanent',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');
      const userId = context.get('userId');

      if (vaultId === null || userId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const document = await documentsServices.getDocument({ documentId, vaultId });
      const result = await documentsServices.hardDeleteDocument({ documentId, vaultId });

      if (!result.success) {
        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.documentDeleteFailed,
          eventCategory: 'document',
          outcome: 'failure',
          actor: getAuditActorFromContext(context),
          vaultId,
          documentId,
          target: { type: 'document', id: documentId, displayName: document?.name ?? null },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: {
            document_name: document?.name ?? undefined,
            file_name: document?.originalName ?? document?.name ?? undefined,
            deletion_type: 'permanent',
            reason: result.reason,
          },
        });

        return context.json(
          {
            error: {
              code: 'document.not_found',
              message: 'Document not found or not soft-deleted',
            },
          },
          404,
        );
      }

      const auditEvent = await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.documentDeleted,
        eventCategory: 'document',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: { type: 'document', id: documentId, displayName: document?.name ?? null },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: {
          document_name: document?.name ?? undefined,
          file_name: document?.originalName ?? document?.name ?? undefined,
          deletion_type: 'permanent',
        },
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.documentDeleted,
        entityType: 'document',
        entityId: documentId,
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: { type: 'document', id: documentId, displayName: document?.name ?? documentId },
        source: 'web',
        auditEventId: auditEvent?.id,
        metadata: {
          document_name: document?.name ?? null,
          deletion_type: 'permanent',
        },
      });

      return context.body(null, 204);
    },
  );
}
