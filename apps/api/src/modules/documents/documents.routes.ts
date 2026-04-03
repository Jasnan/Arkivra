import type { Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { DocumentsServices } from './documents.services.js';
import type { ProcessDocumentJobData } from '../worker/worker.types.js';

type DocumentQueue = {
  enqueueProcessDocument: (data: ProcessDocumentJobData) => Promise<void>;
};
import { createDocumentsServices } from './documents.services.js';
import { requireVaultRole } from '../vaults/vaults.middleware.js';

export function registerDocumentRoutes({
  app,
  db,
  storage,
  encryption,
  services,
  documentQueue,
}: {
  app: Hono<ServerContext>;
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  services?: DocumentsServices;
  documentQueue?: DocumentQueue;
}) {
  const documentsServices = services ?? createDocumentsServices({ db, storage, encryption });

  // List documents in vault
  app.get('/api/vaults/:vaultId/documents', async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const includeDeleted = context.req.query('includeDeleted') === 'true';
    const documents = await documentsServices.listDocuments({ vaultId, includeDeleted });

    return context.json({ documents });
  });

  // Upload document
  app.post('/api/vaults/:vaultId/documents', async (context) => {
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
            message: 'A document with the same content already exists in this vault',
            existingId: result.existingId,
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
    }

    return context.json({ document: result.document }, 201);
  });

  // Get document details
  app.get('/api/vaults/:vaultId/documents/:documentId', async (context) => {
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
  });

  // Download document file
  app.get('/api/vaults/:vaultId/documents/:documentId/download', async (context) => {
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
  });

  // Rename document
  app.patch('/api/vaults/:vaultId/documents/:documentId', async (context) => {
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
      const documentDate = body.documentDate === null
        ? null
        : new Date(body.documentDate);

      if (documentDate !== null && Number.isNaN(documentDate.getTime())) {
        return context.json(
          { error: { code: 'document.invalid_date', message: 'Invalid document date' } },
          400,
        );
      }

      const doc = await documentsServices.updateDocumentDate({ documentId, vaultId, documentDate });

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
  });

  // Soft delete document
  app.delete('/api/vaults/:vaultId/documents/:documentId', async (context) => {
    const vaultId = context.get('vaultId');
    const userId = context.get('userId');

    if (vaultId === null || userId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const documentId = context.req.param('documentId');
    const doc = await documentsServices.softDeleteDocument({ documentId, vaultId, deletedBy: userId });

    if (doc === null) {
      return context.json(
        { error: { code: 'document.not_found', message: 'Document not found' } },
        404,
      );
    }

    return context.body(null, 204);
  });

  // Restore soft-deleted document
  app.post('/api/vaults/:vaultId/documents/:documentId/restore', async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const documentId = context.req.param('documentId');
    const doc = await documentsServices.restoreDocument({ documentId, vaultId });

    if (doc === null) {
      return context.json(
        { error: { code: 'document.not_found', message: 'Document not found or not deleted' } },
        404,
      );
    }

    return context.json({ document: doc });
  });

  // Hard delete (permanently remove soft-deleted document)
  app.delete(
    '/api/vaults/:vaultId/documents/:documentId/permanent',
    requireVaultRole('owner', 'admin'),
    async (context) => {
      const vaultId = context.get('vaultId');

      if (vaultId === null) {
        return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
      }

      const documentId = context.req.param('documentId');
      const doc = await documentsServices.hardDeleteDocument({ documentId, vaultId });

      if (doc === null) {
        return context.json(
          { error: { code: 'document.not_found', message: 'Document not found or not soft-deleted' } },
          404,
        );
      }

      return context.body(null, 204);
    },
  );
}
