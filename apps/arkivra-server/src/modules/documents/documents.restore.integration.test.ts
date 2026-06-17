import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  chatConversationDocumentVersionsTable,
  chatConversationsTable,
  chatMessageCitationsTable,
  chatMessagesTable,
  documentChunkAssetsTable,
  documentChunksTable,
  documentVersionsTable,
  documentsTable,
  usersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createDocumentsServices } from './documents.services.js';
import { createRestoreIntegrationFixtures } from './documents.restore.test-fixtures.js';

type DatabaseHandle = ReturnType<typeof setupDatabase>;

const uniquePrefix = `restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe.sequential('document restore folder hierarchy', () => {
  let database: DatabaseHandle | null = null;
  let createdUserIds: string[] = [];

  beforeAll(() => {
    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PROCESS_MODE: 'web',
        ARKIVRA_DATABASE_URL:
          process.env.ARKIVRA_DATABASE_URL ?? 'postgres://arkivra:arkivra@127.0.0.1:5432/arkivra',
        ARKIVRA_SERVER_BASE_URL: 'http://localhost:1221',
        ARKIVRA_CORS_ORIGINS: 'http://localhost:1221',
        ARKIVRA_AUTH_TRUSTED_ORIGINS: 'http://localhost:1221',
      },
    });

    database = setupDatabase({ config });
  });

  afterEach(async () => {
    if (database === null) {
      return;
    }

    for (const userId of createdUserIds) {
      await database.db.delete(usersTable).where(eq(usersTable.id, userId));
    }

    createdUserIds = [];
  });

  afterAll(async () => {
    await database?.pool.end();
  });

  const { createFixture, createVersionedFixture, getDocument, getFolder } = createRestoreIntegrationFixtures({
    getDatabase: () => database,
    addCreatedUserId: userId => createdUserIds.push(userId),
    uniquePrefix,
  });

  test('resolves latest and explicit document versions within the vault scope', async () => {
    const { services, ids } = await createVersionedFixture({ testName: 'version_resolution' });

    const latest = await services.resolveLatestDocumentVersion({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
    });

    expect(latest).toMatchObject({
      id: ids.version2Id,
      documentId: ids.documentId,
      vaultId: ids.vaultId,
      versionNumber: 2,
      isCurrent: true,
      originalName: 'report-v2.pdf',
      originalStorageKey: `${ids.vaultId}/${ids.version2Id}`,
      processingStatus: 'completed',
      document: {
        id: ids.documentId,
        vaultId: ids.vaultId,
        name: 'report.pdf',
        isDeleted: false,
      },
    });

    const historical = await services.resolveDocumentVersion({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
    });

    expect(historical).toMatchObject({
      id: ids.version1Id,
      versionNumber: 1,
      isCurrent: false,
      originalName: 'report-v1.pdf',
    });

    const versions = await services.listDocumentVersions({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
    });

    expect(versions?.map((version) => version.id)).toEqual([ids.version2Id, ids.version1Id]);

    await expect(
      services.resolveDocumentVersion({
        vaultId: ids.otherVaultId,
        documentId: ids.documentId,
        documentVersionId: ids.version1Id,
      }),
    ).resolves.toBeNull();
  });

  test('creates a logical document with v1 and appends a new current version', async () => {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const db = database.db;
    const testName = 'version_create_contract';
    const userId = `usr_${uniquePrefix}_${testName}`;
    const vaultId = `vlt_${uniquePrefix}_${testName}`;
    createdUserIds.push(userId);

    await db.insert(usersTable).values({
      id: userId,
      email: `${uniquePrefix}-${testName}@example.com`,
      name: 'Version Creator',
    });
    await db.insert(vaultsTable).values({
      id: vaultId,
      name: 'Version Create Contract',
      createdBy: userId,
    });

    const services = createDocumentsServices({
      db,
      storage: {
        read: async () => Buffer.from(''),
        write: async () => undefined,
        remove: async () => undefined,
        exists: async () => true,
      },
      encryption: createEncryptionServices({ kekKeysRaw: undefined }),
    });

    const initial = await services.createLogicalDocumentWithInitialVersion({
      vaultId,
      uploadedBy: userId,
      originalName: 'contract-v1.pdf',
      originalSize: 100,
      originalStorageKey: `${vaultId}/dvr_initial`,
      originalSha256Hash: `${testName}-hash-v1`,
      mimeType: 'application/pdf',
      processingStatus: 'pending',
    });

    expect(initial.version).toMatchObject({
      documentId: initial.document.id,
      vaultId,
      versionNumber: 1,
      isCurrent: true,
      originalName: 'contract-v1.pdf',
    });

    const next = await services.createDocumentVersion({
      vaultId,
      documentId: initial.document.id,
      uploadedBy: userId,
      originalName: 'contract-v2.pdf',
      originalSize: 200,
      originalStorageKey: `${vaultId}/dvr_next`,
      originalSha256Hash: `${testName}-hash-v2`,
      mimeType: 'application/pdf',
      processingStatus: 'queued',
    });

    expect(next).toMatchObject({
      documentId: initial.document.id,
      vaultId,
      versionNumber: 2,
      isCurrent: true,
      originalName: 'contract-v2.pdf',
      processingStatus: 'queued',
    });

    await expect(
      services.resolveLatestDocumentVersion({
        vaultId,
        documentId: initial.document.id,
      }),
    ).resolves.toMatchObject({
      id: next?.id,
      versionNumber: 2,
      originalStorageKey: `${vaultId}/dvr_next`,
    });
  });

  test('applies document and version deletion filters during version resolution', async () => {
    const deletedDocumentFixture = await createVersionedFixture({
      testName: 'version_deleted_document',
      isDeleted: true,
    });
    const deletedVersionFixture = await createVersionedFixture({
      testName: 'version_deleted_version',
      deletedVersionId: 'v1',
    });

    await expect(
      deletedDocumentFixture.services.resolveLatestDocumentVersion({
        vaultId: deletedDocumentFixture.ids.vaultId,
        documentId: deletedDocumentFixture.ids.documentId,
      }),
    ).resolves.toBeNull();

    await expect(
      deletedDocumentFixture.services.resolveLatestDocumentVersion({
        vaultId: deletedDocumentFixture.ids.vaultId,
        documentId: deletedDocumentFixture.ids.documentId,
        includeDeletedDocument: true,
      }),
    ).resolves.toMatchObject({
      id: deletedDocumentFixture.ids.version2Id,
      document: {
        isDeleted: true,
      },
    });

    await expect(
      deletedVersionFixture.services.resolveDocumentVersion({
        vaultId: deletedVersionFixture.ids.vaultId,
        documentId: deletedVersionFixture.ids.documentId,
        documentVersionId: deletedVersionFixture.ids.version1Id,
      }),
    ).resolves.toBeNull();

    await expect(
      deletedVersionFixture.services.resolveDocumentVersion({
        vaultId: deletedVersionFixture.ids.vaultId,
        documentId: deletedVersionFixture.ids.documentId,
        documentVersionId: deletedVersionFixture.ids.version1Id,
        includeDeletedVersion: true,
      }),
    ).resolves.toMatchObject({
      id: deletedVersionFixture.ids.version1Id,
      deletedAt: expect.any(Date),
    });
  });

  test('plans purge cleanup across version-owned source files, previews, and assets', async () => {
    const { db, services, ids } = await createVersionedFixture({ testName: 'version_purge_plan' });
    const chunk1Id = `chk_${uniquePrefix}_version_purge_plan_v1`;
    const chunk2Id = `chk_${uniquePrefix}_version_purge_plan_v2`;

    await db.insert(documentChunksTable).values([
      {
        id: chunk1Id,
        documentId: ids.documentId,
        documentVersionId: ids.version1Id,
        vaultId: ids.vaultId,
        chunkIndex: 0,
        chunkKey: 'chunk-0',
        content: 'version one',
      },
      {
        id: chunk2Id,
        documentId: ids.documentId,
        documentVersionId: ids.version2Id,
        vaultId: ids.vaultId,
        chunkIndex: 0,
        chunkKey: 'chunk-0',
        content: 'version two',
      },
    ]);
    await db.insert(documentChunkAssetsTable).values([
      {
        id: `cas_${uniquePrefix}_version_purge_plan_1`,
        chunkId: chunk1Id,
        documentId: ids.documentId,
        documentVersionId: ids.version1Id,
        vaultId: ids.vaultId,
        assetType: 'image',
        storageKey: `chunks/${ids.version1Id}/chunk-0/image-0.png`,
      },
      {
        id: `cas_${uniquePrefix}_version_purge_plan_2`,
        chunkId: chunk2Id,
        documentId: ids.documentId,
        documentVersionId: ids.version2Id,
        vaultId: ids.vaultId,
        assetType: 'table',
        storageKey: null,
        inlinePayload: '<table></table>',
      },
      {
        id: `cas_${uniquePrefix}_version_purge_plan_3`,
        chunkId: chunk2Id,
        documentId: ids.documentId,
        documentVersionId: ids.version2Id,
        vaultId: ids.vaultId,
        assetType: 'image',
        storageKey: `chunks/${ids.version2Id}/chunk-0/image-0.png`,
      },
    ]);

    const plan = await services.planDocumentPurge({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
    });

    expect(plan).toEqual({
      documentId: ids.documentId,
      vaultId: ids.vaultId,
      versionIds: [ids.version1Id, ids.version2Id],
      sourceStorageKeys: [
        `${ids.vaultId}/${ids.documentId}`,
        `${ids.vaultId}/${ids.version1Id}`,
        `${ids.vaultId}/${ids.version2Id}`,
      ],
      previewStoragePrefixes: [
        `previews/${ids.documentId}`,
        `previews/${ids.version1Id}`,
        `previews/${ids.version2Id}`,
      ],
      chunkAssetStorageKeys: [
        `chunks/${ids.version1Id}/chunk-0/image-0.png`,
        `chunks/${ids.version2Id}/chunk-0/image-0.png`,
      ],
    });

    await expect(
      services.planDocumentPurge({
        vaultId: ids.otherVaultId,
        documentId: ids.documentId,
      }),
    ).resolves.toBeNull();
  });

  test('lists and serves only current-version chunks and assets by default', async () => {
    const { db, services, ids } = await createVersionedFixture({ testName: 'current_chunks' });
    const chunk1Id = `chk_${uniquePrefix}_current_chunks_v1`;
    const chunk2Id = `chk_${uniquePrefix}_current_chunks_v2`;
    const asset1Id = `cas_${uniquePrefix}_current_chunks_v1`;
    const asset2Id = `cas_${uniquePrefix}_current_chunks_v2`;

    await db.insert(documentChunksTable).values([
      {
        id: chunk1Id,
        documentId: ids.documentId,
        documentVersionId: ids.version1Id,
        vaultId: ids.vaultId,
        chunkIndex: 0,
        chunkKey: 'chunk-0',
        content: 'superseded confidential text',
      },
      {
        id: chunk2Id,
        documentId: ids.documentId,
        documentVersionId: ids.version2Id,
        vaultId: ids.vaultId,
        chunkIndex: 0,
        chunkKey: 'chunk-0',
        content: 'current public text',
      },
    ]);

    await db.insert(documentChunkAssetsTable).values([
      {
        id: asset1Id,
        chunkId: chunk1Id,
        documentId: ids.documentId,
        documentVersionId: ids.version1Id,
        vaultId: ids.vaultId,
        assetType: 'table',
        inlinePayload: '<table><tr><td>old</td></tr></table>',
      },
      {
        id: asset2Id,
        chunkId: chunk2Id,
        documentId: ids.documentId,
        documentVersionId: ids.version2Id,
        vaultId: ids.vaultId,
        assetType: 'table',
        inlinePayload: '<table><tr><td>current</td></tr></table>',
      },
    ]);

    await expect(
      services.listDocumentChunks({
        vaultId: ids.vaultId,
        documentId: ids.documentId,
      }),
    ).resolves.toMatchObject([
      {
        id: chunk2Id,
        content: 'current public text',
      },
    ]);

    await expect(
      services.getChunkAsset({
        vaultId: ids.vaultId,
        chunkId: chunk1Id,
        assetId: asset1Id,
        documentVersionId: ids.version1Id,
      }),
    ).resolves.toMatchObject({
      assetType: 'table',
      inlinePayload: '<table><tr><td>old</td></tr></table>',
    });

    await expect(
      services.getChunkAsset({
        vaultId: ids.vaultId,
        chunkId: chunk1Id,
        assetId: asset1Id,
      }),
    ).resolves.toBeNull();

    await expect(
      services.getChunkAsset({
        vaultId: ids.vaultId,
        chunkId: chunk2Id,
        assetId: asset2Id,
      }),
    ).resolves.toMatchObject({
      assetType: 'table',
      inlinePayload: '<table><tr><td>current</td></tr></table>',
    });
  });

  test('clears denormalized parser fields when creating a pending current version', async () => {
    const { db, services, ids } = await createVersionedFixture({
      testName: 'current_pending_clear',
    });

    await db
      .update(documentsTable)
      .set({
        content: 'old extracted text',
        rawText: 'old raw text',
        rawMarkdown: 'old markdown',
        parserStructuredOutput: { old: true },
        language: {
          code: 'en',
          name: 'English',
          source: 'heuristic',
        },
        parserEngine: 'docling',
        parserEngineVersion: 'old',
        parserWarnings: ['old warning'],
      })
      .where(eq(documentsTable.id, ids.documentId));

    const version = await services.createDocumentVersion({
      documentId: ids.documentId,
      vaultId: ids.vaultId,
      uploadedBy: ids.userId,
      originalName: 'report-v3.pdf',
      originalSize: 300,
      originalStorageKey: `${ids.vaultId}/pending-v3`,
      originalSha256Hash: 'pending-v3-hash',
      mimeType: 'application/pdf',
      processingStatus: 'pending',
      makeCurrent: true,
    });

    expect(version).not.toBeNull();

    const [document] = await db
      .select({
        currentVersionId: documentsTable.currentVersionId,
        content: documentsTable.content,
        rawText: documentsTable.rawText,
        rawMarkdown: documentsTable.rawMarkdown,
        parserStructuredOutput: documentsTable.parserStructuredOutput,
        language: documentsTable.language,
        parserEngine: documentsTable.parserEngine,
        parserEngineVersion: documentsTable.parserEngineVersion,
        parserWarnings: documentsTable.parserWarnings,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, ids.documentId))
      .limit(1);

    expect(document).toMatchObject({
      currentVersionId: version?.id,
      content: '',
      rawText: '',
      rawMarkdown: '',
      parserStructuredOutput: null,
      language: null,
      parserEngine: null,
      parserEngineVersion: null,
      parserWarnings: null,
    });
  });

  test('restores a completed historical version as a new current version with copied chunks and assets', async () => {
    const { db, services, ids } = await createVersionedFixture({ testName: 'restore_version' });
    const sourceChunkId = `chk_${uniquePrefix}_restore_version_v1`;
    const sourceAssetId = `cas_${uniquePrefix}_restore_version_v1`;

    await db
      .update(documentVersionsTable)
      .set({
        content: 'version one content',
        rawText: 'version one raw',
        rawMarkdown: '# Version one',
        parserStructuredOutput: { document: 'v1' },
        parserEngine: 'docling',
        parserEngineVersion: '1.0.0',
        parserWarnings: ['warn'],
      })
      .where(eq(documentVersionsTable.id, ids.version1Id));
    await db.insert(documentChunksTable).values({
      id: sourceChunkId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      vaultId: ids.vaultId,
      chunkIndex: 0,
      chunkKey: 'chunk-0',
      content: 'version one chunk',
      contentSha256: 'chunk-hash-v1',
      citationPrecision: 'page',
      pageStart: 1,
      pageEnd: 1,
    });
    await db.insert(documentChunkAssetsTable).values({
      id: sourceAssetId,
      chunkId: sourceChunkId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      vaultId: ids.vaultId,
      assetType: 'table',
      inlinePayload: '<table><tr><td>v1</td></tr></table>',
    });

    const result = await services.restoreDocumentVersion({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      restoredBy: ids.userId,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.documentVersion).toMatchObject({
      documentId: ids.documentId,
      vaultId: ids.vaultId,
      versionNumber: 3,
      restoredFromVersionId: ids.version1Id,
      isCurrent: true,
      content: 'version one content',
      rawMarkdown: '# Version one',
      parserStructuredOutput: { document: 'v1' },
    });

    const restoredChunks = await db
      .select()
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentVersionId, result.documentVersion.id));
    expect(restoredChunks).toHaveLength(1);
    expect(restoredChunks[0]).toMatchObject({
      documentId: ids.documentId,
      vaultId: ids.vaultId,
      chunkIndex: 0,
      content: 'version one chunk',
      contentSha256: 'chunk-hash-v1',
    });
    expect(restoredChunks[0]?.id).not.toBe(sourceChunkId);

    const restoredAssets = await db
      .select()
      .from(documentChunkAssetsTable)
      .where(eq(documentChunkAssetsTable.documentVersionId, result.documentVersion.id));
    expect(restoredAssets).toHaveLength(1);
    expect(restoredAssets[0]).toMatchObject({
      chunkId: restoredChunks[0]?.id,
      inlinePayload: '<table><tr><td>v1</td></tr></table>',
    });

    await expect(
      services.resolveLatestDocumentVersion({
        vaultId: ids.vaultId,
        documentId: ids.documentId,
      }),
    ).resolves.toMatchObject({ id: result.documentVersion.id, versionNumber: 3 });
  });

  test('deletes only unreferenced historical versions and clears source-derived rows', async () => {
    const { db, services, ids } = await createVersionedFixture({ testName: 'delete_version' });
    const sourceChunkId = `chk_${uniquePrefix}_delete_version_v1`;
    const sourceAssetId = `cas_${uniquePrefix}_delete_version_v1`;

    await db.insert(documentChunksTable).values({
      id: sourceChunkId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      vaultId: ids.vaultId,
      chunkIndex: 0,
      chunkKey: 'chunk-0',
      content: 'historical chunk',
    });
    await db.insert(documentChunkAssetsTable).values({
      id: sourceAssetId,
      chunkId: sourceChunkId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      vaultId: ids.vaultId,
      assetType: 'table',
      inlinePayload: '<table><tr><td>old</td></tr></table>',
    });

    const current = await services.deleteDocumentVersion({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version2Id,
      deletedBy: ids.userId,
    });
    expect(current).toEqual({ success: false, reason: 'current_version' });

    const result = await services.deleteDocumentVersion({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      deletedBy: ids.userId,
    });
    expect(result.success).toBe(true);

    const [version] = await db
      .select()
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.id, ids.version1Id));
    expect(version).toMatchObject({
      content: '',
      rawText: '',
      rawMarkdown: '',
      parserStructuredOutput: null,
      deletedBy: ids.userId,
    });
    expect(version?.deletedAt).toBeInstanceOf(Date);

    await expect(
      db
        .select()
        .from(documentChunksTable)
        .where(eq(documentChunksTable.documentVersionId, ids.version1Id)),
    ).resolves.toHaveLength(0);
    await expect(
      db
        .select()
        .from(documentChunkAssetsTable)
        .where(eq(documentChunkAssetsTable.documentVersionId, ids.version1Id)),
    ).resolves.toHaveLength(0);
  });

  test('allows historical version deletion when only chat manifests reference it', async () => {
    const { db, services, ids } = await createVersionedFixture({
      testName: 'delete_version_manifest',
    });
    const conversationId = `cht_${uniquePrefix}_delete_version_manifest`;

    await db.insert(chatConversationsTable).values({
      id: conversationId,
      vaultId: ids.vaultId,
      userId: ids.userId,
      scope: 'document',
      documentId: ids.documentId,
      contextSnapshot: {
        type: 'document',
        vaultId: ids.vaultId,
        documentId: ids.documentId,
      },
      contextFrozenAt: new Date(),
      title: 'Referenced version chat',
    });
    await db.insert(chatConversationDocumentVersionsTable).values({
      conversationId,
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      includedBy: 'document',
    });

    const impact = await services.getDocumentVersionDeletionImpact({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
    });
    expect(impact).toEqual({
      success: true,
      impact: {
        affectedConversationCount: 0,
        affectedConversations: [],
        limit: 5,
      },
    });

    const result = await services.deleteDocumentVersion({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      deletedBy: ids.userId,
    });
    expect(result.success).toBe(true);

    const [version] = await db
      .select({ deletedAt: documentVersionsTable.deletedAt })
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.id, ids.version1Id));
    expect(version?.deletedAt).toBeInstanceOf(Date);
  });

  test('allows historical version deletion when chat citations reference it and returns citation impact', async () => {
    const { db, services, ids } = await createVersionedFixture({
      testName: 'delete_version_citation',
    });
    const conversationIds = [
      `cht_${uniquePrefix}_delete_version_citation_1`,
      `cht_${uniquePrefix}_delete_version_citation_2`,
      `cht_${uniquePrefix}_delete_version_citation_3`,
    ];

    await db.insert(chatConversationsTable).values(
      conversationIds.map((conversationId, index) => ({
        id: conversationId,
        vaultId: ids.vaultId,
        userId: ids.userId,
        scope: 'document' as const,
        documentId: ids.documentId,
        contextSnapshot: {
          type: 'document' as const,
          vaultId: ids.vaultId,
          documentId: ids.documentId,
        },
        contextFrozenAt: new Date(),
        title: ['HR Policy Review', 'Employee Benefits', 'Payroll Questions'][index]!,
        createdAt: new Date(`2026-01-0${index + 1}T00:00:00.000Z`),
        updatedAt: new Date(`2026-01-0${index + 1}T01:00:00.000Z`),
      })),
    );
    await db.insert(chatMessagesTable).values(
      conversationIds.map((conversationId, index) => ({
        id: `msg_${uniquePrefix}_delete_version_citation_${index}`,
        conversationId,
        vaultId: ids.vaultId,
        userId: ids.userId,
        scope: 'document' as const,
        documentId: ids.documentId,
        message: {
          id: `msg_${uniquePrefix}_delete_version_citation_${index}`,
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: `answer ${index}` }],
        },
      })),
    );
    await db.insert(chatMessageCitationsTable).values(
      conversationIds.map((conversationId, index) => ({
        id: `cmc_${uniquePrefix}_delete_version_citation_${index}`,
        conversationId,
        messageId: `msg_${uniquePrefix}_delete_version_citation_${index}`,
        vaultId: ids.vaultId,
        documentId: ids.documentId,
        documentVersionId: ids.version1Id,
        versionNumber: 1,
      })),
    );

    const impact = await services.getDocumentVersionDeletionImpact({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      limit: 2,
    });
    expect(impact.success).toBe(true);
    if (!impact.success) {
      return;
    }
    expect(impact.impact.affectedConversationCount).toBe(3);
    expect(impact.impact.affectedConversations).toHaveLength(2);
    expect(impact.impact.affectedConversations.map((conversation) => conversation.title)).toEqual([
      'Payroll Questions',
      'Employee Benefits',
    ]);

    const documentImpact = await services.getDocumentDeletionImpact({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      limit: 2,
    });
    expect(documentImpact.success).toBe(true);
    if (!documentImpact.success) {
      return;
    }
    expect(documentImpact.impact).toMatchObject({
      affectedConversationCount: 3,
      versionCount: 2,
      limit: 2,
    });

    const result = await services.deleteDocumentVersion({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      documentVersionId: ids.version1Id,
      deletedBy: ids.userId,
    });
    expect(result.success).toBe(true);

    const citations = await db
      .select({
        conversationId: chatMessageCitationsTable.conversationId,
        documentVersionId: chatMessageCitationsTable.documentVersionId,
      })
      .from(chatMessageCitationsTable)
      .where(eq(chatMessageCitationsTable.documentId, ids.documentId));
    expect(citations).toHaveLength(3);
    expect(citations.every((citation) => citation.documentVersionId === ids.version1Id)).toBe(true);
  });

  test('restores into an existing hierarchy', async () => {
    const { services, ids } = await createFixture({
      testName: 'existing',
      folderStates: { projects: false, year: false, contracts: false },
    });

    const result = await services.restoreDocument({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
    });

    expect(result).toMatchObject({
      success: true,
      id: ids.documentId,
      folderId: ids.contractsId,
      originalName: 'invoice.pdf',
      hierarchyRecreated: false,
    });
    await expect(getDocument(ids.documentId)).resolves.toMatchObject({
      folderId: ids.contractsId,
      originalName: 'invoice.pdf',
      isDeleted: false,
    });
  });

  test('recreates a partially missing hierarchy', async () => {
    const { services, ids } = await createFixture({
      testName: 'partial',
      folderStates: { projects: false, year: true, contracts: true },
    });

    const result = await services.restoreDocument({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
    });

    expect(result).toMatchObject({
      success: true,
      folderId: ids.contractsId,
      hierarchyRecreated: true,
    });
    await expect(getFolder(ids.projectsId)).resolves.toMatchObject({ isDeleted: false });
    await expect(getFolder(ids.yearId)).resolves.toMatchObject({
      parentId: ids.projectsId,
      isDeleted: false,
      deletedAt: null,
    });
    await expect(getFolder(ids.contractsId)).resolves.toMatchObject({
      parentId: ids.yearId,
      isDeleted: false,
      deletedAt: null,
    });
  });

  test('recreates a fully missing hierarchy', async () => {
    const { services, ids } = await createFixture({
      testName: 'full',
      folderStates: { projects: true, year: true, contracts: true },
    });

    const result = await services.restoreDocument({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
    });

    expect(result).toMatchObject({
      success: true,
      folderId: ids.contractsId,
      hierarchyRecreated: true,
    });
    await expect(getFolder(ids.projectsId)).resolves.toMatchObject({
      parentId: null,
      isDeleted: false,
    });
    await expect(getFolder(ids.yearId)).resolves.toMatchObject({
      parentId: ids.projectsId,
      isDeleted: false,
    });
    await expect(getFolder(ids.contractsId)).resolves.toMatchObject({
      parentId: ids.yearId,
      isDeleted: false,
    });
  });

  test('generates collision-safe restored filenames', async () => {
    const { db, services, ids } = await createFixture({
      testName: 'collision',
      folderStates: { projects: false, year: false, contracts: false },
    });

    await db.insert(documentsTable).values([
      {
        id: `doc_${uniquePrefix}_collision_active_original`,
        vaultId: ids.vaultId,
        folderId: ids.contractsId,
        createdBy: ids.userId,
        originalName: 'invoice.pdf',
        originalSize: 512,
        originalStorageKey: `${ids.vaultId}/collision-active-original`,
        originalSha256Hash: 'collision-active-original-hash',
        name: 'invoice.pdf',
        mimeType: 'application/pdf',
      },
      {
        id: `doc_${uniquePrefix}_collision_active_restored`,
        vaultId: ids.vaultId,
        folderId: ids.contractsId,
        createdBy: ids.userId,
        originalName: 'invoice (restored).pdf',
        originalSize: 512,
        originalStorageKey: `${ids.vaultId}/collision-active-restored`,
        originalSha256Hash: 'collision-active-restored-hash',
        name: 'invoice (restored).pdf',
        mimeType: 'application/pdf',
      },
    ]);

    const result = await services.restoreDocument({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
    });

    expect(result).toMatchObject({
      success: true,
      originalName: 'invoice (restored 2).pdf',
    });
    await expect(getDocument(ids.documentId)).resolves.toMatchObject({
      originalName: 'invoice (restored 2).pdf',
      name: 'invoice (restored 2).pdf',
      isDeleted: false,
    });
  });

  test('leaves hierarchy deleted when restore fails cleanly', async () => {
    const { db, services, ids } = await createFixture({
      testName: 'failure',
      folderStates: { projects: true, year: true, contracts: true },
      hash: 'duplicate-hash',
    });

    await db.insert(documentsTable).values({
      id: `doc_${uniquePrefix}_failure_active_duplicate`,
      vaultId: ids.vaultId,
      folderId: null,
      createdBy: ids.userId,
      originalName: 'duplicate.pdf',
      originalSize: 512,
      originalStorageKey: `${ids.vaultId}/failure-active-duplicate`,
      originalSha256Hash: 'duplicate-hash',
      name: 'duplicate.pdf',
      mimeType: 'application/pdf',
    });

    const result = await services.restoreDocument({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
    });

    expect(result).toMatchObject({
      success: false,
      reason: 'duplicate',
    });
    await expect(getDocument(ids.documentId)).resolves.toMatchObject({ isDeleted: true });
    await expect(getFolder(ids.projectsId)).resolves.toMatchObject({ isDeleted: true });
    await expect(getFolder(ids.yearId)).resolves.toMatchObject({ isDeleted: true });
    await expect(getFolder(ids.contractsId)).resolves.toMatchObject({ isDeleted: true });
  });

  test('restores duplicate active document when keep_both strategy is selected', async () => {
    const { db, services, ids } = await createFixture({
      testName: 'duplicate_keep_both',
      folderStates: { projects: false, year: false, contracts: false },
      hash: 'duplicate-keep-both-hash',
    });

    await db.insert(documentsTable).values({
      id: `doc_${uniquePrefix}_duplicate_keep_both_active`,
      vaultId: ids.vaultId,
      folderId: ids.contractsId,
      createdBy: ids.userId,
      originalName: 'invoice.pdf',
      originalSize: 512,
      originalStorageKey: `${ids.vaultId}/duplicate-keep-both-active`,
      originalSha256Hash: 'duplicate-keep-both-hash',
      name: 'invoice.pdf',
      mimeType: 'application/pdf',
    });

    const result = await services.restoreDocument({
      vaultId: ids.vaultId,
      documentId: ids.documentId,
      conflictStrategy: 'keep_both',
    });

    expect(result).toMatchObject({
      success: true,
      originalName: 'invoice (restored).pdf',
    });
    await expect(getDocument(ids.documentId)).resolves.toMatchObject({
      originalName: 'invoice (restored).pdf',
      name: 'invoice (restored).pdf',
      isDeleted: false,
    });
  });

  test('creates initial upload versions and reports same-name conflicts', async () => {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const db = database.db;
    const userId = `usr_${uniquePrefix}_upload_conflict`;
    const vaultId = `vlt_${uniquePrefix}_upload_conflict`;
    createdUserIds.push(userId);

    await db.insert(usersTable).values({
      id: userId,
      email: `${uniquePrefix}-upload-conflict@example.com`,
      name: 'Upload Conflict Tester',
    });
    await db.insert(vaultsTable).values({
      id: vaultId,
      name: 'Upload Conflict',
      createdBy: userId,
    });

    const storageWrites = new Map<string, Buffer>();
    const services = createDocumentsServices({
      db,
      storage: {
        read: async (key) => storageWrites.get(key) ?? Buffer.from(''),
        write: async (key, data) => {
          storageWrites.set(key, data);
        },
        remove: async (key) => {
          storageWrites.delete(key);
        },
        exists: async (key) => storageWrites.has(key),
      },
      encryption: createEncryptionServices({ kekKeysRaw: undefined }),
    });

    const first = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('first-version'),
    });

    expect(first).toMatchObject({
      duplicate: false,
      skipped: false,
      documentVersion: {
        versionNumber: 1,
        originalName: 'report.pdf',
      },
    });
    expect(first.document?.currentVersionId).toBe(first.documentVersion?.id);
    expect(first.documentVersion?.originalStorageKey).toBe(
      `${vaultId}/${first.documentVersion?.id}`,
    );
    expect(storageWrites.has(first.documentVersion?.originalStorageKey ?? '')).toBe(true);

    const conflict = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('second-version'),
    });

    expect(conflict).toMatchObject({
      duplicate: true,
      existingId: first.document?.id,
      duplicateScope: 'active',
      conflictType: 'name',
    });

    const hashConflict = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'duplicate-name.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('first-version'),
    });

    expect(hashConflict).toMatchObject({
      duplicate: true,
      existingId: first.document?.id,
      duplicateScope: 'active',
      conflictType: 'hash',
    });

    const skippedHash = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'duplicate-name.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('first-version'),
      conflictStrategy: 'skip',
    });

    expect(skippedHash).toMatchObject({
      duplicate: false,
      skipped: true,
      existingId: first.document?.id,
      conflictType: 'hash',
    });

    await db
      .update(documentsTable)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(documentsTable.id, first.document?.id ?? ''));

    const reuploaded = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('first-version'),
    });

    expect(reuploaded).toMatchObject({
      duplicate: false,
      skipped: false,
      documentVersion: {
        versionNumber: 1,
        originalName: 'report.pdf',
      },
    });
    expect(reuploaded.document?.id).not.toBe(first.document?.id);
  });

  test('resolves upload conflicts with skip, keep_both, and new_version', async () => {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const db = database.db;
    const userId = `usr_${uniquePrefix}_upload_strategy`;
    const vaultId = `vlt_${uniquePrefix}_upload_strategy`;
    createdUserIds.push(userId);

    await db.insert(usersTable).values({
      id: userId,
      email: `${uniquePrefix}-upload-strategy@example.com`,
      name: 'Upload Strategy Tester',
    });
    await db.insert(vaultsTable).values({
      id: vaultId,
      name: 'Upload Strategy',
      createdBy: userId,
    });

    const storageWrites = new Map<string, Buffer>();
    const services = createDocumentsServices({
      db,
      storage: {
        read: async (key) => storageWrites.get(key) ?? Buffer.from(''),
        write: async (key, data) => {
          storageWrites.set(key, data);
        },
        remove: async (key) => {
          storageWrites.delete(key);
        },
        exists: async (key) => storageWrites.has(key),
      },
      encryption: createEncryptionServices({ kekKeysRaw: undefined }),
    });

    const first = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('first-version'),
    });
    const firstDocumentId = first.document?.id;
    expect(firstDocumentId).toBeTruthy();

    const skipped = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('skip-version'),
      conflictStrategy: 'skip',
    });

    expect(skipped).toMatchObject({
      duplicate: false,
      skipped: true,
      existingId: firstDocumentId,
      conflictType: 'name',
    });

    const keepBoth = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('keep-both-version'),
      conflictStrategy: 'keep_both',
    });

    expect(keepBoth).toMatchObject({
      duplicate: false,
      skipped: false,
      document: {
        originalName: 'report (1).pdf',
        name: 'report (1).pdf',
      },
      documentVersion: {
        versionNumber: 1,
        originalName: 'report.pdf',
      },
    });
    expect(keepBoth.document?.id).not.toBe(firstDocumentId);

    const newVersion = await services.finalizeUploadedDocument({
      vaultId,
      userId,
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('new-version'),
      conflictStrategy: 'new_version',
    });

    expect(newVersion).toMatchObject({
      duplicate: false,
      skipped: false,
      document: {
        id: firstDocumentId,
        currentVersionId: newVersion.documentVersion?.id,
      },
      documentVersion: {
        documentId: firstDocumentId,
        versionNumber: 2,
        originalName: 'report.pdf',
      },
    });

    const versions = await db
      .select()
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.documentId, firstDocumentId!));

    expect(versions).toHaveLength(2);
  });
});
