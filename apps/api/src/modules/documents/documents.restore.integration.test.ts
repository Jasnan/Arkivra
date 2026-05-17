import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { parseConfig } from '../config/config.js';
import { setupDatabase } from '../database/database.js';
import {
  documentsTable,
  usersTable,
  vaultFoldersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createDocumentsServices } from './documents.services.js';

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

  async function createFixture({
    testName,
    folderStates,
    fileName = 'invoice.pdf',
    hash = `${testName}-hash`,
  }: {
    testName: string;
    folderStates: {
      projects: boolean;
      year: boolean;
      contracts: boolean;
    };
    fileName?: string;
    hash?: string;
  }) {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const db = database.db;
    const userId = `usr_${uniquePrefix}_${testName}`;
    const vaultId = `vlt_${uniquePrefix}_${testName}`;
    const projectsId = `fld_${uniquePrefix}_${testName}_projects`;
    const yearId = `fld_${uniquePrefix}_${testName}_2025`;
    const contractsId = `fld_${uniquePrefix}_${testName}_contracts`;
    const documentId = `doc_${uniquePrefix}_${testName}`;
    const deletedAt = new Date('2026-01-01T00:00:00.000Z');

    createdUserIds.push(userId);

    await db.insert(usersTable).values({
      id: userId,
      email: `${uniquePrefix}-${testName}@example.com`,
      name: 'Restore Tester',
    });
    await db.insert(vaultsTable).values({
      id: vaultId,
      name: `Restore ${testName}`,
      createdBy: userId,
    });
    await db.insert(vaultFoldersTable).values([
      {
        id: projectsId,
        vaultId,
        parentId: null,
        createdBy: userId,
        name: 'projects',
        isDeleted: folderStates.projects,
        deletedAt: folderStates.projects ? deletedAt : null,
        deletedBy: folderStates.projects ? userId : null,
      },
      {
        id: yearId,
        vaultId,
        parentId: projectsId,
        createdBy: userId,
        name: '2025',
        isDeleted: folderStates.year,
        deletedAt: folderStates.year ? deletedAt : null,
        deletedBy: folderStates.year ? userId : null,
      },
      {
        id: contractsId,
        vaultId,
        parentId: yearId,
        createdBy: userId,
        name: 'contracts',
        isDeleted: folderStates.contracts,
        deletedAt: folderStates.contracts ? deletedAt : null,
        deletedBy: folderStates.contracts ? userId : null,
      },
    ]);
    await db.insert(documentsTable).values({
      id: documentId,
      vaultId,
      folderId: contractsId,
      createdBy: userId,
      originalName: fileName,
      originalSize: 1024,
      originalStorageKey: `${vaultId}/${documentId}`,
      originalSha256Hash: hash,
      name: fileName,
      mimeType: 'application/pdf',
      isDeleted: true,
      deletedAt,
      deletedBy: userId,
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

    return {
      db,
      services,
      ids: {
        userId,
        vaultId,
        projectsId,
        yearId,
        contractsId,
        documentId,
      },
    };
  }

  async function getDocument(documentId: string) {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const [document] = await database.db
      .select({
        folderId: documentsTable.folderId,
        originalName: documentsTable.originalName,
        name: documentsTable.name,
        isDeleted: documentsTable.isDeleted,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1);

    return document;
  }

  async function getFolder(folderId: string) {
    if (database === null) {
      throw new Error('Database not initialized');
    }

    const [folder] = await database.db
      .select({
        parentId: vaultFoldersTable.parentId,
        isDeleted: vaultFoldersTable.isDeleted,
        deletedAt: vaultFoldersTable.deletedAt,
      })
      .from(vaultFoldersTable)
      .where(eq(vaultFoldersTable.id, folderId))
      .limit(1);

    return folder;
  }

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
});
