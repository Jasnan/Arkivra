import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { DocumentsServices } from './documents.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import { SEARCH_SORT_VALUES } from '../search/search.types.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};
import { createDocumentsServices } from './documents.services.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireVaultPermission } from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';

function getDuplicateDocumentMessage(scope: string | null | undefined) {
  if (scope === 'trash') {
    return 'A document with the same content is already in this vault trash';
  }

  return 'A document with the same content already exists in this vault';
}

function parseSortBy(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 'created_desc' as const;
  }

  return SEARCH_SORT_VALUES.includes(value as any) ? value as (typeof SEARCH_SORT_VALUES)[number] : null;
}

function parsePageNumber(value: string | undefined) {
  if (value === undefined) {
    return null;
  }

  const normalized = value.endsWith('.png') ? value.slice(0, -4) : value;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function matchesEtag(ifNoneMatch: string | null | undefined, etag: string) {
  if (ifNoneMatch === null || ifNoneMatch === undefined) {
    return false;
  }

  return ifNoneMatch
    .split(',')
    .map(value => value.trim())
    .includes(etag);
}

export function registerDocumentRoutes({
  app,
  db,
  storage,
  encryption,
  services,
  documentQueue,
  retentionDays = 30,
  vaultServices,
}: {
  app: Hono<ServerContext>;
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  services?: DocumentsServices;
  documentQueue?: DocumentQueue;
  retentionDays?: number;
  vaultServices?: VaultsServices;
}) {
  const documentsServices = services ?? createDocumentsServices({ db, storage, encryption });
  const vaultsServices = vaultServices ?? createVaultsServices({ db });

  app.use('/api/documents/trash', requireAuthentication());

  app.get('/api/documents/trash', async (context) => {
    const userId = context.get('userId');

    if (userId === null) {
      return context.json(
        { error: { code: 'auth.unauthorized', message: 'Unauthorized' } },
        401,
      );
    }

    const vaults = await vaultsServices.listUserVaults({ userId });
    const readableVaultIds = vaults
      .filter(vault =>
        vault.isGlobalAdmin
        || vault.role === 'owner'
        || vault.permissions.includes('documents.read'),
      )
      .map(vault => vault.id);

    const documents = await documentsServices.listDeletedDocuments({ vaultIds: readableVaultIds });

    return context.json({ documents, retentionDays });
  });

  // List documents in vault
  app.get(
    '/api/vaults/:vaultId/documents',
    requireVaultPermission('documents.read'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const includeDeleted = context.req.query('includeDeleted') === 'true';
      const tagId = context.req.query('tagId');
      const sortBy = parseSortBy(context.req.query('sortBy'));

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

      const documents = await documentsServices.listDocuments({ vaultId, includeDeleted, tagId, sortBy });

      return context.json({ documents, retentionDays });
    },
  );

  // Upload document
  app.post(
    '/api/vaults/:vaultId/documents',
    requireVaultPermission('documents.create'),
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
      const fileName = file.name || 'untitled';
      const mimeType = file.type || 'application/octet-stream';

      const result = await documentsServices.uploadDocument({
        vaultId,
        userId,
        fileName,
        mimeType,
        fileData,
      });

      if (result.duplicate) {
        return context.json(
          {
            error: {
              code: 'document.duplicate',
              message: getDuplicateDocumentMessage(result.duplicateScope),
              existingId: result.existingId,
              duplicateScope: result.duplicateScope,
            },
          },
          409,
        );
      }

      // Enqueue document processing job
      if (documentQueue !== undefined && result.document !== null) {
        await documentQueue.enqueueProcessDocument({
          documentId: result.document.id,
          vaultId,
        });
        await documentsServices.updateDocumentProcessingStatus({
          documentId: result.document.id,
          vaultId,
          processingStatus: 'queued',
        });
      }

      return context.json({ document: result.document }, 201);
    },
  );

  // Get document details
  app.get(
    '/api/vaults/:vaultId/documents/:documentId',
    requireVaultPermission('documents.read'),
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

      return context.json({ document });
    },
  );

  // Download document file
  app.get(
    '/api/vaults/:vaultId/documents/:documentId/download',
    requireVaultPermission('documents.download'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const result = await documentsServices.downloadDocument({ documentId, vaultId });

      if (result === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

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
    requireVaultPermission('documents.download'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const result = await documentsServices.downloadDocument({ documentId, vaultId });

      if (result === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      return new Response(result.fileData, {
        status: 200,
        headers: {
          'content-type': result.mimeType,
          'content-length': String(result.fileData.length),
          'content-disposition': `inline; filename="${encodeURIComponent(result.fileName)}"`,
        },
      });
    },
  );

  app.get(
    '/api/vaults/:vaultId/documents/:documentId/page/:pageRef',
    requireVaultPermission('documents.download'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const pageNumber = parsePageNumber(context.req.param('pageRef'));
      if (pageNumber === null) {
        return context.json(
          { error: { code: 'document.invalid_page_number', message: 'Page number must be an integer >= 1' } },
          400,
        );
      }

      const documentId = context.req.param('documentId');
      const result = await documentsServices.renderDocumentPagePreview({
        documentId,
        vaultId,
        pageNumber,
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
              code: result.error === 'invalid_page_number'
                ? 'document.invalid_page_number'
                : 'document.page_not_available',
              message: result.error === 'invalid_page_number'
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
    '/api/vaults/:vaultId/chunks/:chunkId/assets/:assetId',
    requireVaultPermission('documents.download'),
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

  // Rename document
  app.patch(
    '/api/vaults/:vaultId/documents/:documentId',
    requireVaultPermission('documents.update'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const body = await context.req.json();

      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';

        if (name.length === 0) {
          return context.json(
            { error: { code: 'document.invalid_name', message: 'Document name is required' } },
            400,
          );
        }

        const doc = await documentsServices.renameDocument({ documentId, vaultId, name });

        if (doc === null) {
          return context.json(
            { error: { code: 'document.not_found', message: 'Document not found' } },
            404,
          );
        }

        return context.json({ document: doc });
      }

      if (body.documentDate !== undefined) {
        const documentDate = body.documentDate === null ? null : new Date(body.documentDate);

        if (documentDate !== null && Number.isNaN(documentDate.getTime())) {
          return context.json(
            { error: { code: 'document.invalid_date', message: 'Invalid document date' } },
            400,
          );
        }

        const doc = await documentsServices.updateDocumentDate({
          documentId,
          vaultId,
          documentDate,
        });

        if (doc === null) {
          return context.json(
            { error: { code: 'document.not_found', message: 'Document not found' } },
            404,
          );
        }

        return context.json({ document: doc });
      }

      return context.json(
        { error: { code: 'document.invalid_payload', message: 'Provide name or documentDate' } },
        400,
      );
    },
  );

  // Soft delete document
  app.delete(
    '/api/vaults/:vaultId/documents/:documentId',
    requireVaultPermission('documents.delete'),
    async (context) => {
      const vaultId = context.get('vaultId');
      const userId = context.get('userId');

      if (vaultId === null || userId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const doc = await documentsServices.softDeleteDocument({
        documentId,
        vaultId,
        deletedBy: userId,
      });

      if (doc === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found' } },
          404,
        );
      }

      return context.body(null, 204);
    },
  );

  // Restore soft-deleted document
  app.post(
    '/api/vaults/:vaultId/documents/:documentId/restore',
    requireVaultPermission('documents.delete'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const doc = await documentsServices.restoreDocument({ documentId, vaultId });

      if (!doc.success && doc.reason === 'duplicate') {
        return context.json(
          {
            error: {
              code: 'document.duplicate',
              message: 'A document with the same content already exists in this vault',
              existingId: doc.existingId,
            },
          },
          409,
        );
      }

      if (!doc.success) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found or not deleted' } },
          404,
        );
      }

      return context.json({ document: { id: doc.id } });
    },
  );

  // Hard delete (permanently remove soft-deleted document)
  app.delete(
    '/api/vaults/:vaultId/documents/:documentId/permanent',
    requireVaultPermission('documents.delete'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const result = await documentsServices.hardDeleteDocument({ documentId, vaultId });

      if (!result.success) {
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

      return context.body(null, 204);
    },
  );
}
