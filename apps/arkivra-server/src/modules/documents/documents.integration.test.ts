import { describe, expect, test, vi } from 'vitest';
import {
  createMockActivityServices,
  createMockAuditServices,
  createMockDocumentsServices,
  createMockVaultsServices,
  createTestApp,
} from './documents.routes.test-helpers.js';

describe('documents integration', () => {
  test('returns 401 for unauthenticated document listing', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents');

    expect(response.status).toBe(401);
  });

  test('returns 403 when user has no vault access', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => null);

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/documents', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(403);
  });

  test('returns 403 for admin without explicit membership when listing documents', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: null,
      isAdmin: true,
      isMember: false,
    }));

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/vaults/vlt_1/documents', {
      headers: { 'x-test-user-id': 'usr_root' },
    });

    expect(response.status).toBe(403);
    expect(docServices.listDocuments).not.toHaveBeenCalled();
  });

  test('returns 403 when member lacks documents.create permission', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).getVaultForUser = vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'viewer',
      isAdmin: false,
    }));

    const app = createTestApp({ docServices, vaultServices });
    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(403);
  });

  test('lists documents in vault for authenticated member', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].id).toBe('doc_1');
    expect(docServices.listDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      includeDeleted: false,
      tagId: undefined,
      sortBy: 'created_desc',
      folderId: undefined,
    });
  });

  test('lists deleted documents across accessible vaults', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).listUserVaults = vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Vault One',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'owner',
        isAdmin: false,
      },
      {
        id: 'vlt_2',
        name: 'Vault Two',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'viewer',
        isAdmin: false,
      },
    ]);

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/trash', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.documents).toHaveLength(1);
    expect(body.retentionDays).toBe(30);
    expect(docServices.listDeletedDocuments).toHaveBeenCalledWith({
      vaultIds: ['vlt_1', 'vlt_2'],
    });
  });

  test('filters deleted documents by requested accessible vault', async () => {
    const docServices = createMockDocumentsServices();
    const vaultServices = createMockVaultsServices();
    (vaultServices as any).listUserVaults = vi.fn(async () => [
      {
        id: 'vlt_1',
        name: 'Vault One',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'owner',
        isAdmin: false,
      },
      {
        id: 'vlt_2',
        name: 'Vault Two',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        deletedAt: null,
        role: 'viewer',
        isAdmin: false,
      },
    ]);

    const app = createTestApp({ docServices, vaultServices });

    const response = await app.request('/api/trash?vaultId=vlt_2', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.listDeletedDocuments).toHaveBeenCalledWith({
      vaultIds: ['vlt_2'],
    });
  });

  test('filters documents by tag id', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents?tagId=tag_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.listDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      includeDeleted: false,
      tagId: 'tag_1',
      sortBy: 'created_desc',
      folderId: undefined,
    });
  });

  test('passes sort by to document listing', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents?sortBy=name_desc', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.listDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      includeDeleted: false,
      tagId: undefined,
      sortBy: 'name_desc',
      folderId: undefined,
    });
  });

  test('filters documents by root folder id sentinel', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents?folderId=root', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    expect(docServices.listDocuments).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      includeDeleted: false,
      tagId: undefined,
      sortBy: 'created_desc',
      folderId: null,
    });
  });

  test('queues retry processing jobs for failed documents without re-uploading', async () => {
    const docServices = createMockDocumentsServices();
    const documentQueue = { enqueueProcessDocument: vi.fn(async () => undefined) };
    const activityServices = createMockActivityServices();
    const auditServices = createMockAuditServices();
    const app = createTestApp({ docServices, documentQueue, activityServices, auditServices });

    const response = await app.request('/api/vaults/vlt_1/documents/retry-processing', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'usr_1',
      },
      body: JSON.stringify({ documentIds: ['doc_failed_1'] }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      queued: 1,
      skipped: 0,
      matched: 1,
      requested: 1,
      documents: [
        {
          documentId: 'doc_failed_1',
          documentVersionId: 'dvr_failed_1',
          processingStatus: 'queued',
        },
      ],
    });
    expect(docServices.listDocumentProcessingRetryCandidates).toHaveBeenCalledWith({
      vaultId: 'vlt_1',
      documentIds: ['doc_failed_1'],
      folderId: undefined,
      includeSubfolders: true,
      force: false,
    });
    expect(documentQueue.enqueueProcessDocument).toHaveBeenCalledWith({
      documentId: 'doc_failed_1',
      documentVersionId: 'dvr_failed_1',
      vaultId: 'vlt_1',
      replaceExisting: true,
    });
    expect(docServices.updateDocumentVersionProcessingStatus).toHaveBeenCalledWith({
      documentId: 'doc_failed_1',
      documentVersionId: 'dvr_failed_1',
      vaultId: 'vlt_1',
      processingStatus: 'queued',
    });
    expect(activityServices.emitActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'document.processing_status_changed',
        documentId: 'doc_failed_1',
        metadata: expect.objectContaining({ processing_status: 'queued', retry: true }),
      }),
    );
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.processing_retry_queued',
        metadata: expect.objectContaining({ queued_count: 1 }),
      }),
    );
  });

  test('uploads a document', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const activityServices = createMockActivityServices();
    const app = createTestApp({ docServices, auditServices, activityServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.document.id).toBe('doc_test_1');
    expect(body.document.name).toBe('test.txt');
    expect(body.document.originalName).toBe('test.txt');
    expect(body.documentVersionId).toBe('dvr_test_1');
    expect(body.documentVersion.id).toBe('dvr_test_1');
    expect(body.skipped).toBe(false);
    expect(docServices.uploadDocument).toHaveBeenCalledTimes(1);
    expect(docServices.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'test.txt',
        mimeType: 'text/plain',
      }),
    );
    expect(auditServices.emitAuditEvent).toHaveBeenCalledTimes(1);
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.uploaded',
        eventCategory: 'document',
        outcome: 'success',
        vaultId: 'vlt_1',
        documentId: 'doc_test_1',
        metadata: {
          file_name: 'test.txt',
          file_size: 100,
          mime_type: 'text/plain',
        },
      }),
    );
    expect(auditServices.emitAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'document.version_created' }),
    );
    expect(activityServices.emitActivityEvent).toHaveBeenCalledTimes(1);
    expect(activityServices.emitActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'document.created',
        documentId: 'doc_test_1',
      }),
    );
    expect(activityServices.emitActivityEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ activityType: 'document.version_created' }),
    );
  });

  test('audits a direct new-version upload without duplicate upload events', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).uploadDocument = vi.fn(async ({ fileName, mimeType, vaultId }) => ({
      document: {
        id: 'doc_existing_1',
        vaultId,
        folderId: null,
        currentVersionId: 'dvr_test_2',
        name: fileName.normalize('NFC').trim(),
        originalName: fileName.normalize('NFC').trim(),
        originalSize: 100,
        mimeType,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      },
      documentVersion: {
        id: 'dvr_test_2',
        documentId: 'doc_existing_1',
        vaultId,
        versionNumber: 2,
        uploadedBy: 'usr_1',
        uploadedAt: new Date('2025-01-02T00:00:00.000Z'),
        originalName: fileName.normalize('NFC').trim(),
        originalSize: 100,
        originalStorageKey: 'vlt_1/dvr_test_2',
        originalSha256Hash: 'def456',
        mimeType,
        content: null,
        rawText: null,
        rawMarkdown: null,
        parserStructuredOutput: null,
        language: null,
        parserEngine: null,
        parserEngineVersion: null,
        parserWarnings: null,
        processingStatus: 'pending',
        fileEncryptionKeyWrapped: null,
        fileEncryptionKekVersion: null,
        fileEncryptionAlgorithm: null,
        restoredFromVersionId: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
        updatedAt: new Date('2025-01-02T00:00:00.000Z'),
        isCurrent: true,
        document: {
          id: 'doc_existing_1',
          vaultId,
          name: fileName.normalize('NFC').trim(),
          folderId: null,
          currentVersionId: 'dvr_test_2',
          isDeleted: false,
          deletedAt: null,
        },
      },
      duplicate: false,
      skipped: false,
      existingId: null,
      duplicateScope: null,
      conflictType: null,
    }));
    const auditServices = createMockAuditServices();
    const activityServices = createMockActivityServices();
    const app = createTestApp({ docServices, auditServices, activityServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world v2'], 'test.txt', { type: 'text/plain' }));
    formData.append('conflictStrategy', 'new_version');

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(201);
    expect(docServices.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        conflictStrategy: 'new_version',
      }),
    );
    expect(auditServices.emitAuditEvent).toHaveBeenCalledTimes(1);
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.version_created',
        documentId: 'doc_existing_1',
        target: expect.objectContaining({ type: 'document_version', id: 'dvr_test_2' }),
        metadata: expect.objectContaining({
          document_version_id: 'dvr_test_2',
          version_number: 2,
        }),
      }),
    );
    expect(auditServices.emitAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'document.uploaded' }),
    );
    expect(activityServices.emitActivityEvent).toHaveBeenCalledTimes(1);
    expect(activityServices.emitActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'document.version_created',
        documentId: 'doc_existing_1',
      }),
    );
    expect(activityServices.emitActivityEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ activityType: 'document.created' }),
    );
  });

  test('infers known image MIME types during upload when the browser omits the file type', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['image'], 'scan.webp', { type: '' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(201);
    expect(docServices.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'scan.webp',
        mimeType: 'image/webp',
      }),
    );
  });

  test('passes keep_both conflict strategy for direct upload', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));
    formData.append('conflictStrategy', 'keep_both');

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(201);
    expect(docServices.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        conflictStrategy: 'keep_both',
      }),
    );
  });

  test('returns 400 for invalid direct upload conflict strategy', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));
    formData.append('conflictStrategy', 'replace');

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('upload.invalid_conflict_strategy');
    expect(docServices.uploadDocument).not.toHaveBeenCalled();
  });

  test('returns 409 for duplicate document upload', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).uploadDocument = vi.fn(async () => ({
      document: null,
      duplicate: true,
      existingId: 'doc_existing_1',
      duplicateScope: 'active',
    }));

    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.duplicate');
    expect(body.error.existingId).toBe('doc_existing_1');
    expect(body.error.duplicateScope).toBe('active');
    expect(body.error.message).toBe('A document with this file already exists in this vault');
    expect(body.error.conflictType).toBe('hash');
    expect(body.error.availableStrategies).toEqual(['skip', 'keep_both']);
  });

  test('returns structured name conflict response for direct upload', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).uploadDocument = vi.fn(async () => ({
      document: null,
      documentVersion: null,
      duplicate: true,
      skipped: false,
      existingId: 'doc_existing_1',
      duplicateScope: 'active',
      conflictType: 'name',
    }));

    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.name_conflict');
    expect(body.error.existingId).toBe('doc_existing_1');
    expect(body.error.conflictType).toBe('name');
    expect(body.error.availableStrategies).toEqual(['skip', 'keep_both', 'new_version']);
  });

  test('returns skipped direct upload result', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).uploadDocument = vi.fn(async () => ({
      document: null,
      documentVersion: null,
      duplicate: false,
      skipped: true,
      existingId: 'doc_existing_1',
      duplicateScope: 'active',
      conflictType: 'name',
    }));

    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));
    formData.append('conflictStrategy', 'skip');

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.skipped).toBe(true);
    expect(body.document).toBeNull();
    expect(body.documentVersionId).toBeNull();
    expect(body.existingId).toBe('doc_existing_1');
  });

  test('returns 409 with trash-aware messaging for duplicate document upload in trash', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).uploadDocument = vi.fn(async () => ({
      document: null,
      duplicate: true,
      existingId: 'doc_existing_trashed_1',
      duplicateScope: 'trash',
    }));

    const app = createTestApp({ docServices });

    const formData = new FormData();
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }));

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: { 'x-test-user-id': 'usr_1' },
      body: formData,
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.duplicate');
    expect(body.error.existingId).toBe('doc_existing_trashed_1');
    expect(body.error.duplicateScope).toBe('trash');
    expect(body.error.message).toContain('trash');
  });

  test('returns 400 for upload without multipart form data', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents', {
      method: 'POST',
      headers: {
        'x-test-user-id': 'usr_1',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'test' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.invalid_upload');
  });

  test('gets document details', async () => {
    const docServices = createMockDocumentsServices();
    const auditServices = createMockAuditServices();
    const app = createTestApp({ docServices, auditServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.document.id).toBe('doc_1');
    expect(docServices.getDocument).toHaveBeenCalledWith({ documentId: 'doc_1', vaultId: 'vlt_1' });
    expect(auditServices.emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document.viewed',
        vaultId: 'vlt_1',
        documentId: 'doc_1',
        metadata: { file_name: 'report.pdf', access_method: 'open' },
      }),
    );
  });

  test('returns 404 for non-existent document', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).getDocument = vi.fn(async () => null);

    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_missing', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.not_found');
  });

  test('lists stored document chunks', async () => {
    const docServices = createMockDocumentsServices();
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_1/chunks', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.chunks).toHaveLength(1);
    expect(body.chunks[0]).toMatchObject({
      id: 'chk_1',
      content: 'Stored chunk content',
      section: 'Policy scope',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(docServices.listDocumentChunks).toHaveBeenCalledWith({
      documentId: 'doc_1',
      vaultId: 'vlt_1',
    });
  });

  test('returns 404 when listing chunks for a non-existent document', async () => {
    const docServices = createMockDocumentsServices();
    (docServices as any).listDocumentChunks = vi.fn(async () => null);
    const app = createTestApp({ docServices });

    const response = await app.request('/api/vaults/vlt_1/documents/doc_missing/chunks', {
      headers: { 'x-test-user-id': 'usr_1' },
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe('document.not_found');
  });

});
