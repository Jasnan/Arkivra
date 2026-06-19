import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { and, asc, desc, eq, exists, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  documentChunkAssetsTable,
  documentEmbeddingIndexStatusTable,
  documentTagsTable,
  documentVersionsTable,
  documentsTable,
  embeddingIndexesTable,
  usersTable,
  vaultFoldersTable,
  vaultsTable,
} from '../database/schema/index.js';
import type { SearchSortBy } from '../search/search.types.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import type {
  DocumentLanguageMetadata,
  DocumentProcessingStatus,
  DocumentPurgePlan,
  HardDeleteDocumentResult,
  MoveDocumentResult,
  RenameDocumentResult,
} from './documents.service-types.js';
import {
  documentVersionChunkAssetStoragePrefix,
  legacyDocumentPagePreviewStoragePrefix,
  documentVersionPagePreviewStoragePrefix,
} from './document-storage-keys.js';
import { createDocumentDeletionImpactServices } from './documents.deletion-impact-services.js';
import { createDocumentFileServices } from './documents.file-services.js';
import { normalizeDocumentFileName } from './documents.naming.js';
import { createDocumentRestoreServices } from './documents.restore-services.js';
import { createDocumentUploadServices } from './documents.upload-services.js';
import { createDocumentVersionLifecycleServices } from './documents.version-lifecycle-services.js';
import { createDocumentVersionServices } from './documents.version-services.js';

export type DocumentsServices = ReturnType<typeof createDocumentsServices>;
export { normalizeDocumentFileName } from './documents.naming.js';

