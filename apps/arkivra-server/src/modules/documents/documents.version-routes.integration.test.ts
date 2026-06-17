import type { Database } from '../database/database.js';
import { describe, expect, test, vi } from 'vitest';
import {
  createMockActivityServices,
  createMockAdminAiServices,
  createMockAuditServices,
  createMockDocumentQueue,
  createMockDocumentsServices,
  createMockEmbeddingIndexQueue,
  createMockVaultsServices,
  createTestApp,
} from './documents.routes.test-helpers.js';

describe('document version and lifecycle routes', () => {
  test('lists document versions without extracted content payloads', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/versions', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0]).toMatchObject({
      id: 'dvr_1',
      documentId: 'doc_1',
      versionNumber: 2,
      isCurrent: true,
      originalName: 'report.pdf',
    });
    expect(body.versions[0].content).toBeUndefined();
    expect(docServices.listDocumentVersions).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
    });
  });

  test('returns document version detail with explicit version scope', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/versions/dvr_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.version).toMatchObject({
      id: 'dvr_1',
      documentId: 'doc_1',
      content: 'Extracted text',
      parserStructuredOutput: { ok: true },
    });
    expect(docServices.resolveDocumentVersion).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
    });
  });

  test('downloads an explicit document version and audits the version id', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const app = createTestApp({ docServices, auditServices });

    const response = await app.request(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/download',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('version-file-content');
    expect(docServices.downloadDocumentVersion).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
    });
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.downloaded',
        target: expect.objectContaining({ type: 'document_version', id: 'dvr_1' }),
        metadata: expect.objectContaining({
          document_version_id: 'dvr_1',
          access_method: 'download',
        }),
      }),
    );
  });

  test('lists chunks for an explicit document version', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/chunks', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.chunks).toHaveLength(1);
    expect(body.chunks[0]).toMatchObject({
      id: 'chk_version_1',
      content: 'Historical chunk content',
      pageStart: 1,
    });
    expect(docServices.listDocumentVersionChunks).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
    });
  });

  test('serves an explicit document version page preview', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/pages/2/preview',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"version-page-2"');
    await expect(response.text()).resolves.toBe('png-version-page-2');
    expect(docServices.renderDocumentVersionPagePreview).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
      pageNumber: 2,
    });
  });

  test('returns structured not-found errors for explicit document version reads', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).resolveDocumentVersion = vi.fn(async () => null);
    (docServices as any).downloadDocumentVersion = vi.fn(async () => null);
    (docServices as any).listDocumentVersionChunks = vi.fn(async () => null);
    (docServices as any).renderDocumentVersionPagePreview = vi.fn(async () => null);
    const app = createTestApp({ docServices });

    const cases = [
      ['/api/vaults/vlt_1/documents/doc_1/versions/dvr_missing', 'GET'],
      ['/api/vaults/vlt_1/documents/doc_1/versions/dvr_missing/download', 'GET'],
      ['/api/vaults/vlt_1/documents/doc_1/versions/dvr_missing/chunks', 'GET'],
      ['/api/vaults/vlt_1/documents/doc_1/versions/dvr_missing/pages/2/preview', 'GET'],
    ] as const;

    for (const [path, method] of cases) {
      const response = await app.request(path, {
        method,
        headers: { 'x-test-user-id': 'usr_1' },
      });

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'document.version_not_found',
          message: 'Document version not found',
        },
      });
    }
  });

  test('returns 400 for invalid explicit version page preview numbers', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/pages/0/preview',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'document.invalid_page_number',
        message: 'Page number must be an integer >= 1',
      },
    });
    expect(docServices.renderDocumentVersionPagePreview).not.toHaveBeenCalled();
  });

  test('downloads document file', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/download', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('content-disposition')).toContain('test.pdf');
    const body = await response.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe('file-content');
  });

  test('serves document file inline for previews', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const app = createTestApp({ docServices, auditServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/file', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('inline');
    expect(response.headers.get('content-disposition')).toContain('test.pdf');
    const body = await response.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe('file-content');
    expect(auditServices.emitAuditEvent).not.toHaveBeenCalled();
  });

  test('serves soft-deleted document file inline for trash previews', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request(
      '/api/vaults/vlt_1/documents/doc_deleted_1/file?includeDeleted=true',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('inline');
    expect((docServices as any).downloadDocument).toHaveBeenCalledWith({
      documentId: 'doc_deleted_1',
      vaultId: 'vlt_1',
      includeDeleted: true,
    });
  });

  test('serves known image extensions with previewable inline content types', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).downloadDocument = vi.fn(async () => ({
      fileData: Buffer.from('webp-content'),
      fileName: 'scan.webp',
      mimeType: 'application/octet-stream',
      size: 12,
    }));
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/file', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('content-disposition')).toContain('inline');
  });

  test('returns 404 when downloading non-existent document', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).downloadDocument = vi.fn(async () => null);

    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_missing/download', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(404);
  });

  test('serves cached page preview png for previews', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/page/2.png', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('etag')).toBe('"page-2"');
    expect(response.headers.get('cache-control')).toContain('private');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('png-page-2');
    expect((docServices as any).renderDocumentPagePreview).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      pageNumber: 2,
    });
  });

  test('serves cached page preview png for trash previews', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request(
      '/api/vaults/vlt_1/documents/doc_deleted_1/page/2.png?includeDeleted=true',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect((docServices as any).renderDocumentPagePreview).toHaveBeenCalledWith({
      documentId: 'doc_deleted_1',
      vaultId: 'vlt_1',
      pageNumber: 2,
      includeDeleted: true,
    });
  });

  test('returns 304 for matching page preview etag', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/page/2.png', {
      headers: {
        'x-test-user-id': 'usr_1',
        'if-none-match': '"page-2"',
      },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"page-2"');
  });

  test('returns 400 for invalid page preview number', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/page/0.png', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'document.invalid_page_number',
        message: 'Page number must be an integer >= 1',
      },
    });
  });

  test('renames a document', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'new-name.pdf' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.name).toBe('new-name.pdf');
    expect(docServices.renameDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      name: 'new-name.pdf',
    });
  });

  test('returns structured errors for malformed document metadata JSON', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const renameResponse = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: '{',
    });
    expect(renameResponse.status).toBe(400);
    await expect(renameResponse.json()).resolves.toEqual({
      error: {
        code: 'document.invalid_payload',
        message: 'Invalid document payload',
      },
    });
    expect(docServices.renameDocument).not.toHaveBeenCalled();

    const moveResponse = await app.request('/api/vaults/vlt_1/documents/doc_1/move', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: '{',
    });
    expect(moveResponse.status).toBe(400);
    await expect(moveResponse.json()).resolves.toEqual({
      error: {
        code: 'document.invalid_payload',
        message: 'Invalid document payload',
      },
    });
    expect(docServices.moveDocument).not.toHaveBeenCalled();
  });

  test('updates document source language metadata', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: 'de' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.language).toEqual({
      code: 'de',
      name: 'German',
      confidence: null,
      source: 'user',
    });
    expect(docServices.updateDocumentLanguage).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      language: {
        code: 'de',
        name: 'German',
        confidence: null,
        source: 'user',
      },
    });
  });

  test('clears document source language metadata', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: null }),
    });

    expect(response.status).toBe(200);
    expect(docServices.updateDocumentLanguage).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      language: null,
    });
  });

  test('returns 400 for unsupported document source language', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: 'it' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.unsupported_language');
  });

  test('moves a document into a folder', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/move', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ folderId: 'fld_1' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.folderId).toBe('fld_1');
    expect(docServices.moveDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      folderId: 'fld_1',
    });
  });

  test('moves a document back to vault root', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/move', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ folderId: null }),
    });

    expect(response.status).toBe(200);
    expect(docServices.moveDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      folderId: null,
    });
  });

  test('returns 409 when moving a document into a folder with the same name', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).moveDocument = vi.fn(async () => ({
      success: false,
      reason: 'duplicate_name',
      existingId: 'doc_existing_1',
    }));
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/move', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ folderId: 'fld_1' }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.duplicate_name');
    expect(body.error.existingId).toBe('doc_existing_1');
  });

  test('queues source-file reprocessing for an existing document', async () => {
    const docServices = createMockDocumentsServices();
    const documentQueue = createMockDocumentQueue();
    const app = createTestApp({ docServices, documentQueue });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/reprocess', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      queued: true,
      documentId: 'doc_1',
      mode: 'source_file',
    });
    expect(docServices.getDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
    });
    expect(documentQueue.enqueueProcessDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
      vaultId: 'vlt_1',
      replaceExisting: true,
    });
    expect((docServices as any).updateDocumentVersionProcessingStatus).toHaveBeenCalledWith({
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
      vaultId: 'vlt_1',
      processingStatus: 'queued',
    });
  });

  test('returns 503 when document reprocessing is unavailable', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/reprocess', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: 'document.reprocess_unavailable',
        message: 'Document reprocessing is not available in this environment',
      },
    });
  });

  test('returns 400 for empty rename', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'PATCH',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: '  ' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.invalid_name');
  });

  test('soft deletes a document', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const app = createTestApp({ docServices, auditServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(204);
    expect(docServices.softDeleteDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      deletedBy: 'usr_1',
    });
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.deleted',
        vaultId: 'vlt_1',
        documentId: 'doc_1',
        metadata: {
          document_name: 'report.pdf',
          file_name: 'report.pdf',
          deletion_type: 'soft',
        },
      }),
    );
  });

  test('audits denied document delete attempts', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'viewer',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    const app = createTestApp({ docServices, vaultServices, auditServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_viewer' },
    });

    expect(response.status).toBe(403);
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.access_denied',
        outcome: 'denied',
        vaultId: 'vlt_1',
        documentId: 'doc_1',
        metadata: { action: 'delete' },
      }),
    );
  });

  test('returns document activity without exposing privileged denied events to regular members', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const activityServices = createMockActivityServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'viewer',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    const app = createTestApp({ docServices, vaultServices, auditServices, activityServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/activity', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.activity).toHaveLength(1);
    expect(body.activity[0].activityType).toBe('document.created');
    expect(body.activity[0].metadata).toEqual({ file_name: 'report.pdf' });
  });

  test('allows owners to view the audit log without adding a passive viewed event', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    const app = createTestApp({ docServices, vaultServices, auditServices });

    const response = await app.request('/api/vaults/vlt_1/audit-events', {
      headers: { 'x-test-user-id': 'usr_owner' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.events).toHaveLength(1);
    expect(auditServices.emitAuditEvent).not.toHaveBeenCalled();
  });

  test('allows owners to filter the audit log without adding a passive searched event', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    const app = createTestApp({ docServices, vaultServices, auditServices });

    const response = await app.request(
      '/api/vaults/vlt_1/audit-events?eventType=document.deleted',
      {
        headers: { 'x-test-user-id': 'usr_owner' },
      },
    );

    expect(response.status).toBe(200);
    expect(auditServices.emitAuditEvent).not.toHaveBeenCalled();
  });

  test('forbids regular members from the full vault audit log', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'viewer',
      aiAccessLevel: 'none',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
    }));
    const app = createTestApp({ docServices, vaultServices, auditServices });

    const response = await app.request('/api/vaults/vlt_1/audit-events', {
      headers: { 'x-test-user-id': 'usr_viewer' },
    });

    expect(response.status).toBe(403);
    expect((auditServices as any).listVaultAuditEvents).not.toHaveBeenCalled();
  });

  test('restores a soft-deleted document', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/restore', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.id).toBe('doc_1');
    expect(body.message).toBe('File restored to original location');
    expect(docServices.restoreDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
    });
  });

  test('enqueues semantic reindexing after restoring a document when AI is enabled', async () => {
    const docServices = createMockDocumentsServices();
    const embeddingIndexQueue = createMockEmbeddingIndexQueue();
    const adminAiServices = createMockAdminAiServices();
    const db = {
      execute: vi.fn(async () => ({
        rows: [
          {
            id: 'eix_active',
            provider_config_id: 'aip_embedding',
            provider: 'ollama',
            model: 'bge-m3',
            dimensions: 1024,
            distance_metric: 'cosine',
            name: 'Local embeddings',
            base_url: 'http://127.0.0.1:11434',
            api_key_secret_ref: null,
            config: {},
            is_enabled: true,
          },
        ],
      })),
    } as unknown as Database;
    const app = createTestApp({
      docServices,
      adminAiServices,
      embeddingIndexQueue,
      db,
    });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/restore', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.resolveLatestDocumentVersion).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
    });
    expect(embeddingIndexQueue.enqueueDocumentIndexing).toHaveBeenCalledWith({
      embeddingIndexId: 'eix_active',
      documentVersionId: 'dvr_1',
    });
  });

  test('restores a historical document version and emits version audit and activity events', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const activityServices = createMockActivityServices();
    const app = createTestApp({ docServices, auditServices, activityServices });

    const response = await app.request(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_source_1/restore',
      {
        method: 'POST',
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.version).toMatchObject({
      id: 'dvr_restored_1',
      versionNumber: 3,
      restoredFromVersionId: 'dvr_source_1',
    });
    expect(docServices.restoreDocumentVersion).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentVersionId: 'dvr_source_1',
      restoredBy: 'usr_1',
    });
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.version_restored',
        metadata: expect.objectContaining({
          document_version_id: 'dvr_restored_1',
          source_document_version_id: 'dvr_source_1',
        }),
      }),
    );
    expect(activityServices.emitActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'document.version_restored',
        auditEventId: 'aud_1',
      }),
    );
  });

  test.each([
    {
      reason: 'not_found',
      status: 404,
      code: 'document.version_not_found',
      message: 'Document version not found',
    },
    {
      reason: 'current_version',
      status: 409,
      code: 'document.version_current',
      message: 'Current version cannot be restored',
    },
    {
      reason: 'invalid_status',
      status: 409,
      code: 'document.version_not_restorable',
      message: 'Only completed historical versions can be restored',
    },
  ])(
    'returns a structured error when version restore fails with $reason',
    async ({ reason, status, code, message }) => {
      const docServices = createMockDocumentsServices();
      (docServices as any).restoreDocumentVersion = vi.fn(async () => ({
        success: false,
        reason,
      }));
      const app = createTestApp({ docServices });

      const response = await app.request(
        '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/restore',
        {
          method: 'POST',
          headers: { 'x-test-user-id': 'usr_1' },
        },
      );

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({
        error: { code, message },
      });
    },
  );

  test.each([
    {
      method: 'POST',
      path: '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/restore',
      serviceMethod: 'restoreDocumentVersion',
    },
    {
      method: 'DELETE',
      path: '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1',
      serviceMethod: 'deleteDocumentVersion',
    },
  ])(
    'forbids viewer access to version mutation route $path',
    async ({ method, path, serviceMethod }) => {
      const docServices = createMockDocumentsServices();
      const vaultServices = createMockVaultsServices();
      (vaultServices as any).getVaultForUser = vi.fn(async () => ({
        id: 'vlt_1',
        name: 'Test',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'viewer',
        aiAccessLevel: 'none',
        isAdmin: false,
      }));
      const app = createTestApp({ docServices, vaultServices });

      const response = await app.request(path, {
        method,
        headers: { 'x-test-user-id': 'usr_1' },
      });

      expect(response.status).toBe(403);
      expect((docServices as any)[serviceMethod]).not.toHaveBeenCalled();
    },
  );

  test('returns citation-only impact for document version deletion warnings', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/deletion-impact?limit=5',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      impact: {
        affectedConversationCount: 2,
        affectedConversations: [
          {
            id: 'cht_1',
            title: 'HR Policy Review',
            createdAt: '2025-01-02T00:00:00.000Z',
            updatedAt: '2025-01-03T00:00:00.000Z',
          },
          {
            id: 'cht_2',
            title: 'Employee Benefits',
            createdAt: '2025-01-04T00:00:00.000Z',
            updatedAt: '2025-01-05T00:00:00.000Z',
          },
        ],
        limit: 5,
      },
    });
    expect(docServices.getDocumentVersionDeletionImpact).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
      limit: 5,
    });
  });

  test('returns citation-only impact for logical document deletion warnings', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request(
      '/api/vaults/vlt_1/documents/doc_1/deletion-impact?includeDeleted=true&limit=5',
      {
        headers: { 'x-test-user-id': 'usr_1' },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      impact: {
        affectedConversationCount: 2,
        affectedConversations: [
          {
            id: 'cht_1',
            title: 'HR Policy Review',
            createdAt: '2025-01-02T00:00:00.000Z',
            updatedAt: '2025-01-03T00:00:00.000Z',
          },
          {
            id: 'cht_2',
            title: 'Employee Benefits',
            createdAt: '2025-01-04T00:00:00.000Z',
            updatedAt: '2025-01-05T00:00:00.000Z',
          },
        ],
        limit: 5,
        versionCount: 4,
      },
    });
    expect(docServices.getDocumentDeletionImpact).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      limit: 5,
      includeDeletedDocument: true,
    });
  });

  test('returns count-only impact for bulk document deletion warnings', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/documents/deletion-impact', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({
        includeDeleted: true,
        documents: [
          { vaultId: 'vlt_1', documentId: 'doc_1' },
          { vaultId: 'vlt_1', documentId: 'doc_2' },
        ],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      impact: {
        documentCount: 500,
        versionCount: 914,
        affectedConversationCount: 124,
      },
    });
    expect(docServices.getBulkDocumentDeletionImpact).toHaveBeenCalledWith({
      targets: [
        { vaultId: 'vlt_1', documentId: 'doc_1' },
        { vaultId: 'vlt_1', documentId: 'doc_2' },
      ],
      includeDeletedDocument: true,
    });
  });

  test.each([
    {
      reason: 'not_found',
      status: 404,
      code: 'document.version_not_found',
      message: 'Document version not found',
    },
    {
      reason: 'current_version',
      status: 409,
      code: 'document.version_current',
      message: 'Current version cannot be deleted',
    },
  ])(
    'returns a structured error when version delete fails with $reason',
    async ({ reason, status, code, message }) => {
      const docServices = createMockDocumentsServices();
      (docServices as any).deleteDocumentVersion = vi.fn(async () => ({
        success: false,
        reason,
      }));
      const auditServices = createMockAuditServices();
      const app = createTestApp({ docServices, auditServices });

      const response = await app.request('/api/vaults/vlt_1/documents/doc_1/versions/dvr_1', {
        method: 'DELETE',
        headers: { 'x-test-user-id': 'usr_1' },
      });

      expect(response.status).toBe(status);
      const body = (await response.json()) as any;
      expect(body.error).toMatchObject({ code, message });
      expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.version_delete_failed',
          metadata: expect.objectContaining({
            document_version_id: 'dvr_1',
            reason,
          }),
        }),
      );
    },
  );

  test('deletes an unreferenced historical document version and emits audit and activity events', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const activityServices = createMockActivityServices();
    const app = createTestApp({ docServices, auditServices, activityServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/versions/dvr_1', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(204);
    expect(docServices.deleteDocumentVersion).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
      deletedBy: 'usr_1',
    });
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.version_deleted',
        metadata: expect.objectContaining({
          document_version_id: 'dvr_1',
          deletion_type: 'version',
        }),
      }),
    );
    expect(activityServices.emitActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'document.version_deleted',
        auditEventId: 'aud_1',
      }),
    );
  });

  test('returns 409 when restoring a document that duplicates an active document', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).restoreDocument = vi.fn(async () => ({
      success: false,
      reason: 'duplicate',
      existingId: 'doc_existing_1',
    }));

    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/restore', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.duplicate');
    expect(body.error.existingId).toBe('doc_existing_1');
    expect(body.error.duplicateScope).toBe('active');
    expect(body.error.conflictType).toBe('hash');
    expect(body.error.availableStrategies).toEqual(['skip', 'keep_both']);
    expect(docServices.restoreDocument).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      conflictStrategy: undefined,
    });
  });

  test('passes restore conflict strategy through to document services', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).restoreDocument = vi.fn(async () => ({
      success: false,
      reason: 'skipped',
      existingId: 'doc_existing_1',
    }));

    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/restore', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ conflictStrategy: 'skip' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.skipped).toBe(true);
    expect(body.existingId).toBe('doc_existing_1');
    expect(docServices.restoreDocument).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      conflictStrategy: 'skip',
    });
  });

  test('hard deletes a soft-deleted document (owner)', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    const auditServices = createMockAuditServices();
    const activityServices = createMockActivityServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
    }));

    const app = createTestApp({ docServices, vaultServices, auditServices, activityServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/permanent', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_owner' },
    });

    expect(response.status).toBe(204);
    expect(docServices.hardDeleteDocument).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
    });
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.deleted',
        metadata: expect.objectContaining({ deletion_type: 'permanent' }),
      }),
    );
    expect(activityServices.emitActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'document.deleted',
        auditEventId: 'aud_1',
        metadata: expect.objectContaining({ deletion_type: 'permanent' }),
      }),
    );
  });

  test('forbids hard delete for member role', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'viewer',
      aiAccessLevel: 'none',
      isAdmin: false,
    }));

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/permanent', {
      method: 'DELETE',
      headers: { 'x-test-user-id': 'usr_member' },
    });

    expect(response.status).toBe(403);
  });});
