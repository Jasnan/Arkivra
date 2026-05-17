import type { Context, Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { DocumentsServices } from './documents.services.js';
import { SEARCH_SORT_VALUES } from '../search/search.types.js';
import { createDocumentsServices, normalizeDocumentFileName } from './documents.services.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};
import { requireAuthentication } from '../auth/auth.middleware.js';
import {
  requireCanMutateVaultDocuments,
  requireCanReadVault,
} from '../vaults/vaults.middleware.js';
import { createVaultsServices } from '../vaults/vaults.services.js';
import { createFoldersServices } from '../folders/folders.services.js';
import { buildUserDocumentLanguageMetadata } from './document-language.js';

function getDuplicateDocumentMessage(scope: string | null | undefined) {
  if (scope === 'trash') {
    return 'A document with this file already exists in this vault trash';
  }

  return 'A document with this file already exists in this vault';
}

function parseSortBy(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 'created_desc' as const;
  }

  return SEARCH_SORT_VALUES.includes(value as any) ? value as (typeof SEARCH_SORT_VALUES)[number] : null;
}

function parseNullableFolderId(value: unknown) {
  if (value === undefined) {
    return { valid: true as const, folderId: undefined };
  }

  if (value === null || value === '' || value === 'root') {
    return { valid: true as const, folderId: null };
  }

  if (typeof value !== 'string') {
    return { valid: false as const };
  }

  const folderId = value.trim();
  return folderId.length > 0 ? { valid: true as const, folderId } : { valid: false as const };
}

function getFolderDestinationErrorResponse(reason: string) {
  if (reason === 'parent_not_found' || reason === 'folder_not_found') {
    return {
      status: 404,
      body: { error: { code: 'folder.not_found', message: 'Folder not found' } },
    };
  }

  if (reason === 'path_too_long') {
    return {
      status: 400,
      body: { error: { code: 'folder.path_too_long', message: 'Folder path is too long' } },
    };
  }

  return {
    status: 400,
    body: { error: { code: 'folder.invalid_relative_path', message: 'Relative path is invalid' } },
  };
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
  const foldersServices = createFoldersServices({ db });

  app.use('/api/trash', requireAuthentication());
  app.use('/api/documents/trash', requireAuthentication());

  async function getTrashResponse(context: Context<ServerContext>) {
    const userId = context.get('userId');

    if (userId === null) {
      return context.json(
        { error: { code: 'auth.unauthorized', message: 'Unauthorized' } },
        401,
      );
    }

    const vaults = await vaultsServices.listUserVaults({ userId });
    const readableVaultIds = vaults
      .filter(vault => vault.role === 'owner' || vault.role === 'editor' || vault.role === 'viewer')
      .map(vault => vault.id);
    const requestedVaultId = context.req.query('vaultId')?.trim() || undefined;

    if (requestedVaultId !== undefined && !readableVaultIds.includes(requestedVaultId)) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const documents = await documentsServices.listDeletedDocuments({
      vaultIds: requestedVaultId === undefined ? readableVaultIds : [requestedVaultId],
    });

    return context.json({ documents, retentionDays });
  }

  app.get('/api/trash', getTrashResponse);
  app.get('/api/documents/trash', getTrashResponse);

  // List documents in vault
  app.get(
    '/api/vaults/:vaultId/documents',
    requireCanReadVault(),
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
    requireCanMutateVaultDocuments(),
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
      const mimeType = file.type || 'application/octet-stream';
      const parsedFolderId = parseNullableFolderId(formData.get('folderId'));
      const relativePathField = formData.get('relativePath');
      const relativePath = typeof relativePathField === 'string' && relativePathField.trim().length > 0
        ? relativePathField
        : null;

      if (!parsedFolderId.valid || parsedFolderId.folderId === undefined) {
        return context.json(
          { error: { code: 'folder.invalid_id', message: 'Invalid folder id' } },
          400,
        );
      }

      const destination = parsedFolderId.folderId === null && relativePath === null
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
    requireCanReadVault(),
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
    requireCanReadVault(),
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
    requireCanReadVault(),
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
    requireCanReadVault(),
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
    requireCanReadVault(),
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
    requireCanMutateVaultDocuments(),
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

        return context.json({ document: result.document });
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

      if (body.language !== undefined) {
        const languageCode = body.language === null
          ? null
          : typeof body.language === 'string'
            ? body.language
            : typeof body.language === 'object' && body.language !== null && typeof body.language.code === 'string'
              ? body.language.code
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
            { error: { code: 'document.unsupported_language', message: 'Unsupported document language' } },
            400,
          );
        }

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

        return context.json({ document: doc });
      }

      return context.json(
        { error: { code: 'document.invalid_payload', message: 'Provide name, documentDate, or language' } },
        400,
      );
    },
  );

  app.post(
    '/api/vaults/:vaultId/documents/:documentId/move',
    requireCanMutateVaultDocuments(),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const body = await context.req.json();
      const parsedFolderId = parseNullableFolderId(body.folderId);

      if (!parsedFolderId.valid || parsedFolderId.folderId === undefined) {
        return context.json(
          { error: { code: 'folder.invalid_id', message: 'Invalid folder id' } },
          400,
        );
      }

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

      return context.json({ document: result.document });
    },
  );

  app.post(
    '/api/vaults/:vaultId/documents/:documentId/reprocess',
    requireCanMutateVaultDocuments(),
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

      await documentQueue.enqueueProcessDocument({
        documentId,
        vaultId,
        replaceExisting: true,
      });
      await documentsServices.updateDocumentProcessingStatus({
        documentId,
        vaultId,
        processingStatus: 'queued',
      });

      return context.json({
        queued: true,
        documentId,
        mode: 'source_file',
      }, 202);
    },
  );

  // Soft delete document
  app.delete(
    '/api/vaults/:vaultId/documents/:documentId',
    requireCanMutateVaultDocuments(),
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
    requireCanMutateVaultDocuments(),
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
              message: 'A document with this file already exists in this vault',
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
    requireCanMutateVaultDocuments(),
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
