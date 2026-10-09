import type { Hono } from 'hono';
import type { AdminAiServices } from '../admin/ai/ai.services.js';
import type { EmbeddingIndexQueue } from '../ai/indexing/index.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import type { createActivityServices } from '../activity/activity.services.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import { requireCanMutateVaultDocuments, requireCanReadVault } from '../vaults/vaults.middleware.js';
import type { DocumentsServices } from './documents.services.js';
import {
  getDocumentVersionAuditMetadata,
  matchesEtag,
  parseImpactLimit,
  parsePageNumber,
  serializeDeletionImpact,
  serializeDocumentVersion,
} from './documents.route-helpers.js';

export function registerDocumentVersionRoutes({
  app,
  db,
  documentsServices,
  auditServices,
  activityServices,
  adminAiServices,
  embeddingIndexQueue,
}: {
  app: Hono<ServerContext>;
  db: Database;
  documentsServices: DocumentsServices;
  auditServices?: ReturnType<typeof createAuditServices>;
  activityServices?: ReturnType<typeof createActivityServices>;
  adminAiServices?: AdminAiServices;
  embeddingIndexQueue?: EmbeddingIndexQueue;
}) {
  app.get(
    '/api/vaults/:vaultId/documents/:documentId/versions',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const versions = await documentsServices.listDocumentVersions({
        vaultId,
        documentId: context.req.param('documentId'),
      });

      if (versions === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      return context.json({
        versions: versions.map((version) => serializeDocumentVersion(version)),
      });
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/versions/:versionId',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const version = await documentsServices.resolveDocumentVersion({
        vaultId,
        documentId: context.req.param('documentId'),
        documentVersionId: context.req.param('versionId'),
      });

      if (version === null) {
        return context.json(
          { error: { code: 'document.version_not_found', message: 'Document version not found' } },
          404,
        );
      }

      return context.json({ version: serializeDocumentVersion(version, { includeContent: true }) });
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/versions/:versionId/download',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const result = await documentsServices.downloadDocumentVersion({
        vaultId,
        documentId,
        documentVersionId: context.req.param('versionId'),
      });

      if (result === null) {
        return context.json(
          { error: { code: 'document.version_not_found', message: 'Document version not found' } },
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
        target: {
          type: 'document_version',
          id: result.documentVersion.id,
          displayName: result.fileName,
        },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: getDocumentVersionAuditMetadata(result.documentVersion, {
          access_method: 'download',
        }),
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
    '/api/vaults/:vaultId/documents/:documentId/versions/:versionId/chunks',
    requireCanReadVault({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const chunks = await documentsServices.listDocumentVersionChunks({
        vaultId,
        documentId: context.req.param('documentId'),
        documentVersionId: context.req.param('versionId'),
      });

      if (chunks === null) {
        return context.json(
          { error: { code: 'document.version_not_found', message: 'Document version not found' } },
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
    '/api/vaults/:vaultId/documents/:documentId/versions/:versionId/pages/:pageRef/preview',
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

      const result = await documentsServices.renderDocumentVersionPagePreview({
        vaultId,
        documentId: context.req.param('documentId'),
        documentVersionId: context.req.param('versionId'),
        pageNumber,
      });

      if (result === null) {
        return context.json(
          { error: { code: 'document.version_not_found', message: 'Document version not found' } },
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
                  : 'Page preview is not available for this document version or page',
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

  app.post(
    '/api/vaults/:vaultId/documents/:documentId/versions/:versionId/restore',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');
      const userId = context.get('userId');

      if (vaultId === null || userId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const result = await documentsServices.restoreDocumentVersion({
        vaultId,
        documentId,
        documentVersionId: context.req.param('versionId'),
        restoredBy: userId,
      });

      if (!result.success) {
        const status = result.reason === 'not_found' ? 404 : 409;
        const code =
          result.reason === 'current_version'
            ? 'document.version_current'
            : result.reason === 'invalid_status'
              ? 'document.version_not_restorable'
              : 'document.version_not_found';
        const message =
          result.reason === 'current_version'
            ? 'Current version cannot be restored'
            : result.reason === 'invalid_status'
              ? 'Only completed historical versions can be restored'
              : 'Document version not found';

        return context.json({ error: { code, message } }, status as any);
      }

      if (adminAiServices !== undefined && embeddingIndexQueue !== undefined) {
        try {
          const settings = await adminAiServices.getSettings();
          if (settings.aiFeaturesEnabled) {
            const activeIndex = await createEmbeddingIndexServices({
              db,
            }).getActiveEmbeddingIndex();
            if (activeIndex !== null) {
              await embeddingIndexQueue.enqueueDocumentIndexing({
                embeddingIndexId: activeIndex.id,
                documentVersionId: result.documentVersion.id,
              });
            }
          }
        } catch (error) {
          console.error(
            `Could not enqueue semantic indexing after restoring version ${result.documentVersion.id}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      const auditEvent = await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.documentVersionRestored,
        eventCategory: 'document',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: {
          type: 'document_version',
          id: result.documentVersion.id,
          displayName: result.documentVersion.originalName,
        },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: getDocumentVersionAuditMetadata(result.documentVersion, {
          source_document_version_id: result.sourceVersion.id,
          source_version_number: result.sourceVersion.versionNumber,
          copied_embedding_index_ids: result.copiedEmbeddingIndexIds,
        }),
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.documentVersionRestored,
        entityType: 'document',
        entityId: documentId,
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: {
          type: 'document_version',
          id: result.documentVersion.id,
          displayName: result.documentVersion.originalName,
        },
        source: 'web',
        auditEventId: auditEvent?.id,
        metadata: getDocumentVersionAuditMetadata(result.documentVersion, {
          source_document_version_id: result.sourceVersion.id,
          source_version_number: result.sourceVersion.versionNumber,
        }),
      });

      return context.json(
        {
          version: serializeDocumentVersion(result.documentVersion, { includeContent: true }),
          restoredFromVersionId: result.sourceVersion.id,
        },
        201,
      );
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/versions/:versionId/deletion-impact',
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

      const documentId = context.req.param('documentId');
      const result = await documentsServices.getDocumentVersionDeletionImpact({
        vaultId,
        documentId,
        documentVersionId: context.req.param('versionId'),
        limit,
      });

      if (!result.success) {
        return context.json(
          { error: { code: 'document.version_not_found', message: 'Document version not found' } },
          404,
        );
      }

      return context.json({ impact: serializeDeletionImpact(result.impact) });
    },
  );

  app.delete(
    '/api/vaults/:vaultId/documents/:documentId/versions/:versionId',
    requireCanMutateVaultDocuments({ auditServices }),
    async (context) => {
      const vaultId = context.get('vaultId');
      const userId = context.get('userId');

      if (vaultId === null || userId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const documentVersionId = context.req.param('versionId');
      const result = await documentsServices.deleteDocumentVersion({
        vaultId,
        documentId,
        documentVersionId,
        deletedBy: userId,
      });

      if (!result.success) {
        await auditServices?.emitAuditEvent({
          eventType: AUDIT_EVENT_TYPES.documentVersionDeleteFailed,
          eventCategory: 'document',
          outcome: 'failure',
          actor: getAuditActorFromContext(context),
          vaultId,
          documentId,
          target: { type: 'document_version', id: documentVersionId },
          source: 'web',
          requestContext: getAuditRequestContext(context),
          metadata: {
            document_version_id: documentVersionId,
            deletion_type: 'version',
            reason: result.reason,
          },
        });

        if (result.reason === 'not_found') {
          return context.json(
            {
              error: { code: 'document.version_not_found', message: 'Document version not found' },
            },
            404,
          );
        }

        return context.json(
          {
            error: {
              code: 'document.version_current',
              message: 'Current version cannot be deleted',
            },
          },
          409,
        );
      }

      const auditEvent = await auditServices?.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.documentVersionDeleted,
        eventCategory: 'document',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: {
          type: 'document_version',
          id: result.documentVersion.id,
          displayName: result.documentVersion.originalName,
        },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: getDocumentVersionAuditMetadata(result.documentVersion, {
          deletion_type: 'version',
        }),
      });
      await activityServices?.emitActivityEvent({
        activityType: ACTIVITY_EVENT_TYPES.documentVersionDeleted,
        entityType: 'document',
        entityId: documentId,
        actor: getAuditActorFromContext(context),
        vaultId,
        documentId,
        target: {
          type: 'document_version',
          id: result.documentVersion.id,
          displayName: result.documentVersion.originalName,
        },
        source: 'web',
        auditEventId: auditEvent?.id,
        metadata: getDocumentVersionAuditMetadata(result.documentVersion, {
          deletion_type: 'version',
        }),
      });

      return context.body(null, 204);
    },
  );

  // Rename document

}
