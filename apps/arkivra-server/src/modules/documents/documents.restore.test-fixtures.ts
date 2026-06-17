import { eq } from 'drizzle-orm';
import type { setupDatabase } from '../database/database.js';
import {
  documentVersionsTable,
  documentsTable,
  usersTable,
  vaultFoldersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createEncryptionServices } from '../encryption/encryption.services.js';
import { createDocumentsServices } from './documents.services.js';

type DatabaseHandle = ReturnType<typeof setupDatabase>;

export function createRestoreIntegrationFixtures({
  getDatabase,
  addCreatedUserId,
  uniquePrefix,
}: {
  getDatabase: () => DatabaseHandle | null;
  addCreatedUserId: (userId: string) => void;
  uniquePrefix: string;
}) {
  function getDatabaseOrThrow() {
    const database = getDatabase();

    if (database === null) {
      throw new Error('Database not initialized');
    }

    return database;
  }
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
    const database = getDatabaseOrThrow();
    const db = database.db;
    const userId = `usr_${uniquePrefix}_${testName}`;
    const vaultId = `vlt_${uniquePrefix}_${testName}`;
    const projectsId = `fld_${uniquePrefix}_${testName}_projects`;
    const yearId = `fld_${uniquePrefix}_${testName}_2025`;
    const contractsId = `fld_${uniquePrefix}_${testName}_contracts`;
    const documentId = `doc_${uniquePrefix}_${testName}`;
    const deletedAt = new Date('2026-01-01T00:00:00.000Z');
  
    addCreatedUserId(userId);
  
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
  
  async function createVersionedFixture({
    testName,
    isDeleted = false,
    deletedVersionId,
  }: {
    testName: string;
    isDeleted?: boolean;
    deletedVersionId?: 'v1' | 'v2';
  }) {
    const database = getDatabaseOrThrow();
    const db = database.db;
    const userId = `usr_${uniquePrefix}_${testName}`;
    const vaultId = `vlt_${uniquePrefix}_${testName}`;
    const otherVaultId = `vlt_${uniquePrefix}_${testName}_other`;
    const documentId = `doc_${uniquePrefix}_${testName}`;
    const version1Id = `dvr_${uniquePrefix}_${testName}_v1`;
    const version2Id = `dvr_${uniquePrefix}_${testName}_v2`;
    const deletedAt = new Date('2026-01-02T00:00:00.000Z');
  
    addCreatedUserId(userId);
  
    await db.insert(usersTable).values({
      id: userId,
      email: `${uniquePrefix}-${testName}@example.com`,
      name: 'Version Tester',
    });
    await db.insert(vaultsTable).values([
      {
        id: vaultId,
        name: `Version ${testName}`,
        createdBy: userId,
      },
      {
        id: otherVaultId,
        name: `Version ${testName} Other`,
        createdBy: userId,
      },
    ]);
    await db.insert(documentsTable).values({
      id: documentId,
      vaultId,
      folderId: null,
      createdBy: userId,
      originalName: 'report-v2.pdf',
      originalSize: 200,
      originalStorageKey: `${vaultId}/${documentId}`,
      originalSha256Hash: `${testName}-hash-v2`,
      name: 'report.pdf',
      mimeType: 'application/pdf',
      processingStatus: 'completed',
      isDeleted,
      deletedAt: isDeleted ? deletedAt : null,
      deletedBy: isDeleted ? userId : null,
    });
    await db.insert(documentVersionsTable).values([
      {
        id: version1Id,
        documentId,
        vaultId,
        versionNumber: 1,
        uploadedBy: userId,
        originalName: 'report-v1.pdf',
        originalSize: 100,
        originalStorageKey: `${vaultId}/${version1Id}`,
        originalSha256Hash: `${testName}-hash-v1`,
        mimeType: 'application/pdf',
        processingStatus: 'completed',
        deletedAt: deletedVersionId === 'v1' ? deletedAt : null,
        deletedBy: deletedVersionId === 'v1' ? userId : null,
      },
      {
        id: version2Id,
        documentId,
        vaultId,
        versionNumber: 2,
        uploadedBy: userId,
        originalName: 'report-v2.pdf',
        originalSize: 200,
        originalStorageKey: `${vaultId}/${version2Id}`,
        originalSha256Hash: `${testName}-hash-v2`,
        mimeType: 'application/pdf',
        processingStatus: 'completed',
        deletedAt: deletedVersionId === 'v2' ? deletedAt : null,
        deletedBy: deletedVersionId === 'v2' ? userId : null,
      },
    ]);
    await db
      .update(documentsTable)
      .set({ currentVersionId: version2Id })
      .where(eq(documentsTable.id, documentId));
  
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
        otherVaultId,
        documentId,
        version1Id,
        version2Id,
      },
    };
  }
  
  async function getDocument(documentId: string) {
    const database = getDatabaseOrThrow();
  
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
    const database = getDatabaseOrThrow();
  
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
  
  
  return {
    createFixture,
    createVersionedFixture,
    getDocument,
    getFolder,
  };
}
