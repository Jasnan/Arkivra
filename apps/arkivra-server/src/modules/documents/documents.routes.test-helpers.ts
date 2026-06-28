import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ServerContext } from '../server/server.types.js';
import type { DocumentsServices } from './documents.services.js';
import type { VaultsServices } from '../vaults/vaults.services.js';
import type { createAuditServices } from '../audit/audit.services.js';
import type { createActivityServices } from '../activity/activity.services.js';
import { Hono } from 'hono';
import { vi } from 'vitest';
import { registerVaultRoutes } from '../vaults/vaults.routes.js';
import { registerDocumentRoutes } from './documents.routes.js';
import { registerAuditRoutes } from '../audit/audit.routes.js';
import { registerActivityRoutes } from '../activity/activity.routes.js';

export function createMockDocumentsServices() {
  const documentVersion = {
    id: 'dvr_1',
    documentId: 'doc_1',
    vaultId: 'vlt_1',
    versionNumber: 2,
    uploadedBy: 'usr_1',
    uploadedAt: new Date('2025-01-01T00:00:00.000Z'),
    originalName: 'report.pdf',
    originalSize: 1024,
    originalStorageKey: 'vlt_1/dvr_1',
    originalSha256Hash: 'abc123',
    mimeType: 'application/pdf',
    content: 'Extracted text',
    rawText: 'Raw text',
    rawMarkdown: '# Extracted text',
    parserStructuredOutput: { ok: true },
    language: null,
    parserEngine: 'docling',
    parserEngineVersion: '1.0.0',
    parserWarnings: null,
    processingStatus: 'completed',
    processingErrorCode: null,
    processingErrorMessage: null,
    processingFailedAt: null,
    fileEncryptionKeyWrapped: null,
    fileEncryptionKekVersion: null,
    fileEncryptionAlgorithm: null,
    restoredFromVersionId: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    isCurrent: true,
    document: {
      id: 'doc_1',
      vaultId: 'vlt_1',
      name: 'report.pdf',
      folderId: null,
      currentVersionId: 'dvr_1',
      isDeleted: false,
      deletedAt: null,
    },
  };
  const services = {
    uploadDocument: vi.fn(async ({ fileName, mimeType, vaultId }) => ({
      document: {
        id: 'doc_test_1',
        vaultId,
        folderId: null,
        currentVersionId: 'dvr_test_1',
        name: fileName.normalize('NFC').trim(),
        originalName: fileName.normalize('NFC').trim(),
        originalSize: 100,
        mimeType,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      documentVersion: {
        id: 'dvr_test_1',
        versionNumber: 1,
        documentId: 'doc_test_1',
      },
      duplicate: false,
      skipped: false,
      existingId: null,
      duplicateScope: null,
      conflictType: null,
    })),
    downloadDocument: vi.fn(async () => ({
      fileData: Buffer.from('file-content'),
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 12,
    })),
    previewDocumentFile: vi.fn(async () => ({
      fileData: Buffer.from('file-content'),
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 12,
    })),
    renderDocumentPagePreview: vi.fn(async ({ pageNumber }) => ({
      fileData: Buffer.from(`png-page-${pageNumber}`),
      mimeType: 'image/png',
      etag: `"page-${pageNumber}"`,
      pageNumber,
    })),
    renderDocumentVersionPagePreview: vi.fn(async ({ pageNumber }) => ({
      fileData: Buffer.from(`png-version-page-${pageNumber}`),
      mimeType: 'image/png',
      etag: `"version-page-${pageNumber}"`,
      pageNumber,
    })),
    getChunkAsset: vi.fn(async () => ({
      assetType: 'image',
      mimeType: 'image/png',
      fileData: Buffer.from('asset-bytes'),
      sourceElementId: 'docling-image-1',
      byteSize: 11,
      etag: '"asset-1"',
    })),
    listDocuments: vi.fn(async () => [
      {
        id: 'doc_1',
        name: 'report.pdf',
        originalName: 'report.pdf',
        folderId: null,
        originalSize: 1024,
        mimeType: 'application/pdf',
        processingStatus: 'completed',
        processingErrorCode: null,
        processingErrorMessage: null,
        processingFailedAt: null,
        language: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        isDeleted: false,
        deletedAt: null,
      },
    ]),
    getDocument: vi.fn(async () => ({
      id: 'doc_1',
      name: 'report.pdf',
      originalName: 'report.pdf',
      folderId: null,
      originalSize: 1024,
      originalSha256Hash: 'abc123',
      mimeType: 'application/pdf',
      content: '',
      processingStatus: 'completed',
      processingErrorCode: null,
      processingErrorMessage: null,
      processingFailedAt: null,
      language: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      isDeleted: false,
      deletedAt: null,
      createdBy: 'Jane Doe',
    })),
    resolveLatestDocumentVersion: vi.fn(async () => ({
      id: 'dvr_1',
      documentId: 'doc_1',
      vaultId: 'vlt_1',
      versionNumber: 1,
    })),
    resolveDocumentVersion: vi.fn(async () => documentVersion),
    listDocumentVersions: vi.fn(async () => [documentVersion]),
    listDocumentProcessingRetryCandidates: vi.fn(async () => ({
      candidates: [
        {
          documentId: 'doc_failed_1',
          documentVersionId: 'dvr_failed_1',
          vaultId: 'vlt_1',
          name: 'failed.pdf',
          processingStatus: 'failed',
        },
      ],
      skipped: [],
      requestedCount: 1,
      matchedCount: 1,
    })),
    getDocumentVersionDeletionImpact: vi.fn(async () => ({
      success: true,
      impact: {
        affectedConversationCount: 2,
        affectedConversations: [
          {
            id: 'cht_1',
            title: 'HR Policy Review',
            createdAt: new Date('2025-01-02T00:00:00.000Z'),
            updatedAt: new Date('2025-01-03T00:00:00.000Z'),
          },
          {
            id: 'cht_2',
            title: 'Employee Benefits',
            createdAt: new Date('2025-01-04T00:00:00.000Z'),
            updatedAt: new Date('2025-01-05T00:00:00.000Z'),
          },
        ],
        limit: 5,
      },
    })),
    getDocumentDeletionImpact: vi.fn(async () => ({
      success: true,
      impact: {
        affectedConversationCount: 2,
        affectedConversations: [
          {
            id: 'cht_1',
            title: 'HR Policy Review',
            createdAt: new Date('2025-01-02T00:00:00.000Z'),
            updatedAt: new Date('2025-01-03T00:00:00.000Z'),
          },
          {
            id: 'cht_2',
            title: 'Employee Benefits',
            createdAt: new Date('2025-01-04T00:00:00.000Z'),
            updatedAt: new Date('2025-01-05T00:00:00.000Z'),
          },
        ],
        limit: 5,
        versionCount: 4,
      },
    })),
    getBulkDocumentDeletionImpact: vi.fn(async () => ({
      success: true,
      impact: {
        documentCount: 500,
        versionCount: 914,
        affectedConversationCount: 124,
      },
    })),
    downloadDocumentVersion: vi.fn(async () => ({
      fileData: Buffer.from('version-file-content'),
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      size: 20,
      documentVersion,
    })),
    listDocumentChunks: vi.fn(async () => [
      {
        id: 'chk_1',
        chunkIndex: 0,
        content: 'Stored chunk content',
        originalText: 'Stored chunk content',
        section: 'Policy scope',
        sectionPath: ['Policy scope'],
        pageNumber: null,
        pageStart: null,
        pageEnd: null,
        chunkType: 'paragraph',
        tokenCount: 12,
        parserEngine: 'docling',
        citationPrecision: 'document',
        sourceElementIds: ['#/texts/1'],
        metadata: { doclingFilename: 'Policy.txt' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]),
    listDocumentVersionChunks: vi.fn(async () => [
      {
        id: 'chk_version_1',
        chunkIndex: 0,
        content: 'Historical chunk content',
        originalText: 'Historical chunk content',
        section: 'Policy scope',
        sectionPath: ['Policy scope'],
        pageNumber: 1,
        pageStart: 1,
        pageEnd: 1,
        chunkType: 'paragraph',
        tokenCount: 12,
        parserEngine: 'docling',
        citationPrecision: 'page',
        sourceElementIds: ['#/texts/1'],
        metadata: { doclingFilename: 'Policy.txt' },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]),
    renameDocument: vi.fn(async ({ name }) => ({
      success: true,
      document: {
        id: 'doc_1',
        name,
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    })),
    moveDocument: vi.fn(async ({ folderId }) => ({
      success: true,
      document: {
        id: 'doc_1',
        folderId,
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    })),
    updateDocumentLanguage: vi.fn(async ({ language }) => ({
      id: 'doc_1',
      language,
      updatedAt: '2025-01-01T00:00:00.000Z',
    })),
    listDeletedDocuments: vi.fn(async () => [
      {
        id: 'doc_deleted_1',
        vaultId: 'vlt_1',
        vaultName: 'Vault One',
        name: 'trashed.pdf',
        originalName: 'trashed.pdf',
        originalSize: 1024,
        mimeType: 'application/pdf',
        language: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-10T00:00:00.000Z',
        isDeleted: true,
        deletedAt: '2025-01-10T00:00:00.000Z',
      },
    ]),
    softDeleteDocument: vi.fn(async () => ({ id: 'doc_1' })),
    restoreDocument: vi.fn(async () => ({
      success: true,
      id: 'doc_1',
      folderId: null,
      originalName: 'report.pdf',
      hierarchyRecreated: false,
    })),
    hardDeleteDocument: vi.fn(async () => ({ success: true, id: 'doc_1' })),
    restoreDocumentVersion: vi.fn(async () => ({
      success: true,
      sourceVersion: { ...documentVersion, id: 'dvr_source_1', versionNumber: 1, isCurrent: false },
      documentVersion: {
        ...documentVersion,
        id: 'dvr_restored_1',
        versionNumber: 3,
        restoredFromVersionId: 'dvr_source_1',
      },
      copiedEmbeddingIndexIds: [],
    })),
    deleteDocumentVersion: vi.fn(async () => ({
      success: true,
      documentVersion: { ...documentVersion, isCurrent: false },
    })),
    updateDocumentProcessingStatus: vi.fn(async () => undefined),
    updateDocumentVersionProcessingStatus: vi.fn(async () => undefined),
  };

  return services as unknown as DocumentsServices;
}

export function createMockDocumentQueue() {
  return {
    enqueueProcessDocument: vi.fn(async () => undefined),
  };
}

export function createMockEmbeddingIndexQueue() {
  return {
    enqueueDocumentIndexing: vi.fn(async () => undefined),
  };
}

export function createMockAdminAiServices({ aiFeaturesEnabled = true } = {}) {
  return {
    getSettings: vi.fn(async () => ({
      aiFeaturesEnabled,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      embedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'bge-m3',
        dimensions: 1024,
      },
      ollamaHost: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
    })),
  };
}

export function createMockVaultsServices() {
  return {
    createVault: vi.fn(),
    getMember: vi.fn(async () => null),
    getVaultForUser: vi.fn(async () => ({
      id: 'vlt_1',
      name: 'Test',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      deletedAt: null,
      role: 'owner',
      aiAccessLevel: 'none',
      isAdmin: false,
    })),
    listMembers: vi.fn(async () => []),
    listUserVaults: vi.fn(async () => []),
    removeMember: vi.fn(),
    hardDeleteVault: vi.fn(),
    updateVaultIdentity: vi.fn(),
    upsertMember: vi.fn(),
  } as unknown as VaultsServices;
}

export function createMockAuditServices() {
  const now = new Date('2025-01-02T00:00:00.000Z');
  return {
    emitAuditEvent: vi.fn(async (input: any) => ({
      id: 'aud_1',
      createdAt: now,
      occurredAt: now,
      eventType: input.eventType,
      eventCategory: input.eventCategory,
      outcome: input.outcome,
      actorId: input.actor?.id ?? null,
      actorType: input.actor?.type ?? 'unknown',
      actorDisplayName: input.actor?.displayName ?? null,
      vaultId: input.vaultId ?? null,
      documentId: input.documentId ?? null,
      targetType: input.target?.type ?? null,
      targetId: input.target?.id ?? null,
      targetDisplayName: input.target?.displayName ?? null,
      source: input.source ?? 'api',
      ipAddress: input.requestContext?.ipAddress ?? null,
      userAgent: input.requestContext?.userAgent ?? null,
      requestId: input.requestContext?.requestId ?? null,
      metadata: input.metadata ?? null,
      before: null,
      after: null,
      schemaVersion: 1,
    })),
    listDocumentActivity: vi.fn(async () => ({
      events: [
        {
          id: 'aud_upload',
          createdAt: now,
          occurredAt: now,
          eventType: 'document.uploaded',
          eventCategory: 'document',
          outcome: 'success',
          actorId: 'usr_1',
          actorType: 'user',
          actorDisplayName: 'Jane',
          vaultId: 'vlt_1',
          documentId: 'doc_1',
          targetType: 'document',
          targetId: 'doc_1',
          targetDisplayName: 'report.pdf',
          source: 'web',
          ipAddress: null,
          userAgent: null,
          requestId: null,
          metadata: { file_name: 'report.pdf', token: 'nope' },
          before: null,
          after: null,
          schemaVersion: 1,
        },
        {
          id: 'aud_denied',
          createdAt: now,
          occurredAt: now,
          eventType: 'document.access_denied',
          eventCategory: 'permission',
          outcome: 'denied',
          actorId: 'usr_2',
          actorType: 'user',
          actorDisplayName: 'John',
          vaultId: 'vlt_1',
          documentId: 'doc_1',
          targetType: 'document',
          targetId: 'doc_1',
          targetDisplayName: null,
          source: 'web',
          ipAddress: null,
          userAgent: null,
          requestId: null,
          metadata: { action: 'view' },
          before: null,
          after: null,
          schemaVersion: 1,
        },
      ],
      nextCursor: null,
    })),
    listVaultAuditEvents: vi.fn(async () => ({
      events: [
        {
          id: 'aud_delete',
          createdAt: now,
          occurredAt: now,
          eventType: 'document.deleted',
          eventCategory: 'document',
          outcome: 'success',
          actorId: 'usr_owner',
          actorType: 'user',
          actorDisplayName: 'Owner',
          vaultId: 'vlt_1',
          documentId: 'doc_1',
          targetType: 'document',
          targetId: 'doc_1',
          targetDisplayName: 'report.pdf',
          source: 'web',
          ipAddress: null,
          userAgent: null,
          requestId: null,
          metadata: { document_name: 'report.pdf', deletion_type: 'soft' },
          before: null,
          after: null,
          schemaVersion: 1,
        },
      ],
      nextCursor: null,
    })),
  } as unknown as ReturnType<typeof createAuditServices>;
}

export function createMockActivityServices() {
  return {
    emitActivityEvent: vi.fn(async (input) => ({
      id: 'act_emit',
      createdAt: new Date(),
      occurredAt: input.occurredAt ?? new Date(),
      activityType: input.activityType,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actor?.id ?? null,
      actorType: input.actor?.type ?? 'unknown',
      actorDisplayName: input.actor?.displayName ?? null,
      vaultId: input.vaultId ?? null,
      documentId: input.documentId ?? null,
      targetType: input.target?.type ?? null,
      targetId: input.target?.id ?? null,
      targetDisplayName: input.target?.displayName ?? null,
      source: input.source ?? 'api',
      visibility: input.visibility ?? 'vault_members',
      metadata: input.metadata ?? {},
      auditEventId: input.auditEventId ?? null,
      schemaVersion: input.schemaVersion ?? 1,
    })),
    listDocumentActivity: vi.fn(async () => ({
      events: [
        {
          id: 'act_upload',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          occurredAt: new Date('2026-01-01T00:00:00.000Z'),
          activityType: 'document.created',
          entityType: 'document',
          entityId: 'doc_1',
          actorId: 'usr_1',
          actorType: 'user',
          actorDisplayName: 'User',
          vaultId: 'vlt_1',
          documentId: 'doc_1',
          targetType: 'document',
          targetId: 'doc_1',
          targetDisplayName: 'report.pdf',
          source: 'web',
          visibility: 'vault_members',
          metadata: { file_name: 'report.pdf' },
          auditEventId: null,
          schemaVersion: 1,
        },
      ],
      nextCursor: null,
    })),
    listVaultActivity: vi.fn(async () => ({ events: [], nextCursor: null })),
  } as unknown as ReturnType<typeof createActivityServices>;
}

export function createTestApp({
  docServices,
  vaultServices,
  documentQueue,
  auditServices,
  activityServices,
  adminAiServices,
  embeddingIndexQueue,
  db,
}: {
  docServices: DocumentsServices;
  vaultServices?: VaultsServices;
  documentQueue?: { enqueueProcessDocument: (args: any) => Promise<void> };
  auditServices?: ReturnType<typeof createAuditServices>;
  activityServices?: ReturnType<typeof createActivityServices>;
  adminAiServices?: any;
  embeddingIndexQueue?: any;
  db?: Database;
}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', null);
    context.set('session', null);
    context.set('userDisabled', false);
    context.set('isAdmin', false);
    context.set('vaultId', null);
    context.set('vaultRole', null);

    const userIdHeader = context.req.header('x-test-user-id');

    if (typeof userIdHeader === 'string' && userIdHeader.length > 0) {
      context.set('userId', userIdHeader);
      context.set('session', {
        id: `ses_${userIdHeader}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: userIdHeader,
        expiresAt: new Date(Date.now() + 3600_000),
        token: `tok_${userIdHeader}`,
      });
    }

    await next();
  });

  const mockDb = db ?? ({} as Database);
  const vs = vaultServices ?? createMockVaultsServices();

  registerVaultRoutes({ app, db: mockDb, services: vs, auditServices, activityServices });
  registerDocumentRoutes({
    app,
    db: mockDb,
    storage: {} as StorageDriver,
    encryption: {} as EncryptionServices,
    services: docServices,
    documentQueue,
    retentionDays: 30,
    vaultServices: vs,
    auditServices,
    activityServices,
    adminAiServices,
    embeddingIndexQueue,
  });
  registerActivityRoutes({ app, db: mockDb, services: activityServices });
  registerAuditRoutes({ app, db: mockDb, services: auditServices });

  return app;
}