export function createDocumentsServices({
  db,
  storage,
  encryption,
}: {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
}) {
  function getFolderCondition(folderId: string | null) {
    return folderId === null
      ? isNull(documentsTable.folderId)
      : eq(documentsTable.folderId, folderId);
  }

  async function getActiveFolderInVault({
    vaultId,
    folderId,
  }: {
    vaultId: string;
    folderId: string | null;
  }) {
    if (folderId === null) {
      return { id: null };
    }

    const [folder] = await db
      .select({ id: vaultFoldersTable.id })
      .from(vaultFoldersTable)
      .where(
        and(
          eq(vaultFoldersTable.id, folderId),
          eq(vaultFoldersTable.vaultId, vaultId),
          eq(vaultFoldersTable.isDeleted, false),
        ),
      )
      .limit(1);

    return folder ?? null;
  }

  async function findActiveDocumentNameCollision({
    vaultId,
    folderId,
    name,
    excludeDocumentId,
  }: {
    vaultId: string;
    folderId: string | null;
    name: string;
    excludeDocumentId?: string;
  }) {
    const normalizedName = name.trim().toLocaleLowerCase();
    const conditions = [
      eq(documentsTable.vaultId, vaultId),
      eq(documentsTable.isDeleted, false),
      getFolderCondition(folderId),
      sql`LOWER(${documentsTable.name}) = ${normalizedName}`,
    ];

    if (excludeDocumentId !== undefined) {
      conditions.push(ne(documentsTable.id, excludeDocumentId));
    }

    const [existing] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(and(...conditions))
      .limit(1);

    return existing ?? null;
  }

  async function findActiveDocumentFileNameCollision({
    vaultId,
    folderId,
    fileName,
    excludeDocumentId,
  }: {
    vaultId: string;
    folderId: string | null;
    fileName: string;
    excludeDocumentId?: string;
  }) {
    const normalizedFileName = normalizeDocumentFileName(fileName).toLocaleLowerCase();
    const conditions = [
      eq(documentsTable.vaultId, vaultId),
      eq(documentsTable.isDeleted, false),
      getFolderCondition(folderId),
      sql`LOWER(${documentsTable.originalName}) = ${normalizedFileName}`,
    ];

    if (excludeDocumentId !== undefined) {
      conditions.push(ne(documentsTable.id, excludeDocumentId));
    }

    const [existing] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(and(...conditions))
      .limit(1);

    return existing ?? null;
  }

  const versionServices = createDocumentVersionServices({ db });
  const {
    createDocumentVersion,
    createLogicalDocumentWithInitialVersion,
    documentVersionSelectFields,
    listDocumentVersions,
    resolveDocumentVersion,
    resolveLatestDocumentVersion,
    toDocumentVersionSummary,
  } = versionServices;

  async function planDocumentPurge({
    documentId,
    vaultId,
  }: {
    documentId: string;
    vaultId: string;
  }): Promise<DocumentPurgePlan | null> {
    const [document] = await db
      .select({
        id: documentsTable.id,
        originalStorageKey: documentsTable.originalStorageKey,
      })
      .from(documentsTable)
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
      .limit(1);

    if (document === undefined) {
      return null;
    }

    const versions = await db
      .select({
        id: documentVersionsTable.id,
        originalStorageKey: documentVersionsTable.originalStorageKey,
      })
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.documentId, documentId),
          eq(documentVersionsTable.vaultId, vaultId),
        ),
      )
      .orderBy(asc(documentVersionsTable.versionNumber));

    const assetRows = await db
      .select({
        storageKey: documentChunkAssetsTable.storageKey,
      })
      .from(documentChunkAssetsTable)
      .where(
        and(
          eq(documentChunkAssetsTable.documentId, documentId),
          eq(documentChunkAssetsTable.vaultId, vaultId),
        ),
      );

    const sourceStorageKeys = new Set<string>();
    sourceStorageKeys.add(document.originalStorageKey);
    for (const version of versions) {
      sourceStorageKeys.add(version.originalStorageKey);
    }

    const chunkAssetStorageKeys = new Set<string>();
    for (const asset of assetRows) {
      if (asset.storageKey !== null) {
        chunkAssetStorageKeys.add(asset.storageKey);
      }
    }

    const previewStoragePrefixes = new Set<string>();
    previewStoragePrefixes.add(legacyDocumentPagePreviewStoragePrefix(document.id));
    for (const version of versions) {
      previewStoragePrefixes.add(documentVersionPagePreviewStoragePrefix(version.id));
    }

    return {
      documentId: document.id,
      vaultId,
      versionIds: versions.map((version) => version.id),
      sourceStorageKeys: [...sourceStorageKeys],
      previewStoragePrefixes: [...previewStoragePrefixes],
      chunkAssetStorageKeys: [...chunkAssetStorageKeys],
    };
  }

  const uploadServices = createDocumentUploadServices({
    db,
    storage,
    encryption,
    versionServices,
    findActiveDocumentFileNameCollision,
  });
  const { finalizeUploadedDocument, uploadDocument } = uploadServices;

  const fileServices = createDocumentFileServices({
    db,
    storage,
    encryption,
    resolveDocumentVersion,
    resolveLatestDocumentVersion,
  });
  const {
    downloadDocument,
    downloadDocumentVersion,
    getChunkAsset,
    listDocumentChunks,
    listDocumentVersionChunks,
    renderDocumentPagePreview,
    renderDocumentVersionPagePreview,
  } = fileServices;

  async function listDocuments({
    vaultId,
    includeDeleted = false,
    tagId,
    sortBy = 'created_desc',
    folderId,
  }: {
    vaultId: string;
    includeDeleted?: boolean;
    tagId?: string;
    sortBy?: SearchSortBy;
    folderId?: string | null;
  }) {
    const conditions = [eq(documentsTable.vaultId, vaultId)];

    if (!includeDeleted) {
      conditions.push(eq(documentsTable.isDeleted, false));
    }

    if (tagId !== undefined) {
      conditions.push(
        exists(
          db
            .select({ documentId: documentTagsTable.documentId })
            .from(documentTagsTable)
            .where(
              and(
                eq(documentTagsTable.documentId, documentsTable.id),
                eq(documentTagsTable.tagId, tagId),
              ),
            ),
        ),
      );
    }

    if (folderId !== undefined) {
      conditions.push(getFolderCondition(folderId));
    }

    const orderBy =
      sortBy === 'created_asc'
        ? [asc(documentsTable.createdAt), asc(documentsTable.name)]
        : sortBy === 'name_asc'
          ? [sql`LOWER(${documentsTable.name}) ASC`, desc(documentsTable.createdAt)]
          : sortBy === 'name_desc'
            ? [sql`LOWER(${documentsTable.name}) DESC`, desc(documentsTable.createdAt)]
            : [desc(documentsTable.createdAt), asc(documentsTable.name)];

    return db
      .select({
        id: documentsTable.id,
        name: documentsTable.name,
        originalName: documentsTable.originalName,
        folderId: documentsTable.folderId,
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        processingStatus: documentsTable.processingStatus,
        language: documentsTable.language,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentsTable)
      .where(and(...conditions))
      .orderBy(...orderBy);
  }

  async function getDocument({ documentId, vaultId }: { documentId: string; vaultId: string }) {
    const [doc] = await db
      .select({
        id: documentsTable.id,
        name: documentsTable.name,
        originalName: documentsTable.originalName,
        folderId: documentsTable.folderId,
        originalSize: documentsTable.originalSize,
        originalSha256Hash: documentsTable.originalSha256Hash,
        mimeType: documentsTable.mimeType,
        content: documentsTable.content,
        processingStatus: documentsTable.processingStatus,
        language: documentsTable.language,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
        createdBy: usersTable.name,
        currentVersionId: documentsTable.currentVersionId,
      })
      .from(documentsTable)
      .leftJoin(usersTable, eq(documentsTable.createdBy, usersTable.id))
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
      .limit(1);

    if (doc === undefined) {
      return null;
    }

    const semanticIndex = await getDocumentSemanticIndexStatus({
      documentId,
      documentVersionId: doc.currentVersionId,
      vaultId,
    });
    const { currentVersionId: _currentVersionId, ...document } = doc;

    return {
      ...document,
      displayContent: doc.content,
      semanticIndex,
    };
  }

  async function getDocumentSemanticIndexStatus({
    documentId,
    documentVersionId,
    vaultId,
  }: {
    documentId: string;
    documentVersionId: string | null;
    vaultId: string;
  }) {
    if (documentVersionId === null) {
      return null;
    }

    const [row] = await db
      .select({
        documentStatus: documentEmbeddingIndexStatusTable.status,
        expectedChunkCount: documentEmbeddingIndexStatusTable.expectedChunkCount,
        embeddedChunkCount: documentEmbeddingIndexStatusTable.embeddedChunkCount,
        indexedAt: documentEmbeddingIndexStatusTable.indexedAt,
        updatedAt: documentEmbeddingIndexStatusTable.updatedAt,
      })
      .from(embeddingIndexesTable)
      .leftJoin(
        documentEmbeddingIndexStatusTable,
        and(
          eq(documentEmbeddingIndexStatusTable.embeddingIndexId, embeddingIndexesTable.id),
          eq(documentEmbeddingIndexStatusTable.documentId, documentId),
          eq(documentEmbeddingIndexStatusTable.documentVersionId, documentVersionId),
          eq(documentEmbeddingIndexStatusTable.vaultId, vaultId),
        ),
      )
      .where(inArray(embeddingIndexesTable.status, ['active', 'ready', 'building', 'failed']))
      .orderBy(
        sql`CASE
          WHEN ${embeddingIndexesTable.isActive} = true THEN 0
          WHEN ${embeddingIndexesTable.status} IN ('building', 'ready') THEN 1
          ELSE 2
        END`,
        desc(embeddingIndexesTable.updatedAt),
      )
      .limit(1);

    if (row === undefined) {
      return null;
    }

    return {
      documentStatus: row.documentStatus,
      expectedChunkCount: row.expectedChunkCount ?? 0,
      embeddedChunkCount: row.embeddedChunkCount ?? 0,
      indexedAt: row.indexedAt,
      updatedAt: row.updatedAt,
    };
  }

  async function listDeletedDocuments({ vaultIds }: { vaultIds: string[] }) {
    if (vaultIds.length === 0) {
      return [];
    }

    return db
      .select({
        id: documentsTable.id,
        vaultId: documentsTable.vaultId,
        vaultName: vaultsTable.name,
        name: documentsTable.name,
        originalName: documentsTable.originalName,
        folderId: documentsTable.folderId,
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        language: documentsTable.language,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentsTable)
      .innerJoin(vaultsTable, eq(documentsTable.vaultId, vaultsTable.id))
      .where(and(inArray(documentsTable.vaultId, vaultIds), eq(documentsTable.isDeleted, true)))
      .orderBy(desc(documentsTable.deletedAt), desc(documentsTable.updatedAt));
  }

  async function renameDocument({
    documentId,
    vaultId,
    name,
  }: {
    documentId: string;
    vaultId: string;
    name: string;
  }): Promise<RenameDocumentResult> {
    const normalizedName = name.trim();

    const [existingDoc] = await db
      .select({
        id: documentsTable.id,
        folderId: documentsTable.folderId,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (existingDoc === undefined) {
      return { success: false, reason: 'not_found' };
    }

    const collision = await findActiveDocumentNameCollision({
      vaultId,
      folderId: existingDoc.folderId,
      name: normalizedName,
      excludeDocumentId: documentId,
    });

    if (collision !== null) {
      return { success: false, reason: 'duplicate_name', existingId: collision.id };
    }

    const [doc] = await db
      .update(documentsTable)
      .set({ name: normalizedName, updatedAt: new Date() })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .returning({
        id: documentsTable.id,
        name: documentsTable.name,
        updatedAt: documentsTable.updatedAt,
      });

    if (doc === undefined) {
      return { success: false, reason: 'not_found' };
    }

    return { success: true, document: doc };
  }

  async function moveDocument({
    documentId,
    vaultId,
    folderId,
  }: {
    documentId: string;
    vaultId: string;
    folderId: string | null;
  }): Promise<MoveDocumentResult> {
    if ((await getActiveFolderInVault({ vaultId, folderId })) === null) {
      return { success: false, reason: 'folder_not_found' };
    }

    const [existingDoc] = await db
      .select({
        id: documentsTable.id,
        originalName: documentsTable.originalName,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (existingDoc === undefined) {
      return { success: false, reason: 'not_found' };
    }

    const collision = await findActiveDocumentFileNameCollision({
      vaultId,
      folderId,
      fileName: existingDoc.originalName,
      excludeDocumentId: documentId,
    });

    if (collision !== null) {
      return { success: false, reason: 'duplicate_name', existingId: collision.id };
    }

    const [doc] = await db
      .update(documentsTable)
      .set({
        folderId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .returning({
        id: documentsTable.id,
        folderId: documentsTable.folderId,
        updatedAt: documentsTable.updatedAt,
      });

    if (doc === undefined) {
      return { success: false, reason: 'not_found' };
    }

    return { success: true, document: doc };
  }

  async function updateDocumentLanguage({
    documentId,
    vaultId,
    language,
  }: {
    documentId: string;
    vaultId: string;
    language: DocumentLanguageMetadata;
  }) {
    const [doc] = await db
      .update(documentsTable)
      .set({ language, updatedAt: new Date() })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .returning({
        id: documentsTable.id,
        language: documentsTable.language,
        updatedAt: documentsTable.updatedAt,
      });

    return doc ?? null;
  }

  async function softDeleteDocument({
    documentId,
    vaultId,
    deletedBy,
  }: {
    documentId: string;
    vaultId: string;
    deletedBy: string;
  }) {
    const [doc] = await db
      .update(documentsTable)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .returning({ id: documentsTable.id });

    if (doc !== undefined) {
      await createEmbeddingIndexServices({ db }).removeDocumentFromEmbeddingIndexes({ documentId });
    }

    return doc ?? null;
  }

  const restoreServices = createDocumentRestoreServices({ db });
  const { restoreDocument } = restoreServices;

  async function hardDeleteDocument({
    documentId,
    vaultId,
    deletedBeforeOrAt,
  }: {
    documentId: string;
    vaultId: string;
    deletedBeforeOrAt?: Date;
  }): Promise<HardDeleteDocumentResult> {
    // Get storage key before deleting record
    const [doc] = await db
      .select({
        id: documentsTable.id,
        originalStorageKey: documentsTable.originalStorageKey,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, true),
        ),
      )
      .limit(1);

    if (doc === undefined) {
      return { success: false, reason: 'not_found' };
    }

    if (
      deletedBeforeOrAt !== undefined &&
      (doc.deletedAt === null || doc.deletedAt > deletedBeforeOrAt)
    ) {
      return { success: false, reason: 'retention_window_active' };
    }

    const purgePlan = await planDocumentPurge({ documentId: doc.id, vaultId });
    if (purgePlan === null) {
      return { success: false, reason: 'not_found' };
    }

    // Delete DB record
    await db.delete(documentsTable).where(eq(documentsTable.id, doc.id));

    for (const storageKey of purgePlan.chunkAssetStorageKeys) {
      await storage.remove(storageKey);
    }

    for (const versionId of purgePlan.versionIds) {
      await storage.removePrefix?.(documentVersionChunkAssetStoragePrefix(versionId));
    }

    for (const previewPrefix of purgePlan.previewStoragePrefixes) {
      await storage.removePrefix?.(previewPrefix);
    }

    for (const sourceStorageKey of purgePlan.sourceStorageKeys) {
      await storage.remove(sourceStorageKey);
    }

    return { success: true, id: doc.id };
  }

  const deletionImpactServices = createDocumentDeletionImpactServices({
    db,
    resolveDocumentVersion,
  });
  const {
    getBulkDocumentDeletionImpact,
    getDocumentDeletionImpact,
    getDocumentVersionDeletionImpact,
  } = deletionImpactServices;

  const versionLifecycleServices = createDocumentVersionLifecycleServices({
    db,
    storage,
    resolveDocumentVersion,
    documentVersionSelectFields,
    toDocumentVersionSummary,
  });
  const { deleteDocumentVersion, restoreDocumentVersion } = versionLifecycleServices;

  async function updateDocumentProcessingStatus({
    documentId,
    vaultId,
    processingStatus,
  }: {
    documentId: string;
    vaultId: string;
    processingStatus: DocumentProcessingStatus;
  }) {
    const [doc] = await db
      .update(documentsTable)
      .set({
        processingStatus,
        updatedAt: new Date(),
      })
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
      .returning({
        id: documentsTable.id,
        processingStatus: documentsTable.processingStatus,
      });

    return doc ?? null;
  }

  async function updateDocumentVersionProcessingStatus({
    documentId,
    documentVersionId,
    vaultId,
    processingStatus,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    processingStatus: DocumentProcessingStatus;
  }) {
    const now = new Date();
    const [version] = await db
      .update(documentVersionsTable)
      .set({
        processingStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(documentVersionsTable.id, documentVersionId),
          eq(documentVersionsTable.documentId, documentId),
          eq(documentVersionsTable.vaultId, vaultId),
          isNull(documentVersionsTable.deletedAt),
        ),
      )
      .returning({
        id: documentVersionsTable.id,
        processingStatus: documentVersionsTable.processingStatus,
      });

    if (version === undefined) {
      return null;
    }

    await db
      .update(documentsTable)
      .set({
        processingStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.currentVersionId, documentVersionId),
        ),
      );

    return version;
  }

  return {
    createDocumentVersion,
    createLogicalDocumentWithInitialVersion,
    deleteDocumentVersion,
    downloadDocument,
    downloadDocumentVersion,
    finalizeUploadedDocument,
    getBulkDocumentDeletionImpact,
    getDocumentDeletionImpact,
    getDocumentVersionDeletionImpact,
    getDocument,
    getChunkAsset,
    hardDeleteDocument,
    listDeletedDocuments,
    listDocumentChunks,
    listDocumentVersionChunks,
    listDocuments,
    moveDocument,
    planDocumentPurge,
    renameDocument,
    renderDocumentPagePreview,
    renderDocumentVersionPagePreview,
    resolveDocumentVersion,
    resolveLatestDocumentVersion,
    restoreDocument,
    restoreDocumentVersion,
    softDeleteDocument,
    listDocumentVersions,
    updateDocumentProcessingStatus,
    updateDocumentVersionProcessingStatus,
    updateDocumentLanguage,
    uploadDocument,
  };
}
