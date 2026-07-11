import { and, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  chatConversationDocumentVersionsTable,
  chatConversationsTable,
  documentChunksTable,
  documentVersionsTable,
  documentsTable,
  usersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createDocumentSearchServices } from '../search/search.services.js';
import { buildManifestHybridSearchArgs, createChatServices } from '../chat/chat.services.js';
import type { StorageDriver } from '../storage/storage.types.js';
import { createDocumentsServices } from './documents.services.js';

type DatabaseHandle = ReturnType<typeof setupDatabase>;

const uniquePrefix = `versioning-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe.sequential('document versioning smoke regression', () => {
  let database: DatabaseHandle | null = null;
  const createdUserIds: string[] = [];
  const removedStorageKeys: string[] = [];

  beforeAll(() => {
    const { config } = parseConfig({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ARKIVRA_PROCESS_ROLE: 'web',
        ARKIVRA_ENCRYPTION_KEYS: process.env.ARKIVRA_ENCRYPTION_KEYS ?? `1:${'a'.repeat(64)}`,
        ARKIVRA_DOCLING_URL: process.env.ARKIVRA_DOCLING_URL ?? 'http://127.0.0.1:5001',
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

    createdUserIds.length = 0;
    removedStorageKeys.length = 0;
  });

  afterAll(async () => {
    await database?.pool.end();
  });

  async function insertCompletedVersion({
    documentId,
    id,
    userId,
    vaultId,
    versionNumber,
    text,
  }: {
    documentId: string;
    id: string;
    userId: string;
    vaultId: string;
    versionNumber: number;
    text: string;
  }) {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    await database.db.insert(documentVersionsTable).values({
      id,
      documentId,
      vaultId,
      versionNumber,
      uploadedBy: userId,
      originalName: `smoke-v${versionNumber}.txt`,
      originalSize: text.length,
      originalStorageKey: `${vaultId}/${id}`,
      originalSha256Hash: `${id}-hash`,
      mimeType: 'text/plain',
      content: text,
      rawText: text,
      rawMarkdown: text,
      processingStatus: 'completed',
    });
    await database.db.insert(documentChunksTable).values({
      id: `chk_${id}`,
      documentId,
      documentVersionId: id,
      vaultId,
      chunkIndex: 0,
      chunkKey: `${id}:0`,
      content: text,
      tokenCount: 4,
      metadata: {},
    });
  }

  test('preserves frozen chat context across upload, restore, blocked delete, and purge', async () => {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const db = database.db;
    const suffix = `${uniquePrefix}_lifecycle`;
    const userId = `usr_${suffix}`;
    const vaultId = `vlt_${suffix}`;
    const documentId = `doc_${suffix}`;
    const v1Id = `dvr_${suffix}_v1`;
    const v2Id = `dvr_${suffix}_v2`;
    const v3Id = `dvr_${suffix}_v3`;
    const chat1Id = `cht_${suffix}_v1`;
    const chat2Id = `cht_${suffix}_v4`;
    createdUserIds.push(userId);

    const storage: StorageDriver = {
      read: async () => Buffer.from('source bytes'),
      write: async () => undefined,
      remove: async (key: string) => {
        removedStorageKeys.push(key);
      },
      exists: async () => true,
    };
    const documentsServices = createDocumentsServices({
      db,
      storage,
      encryption: createEncryptionServices({ kekKeysRaw: undefined }),
    });
    const searchServices = createDocumentSearchServices({ db });
    const chatServices = createChatServices({
      db,
      searchServices,
      documentsServices,
      resolveAiSettings: async () => ({
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.2',
        allowedModels: ['llama3.2'],
        maxImagesPerRequest: 0,
      }),
      listAvailableModels: async () => [
        { provider: 'ollama', model: 'llama3.2', value: 'ollama:llama3.2' },
      ],
    });

    await db.insert(usersTable).values({
      id: userId,
      email: `${suffix}@example.com`,
      name: 'Versioning Smoke Tester',
    });
    await db
      .insert(vaultsTable)
      .values({ id: vaultId, name: 'Versioning Smoke Vault', createdBy: userId });
    await db.insert(documentsTable).values({
      id: documentId,
      vaultId,
      createdBy: userId,
      originalName: 'smoke.txt',
      originalSize: 13,
      originalStorageKey: `${vaultId}/${v1Id}`,
      originalSha256Hash: `${v1Id}-hash`,
      name: 'smoke.txt',
      mimeType: 'text/plain',
      content: 'alpha v1 only',
      rawText: 'alpha v1 only',
      rawMarkdown: 'alpha v1 only',
      processingStatus: 'completed',
    });
    await insertCompletedVersion({
      documentId,
      id: v1Id,
      userId,
      vaultId,
      versionNumber: 1,
      text: 'alpha v1 only',
    });
    await db
      .update(documentsTable)
      .set({ currentVersionId: v1Id })
      .where(eq(documentsTable.id, documentId));

    await db.insert(chatConversationsTable).values({
      id: chat1Id,
      vaultId,
      documentId,
      scope: 'document',
      contextSnapshot: { type: 'document', vaultId, documentId, documentName: 'smoke.txt' },
      userId,
      title: 'v1 chat',
      contextFrozenAt: new Date(),
    });
    await db.insert(chatConversationDocumentVersionsTable).values({
      conversationId: chat1Id,
      vaultId,
      documentId,
      documentVersionId: v1Id,
      includedBy: 'document',
    });

    await insertCompletedVersion({
      documentId,
      id: v2Id,
      userId,
      vaultId,
      versionNumber: 2,
      text: 'beta v2 latest',
    });
    await db
      .update(documentsTable)
      .set({
        currentVersionId: v2Id,
        content: 'beta v2 latest',
        rawText: 'beta v2 latest',
        rawMarkdown: 'beta v2 latest',
      })
      .where(eq(documentsTable.id, documentId));
    await insertCompletedVersion({
      documentId,
      id: v3Id,
      userId,
      vaultId,
      versionNumber: 3,
      text: 'gamma v3 latest',
    });
    await db
      .update(documentsTable)
      .set({
        currentVersionId: v3Id,
        content: 'gamma v3 latest',
        rawText: 'gamma v3 latest',
        rawMarkdown: 'gamma v3 latest',
      })
      .where(eq(documentsTable.id, documentId));

    const latestSearch = await searchServices.searchDocuments({
      vaultIds: [vaultId],
      query: 'gamma',
      pageIndex: 0,
      pageSize: 10,
    });
    expect(latestSearch.results.some((result) => result.documentId === documentId)).toBe(true);
    const historicalSearch = await searchServices.searchDocuments({
      vaultIds: [vaultId],
      query: 'alpha',
      pageIndex: 0,
      pageSize: 10,
      includeVersions: 'historical',
    });
    expect(historicalSearch.results.some((result) => result.documentVersionId === v1Id)).toBe(true);
    const defaultOldSearch = await searchServices.searchDocuments({
      vaultIds: [vaultId],
      query: 'alpha',
      pageIndex: 0,
      pageSize: 10,
    });
    expect(defaultOldSearch.results.some((result) => result.documentId === documentId)).toBe(false);

    const manifest1 = await db
      .select()
      .from(chatConversationDocumentVersionsTable)
      .where(eq(chatConversationDocumentVersionsTable.conversationId, chat1Id));
    const oldChatArgs = buildManifestHybridSearchArgs({
      manifestRows: manifest1,
      query: 'alpha',
      limit: 5,
    });
    expect(oldChatArgs?.documentVersionIds).toEqual([v1Id]);
    const oldChatSearch = await searchServices.searchHybrid({ ...oldChatArgs!, mode: 'fts' });
    expect(oldChatSearch.citations.some((citation) => citation.documentVersionId === v1Id)).toBe(
      true,
    );

    const restored = await documentsServices.restoreDocumentVersion({
      vaultId,
      documentId,
      documentVersionId: v1Id,
      restoredBy: userId,
    });
    expect(restored.success).toBe(true);
    if (!restored.success) {
      throw new Error('restore failed');
    }
    expect(restored.documentVersion.versionNumber).toBe(4);
    expect(restored.documentVersion.id).not.toBe(v1Id);

    await db.insert(chatConversationsTable).values({
      id: chat2Id,
      vaultId,
      documentId,
      scope: 'document',
      contextSnapshot: { type: 'document', vaultId, documentId, documentName: 'smoke.txt' },
      userId,
      title: 'v4 chat',
      contextFrozenAt: new Date(),
    });
    await db.insert(chatConversationDocumentVersionsTable).values({
      conversationId: chat2Id,
      vaultId,
      documentId,
      documentVersionId: restored.documentVersion.id,
      includedBy: 'document',
    });
    const manifest2 = await db
      .select()
      .from(chatConversationDocumentVersionsTable)
      .where(eq(chatConversationDocumentVersionsTable.conversationId, chat2Id));
    expect(manifest2).toHaveLength(1);
    expect(manifest2[0]?.documentVersionId).toBe(restored.documentVersion.id);

    const referencedDelete = await documentsServices.deleteDocumentVersion({
      vaultId,
      documentId,
      documentVersionId: v1Id,
      deletedBy: userId,
    });
    expect(referencedDelete).toMatchObject({ success: true });

    const softDeleted = await documentsServices.softDeleteDocument({
      vaultId,
      documentId,
      deletedBy: userId,
    });
    expect(softDeleted).not.toBeNull();
    const hardDeleted = await documentsServices.hardDeleteDocument({ vaultId, documentId });
    expect(hardDeleted).toEqual({ success: true, id: documentId });

    const purgedSearch = await searchServices.searchDocuments({
      vaultIds: [vaultId],
      query: 'alpha',
      pageIndex: 0,
      pageSize: 10,
      includeVersions: 'historical',
    });
    expect(purgedSearch.results.some((result) => result.documentId === documentId)).toBe(false);

    const oldChat = await chatServices.getConversation({ userId, chatId: chat1Id });
    expect(oldChat?.contextAvailability).toMatchObject({
      status: 'source_unavailable',
      readOnly: true,
      unavailableTypes: ['document'],
    });
    const refsAfterPurge = await db
      .select()
      .from(chatConversationDocumentVersionsTable)
      .where(eq(chatConversationDocumentVersionsTable.conversationId, chat1Id));
    expect(refsAfterPurge).toHaveLength(1);
    expect(refsAfterPurge[0]?.documentVersionId).toBeNull();
    expect(
      buildManifestHybridSearchArgs({ manifestRows: refsAfterPurge, query: 'alpha', limit: 5 }),
    ).toBeNull();

    const versionRowsAfterPurge = await db
      .select({ id: documentVersionsTable.id })
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.documentId, documentId),
          eq(documentVersionsTable.vaultId, vaultId),
        ),
      );
    expect(versionRowsAfterPurge).toHaveLength(0);
    expect(removedStorageKeys.length).toBeGreaterThan(0);

    await db
      .delete(chatConversationsTable)
      .where(sql`${chatConversationsTable.userId} = ${userId}`);
  });
});
