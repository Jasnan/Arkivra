import { createHash } from 'node:crypto';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { and, asc, desc, eq, exists, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  documentChunkAssetsTable,
  documentChunksTable,
  documentTagsTable,
  documentsTable,
  usersTable,
  vaultFoldersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { generateId } from '../database/schema/helpers.js';
import type { SearchSortBy } from '../search/search.types.js';
import { renderPdfPageToImage } from '../parsing/pdf-page-renderer.js';

export type DocumentsServices = ReturnType<typeof createDocumentsServices>;
export type DocumentProcessingStatus =
  | 'pending'
  | 'queued'
  | 'partitioning'
  | 'chunking'
  | 'summarising'
  | 'vectorising'
  | 'completed'
  | 'failed';

export type HardDeleteDocumentResult =
  | { success: true; id: string }
  | { success: false; reason: 'not_found' | 'retention_window_active' };

export type RestoreDocumentResult =
  | {
    success: true;
    id: string;
    hierarchyRecreated: boolean;
    originalName: string;
    folderId: string | null;
  }
  | { success: false; reason: 'not_found' }
  | { success: false; reason: 'duplicate'; existingId: string };

export type RenameDocumentResult =
  | { success: true; document: { id: string; name: string; updatedAt: Date } }
  | { success: false; reason: 'not_found' | 'duplicate_name'; existingId?: string };

export type MoveDocumentResult =
  | { success: true; document: { id: string; folderId: string | null; updatedAt: Date } }
  | { success: false; reason: 'not_found' | 'folder_not_found' | 'duplicate_name'; existingId?: string };

export type DuplicateDocumentScope = 'active' | 'trash';
export type DocumentLanguageMetadata = typeof documentsTable.$inferSelect.language;

type ActiveDocumentRecord = {
  id: string;
  vaultId: string;
  originalName: string;
  originalSize: number;
  originalStorageKey: string;
  originalSha256Hash: string;
  mimeType: string;
  fileEncryptionKeyWrapped: string | null;
  fileEncryptionKekVersion: string | null;
};

type ChunkAssetRecord = {
  id: string;
  chunkId: string;
  documentId: string;
  vaultId: string;
  assetType: 'image' | 'table';
  mimeType: string | null;
  storageKey: string | null;
  inlinePayload: string | null;
  sourceElementId: string | null;
  sha256Hash: string | null;
  byteSize: number | null;
  fileEncryptionKeyWrapped: string | null;
  fileEncryptionKekVersion: string | null;
};

type FolderRestoreNode = {
  id: string;
  parentId: string | null;
  name: string;
  isDeleted: boolean;
};

export function normalizeDocumentFileName(fileName: string): string {
  const normalized = fileName.normalize('NFC').trim();
  return normalized.length > 0 ? normalized : 'untitled';
}

export function createDocumentsServices({
  db,
  storage,
  encryption,
}: {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
}) {
  function computeSha256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  function buildStorageKey(vaultId: string, docId: string): string {
    return `${vaultId}/${docId}`;
  }

  function getFolderCondition(folderId: string | null) {
    return folderId === null ? isNull(documentsTable.folderId) : eq(documentsTable.folderId, folderId);
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

  function buildFolderRestoreChain({
    folders,
    folderId,
  }: {
    folders: FolderRestoreNode[];
    folderId: string;
  }) {
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    const chain: FolderRestoreNode[] = [];
    const seen = new Set<string>();
    let current = byId.get(folderId) ?? null;

    while (current !== null) {
      if (seen.has(current.id)) {
        throw new Error(`Cycle detected while resolving restore folder hierarchy for ${folderId}`);
      }

      seen.add(current.id);
      chain.unshift(current);
      current = current.parentId === null ? null : byId.get(current.parentId) ?? null;
    }

    return chain;
  }

  function findActiveSiblingFolderByName({
    folders,
    parentId,
    name,
  }: {
    folders: FolderRestoreNode[];
    parentId: string | null;
    name: string;
  }) {
    const normalizedName = name.trim().toLocaleLowerCase();

    return folders.find(folder =>
      !folder.isDeleted
      && (folder.parentId ?? null) === parentId
      && folder.name.trim().toLocaleLowerCase() === normalizedName,
    ) ?? null;
  }

  function buildRestoredFileName(fileName: string, attempt: number) {
    const dotIndex = fileName.lastIndexOf('.');
    const hasExtension = dotIndex > 0 && dotIndex < fileName.length - 1;
    const baseName = hasExtension ? fileName.slice(0, dotIndex) : fileName;
    const extension = hasExtension ? fileName.slice(dotIndex) : '';
    const suffix = attempt === 1 ? 'restored' : `restored ${attempt}`;

    return normalizeDocumentFileName(`${baseName} (${suffix})${extension}`);
  }

  async function getActiveDocumentRecord({
    documentId,
    vaultId,
    includeDeleted = false,
  }: {
    documentId: string;
    vaultId: string;
    includeDeleted?: boolean;
  }): Promise<ActiveDocumentRecord | null> {
    const conditions = [
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
    ];

    if (!includeDeleted) {
      conditions.push(eq(documentsTable.isDeleted, false));
    }

    const [doc] = await db
      .select({
        id: documentsTable.id,
        vaultId: documentsTable.vaultId,
        originalName: documentsTable.originalName,
        originalSize: documentsTable.originalSize,
        originalStorageKey: documentsTable.originalStorageKey,
        originalSha256Hash: documentsTable.originalSha256Hash,
        mimeType: documentsTable.mimeType,
        fileEncryptionKeyWrapped: documentsTable.fileEncryptionKeyWrapped,
        fileEncryptionKekVersion: documentsTable.fileEncryptionKekVersion,
      })
      .from(documentsTable)
      .where(and(...conditions))
      .limit(1);

    return doc ?? null;
  }

  async function readDocumentPayload(doc: ActiveDocumentRecord) {
    const rawData = await storage.read(doc.originalStorageKey);

    if (doc.fileEncryptionKeyWrapped !== null && doc.fileEncryptionKekVersion !== null) {
      return encryption.decrypt({
        encryptedData: rawData,
        wrappedDek: doc.fileEncryptionKeyWrapped,
        kekVersion: doc.fileEncryptionKekVersion,
      });
    }

    return rawData;
  }

  function documentPagePreviewStorageKey({
    documentId,
    pageNumber,
  }: {
    documentId: string;
    pageNumber: number;
  }) {
    return `previews/${documentId}/pages/${pageNumber}.png`;
  }

  function documentPagePreviewStoragePrefix(documentId: string) {
    return `previews/${documentId}`;
  }

  async function finalizeUploadedDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
    folderId = null,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    folderId?: string | null;
  }) {
    const sha256Hash = computeSha256(fileData);
    const fileSize = fileData.length;
    const normalizedFileName = normalizeDocumentFileName(fileName);

    const [existing] = await db
      .select({
        id: documentsTable.id,
        isDeleted: documentsTable.isDeleted,
      })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.originalSha256Hash, sha256Hash),
        ),
      )
      .orderBy(asc(documentsTable.isDeleted), desc(documentsTable.updatedAt))
      .limit(1);

    if (existing !== undefined) {
      return {
        document: null,
        duplicate: true,
        existingId: existing.id,
        duplicateScope: existing.isDeleted ? 'trash' : 'active',
      };
    }

    const existingName = await findActiveDocumentFileNameCollision({
      vaultId,
      folderId,
      fileName: normalizedFileName,
    });

    if (existingName !== null) {
      return {
        document: null,
        duplicate: true,
        existingId: existingName.id,
        duplicateScope: 'active' as const,
      };
    }

    const docId = generateId({ prefix: 'doc' });
    const storageKey = buildStorageKey(vaultId, docId);

    let wrappedDek: string | null = null;
    let kekVersion: string | null = null;
    let algorithm: string | null = null;
    let dataToStore: Buffer;

    if (encryption.isEnabled()) {
      const result = encryption.encrypt(fileData);
      dataToStore = result.encryptedData;
      wrappedDek = result.wrappedDek;
      kekVersion = result.kekVersion;
      algorithm = result.algorithm;
    } else {
      dataToStore = fileData;
    }

    await storage.write(storageKey, dataToStore);

    const [document] = await db
      .insert(documentsTable)
      .values({
        id: docId,
        vaultId,
        folderId,
        createdBy: userId,
        originalName: normalizedFileName,
        originalSize: fileSize,
        originalStorageKey: storageKey,
        originalSha256Hash: sha256Hash,
        name: normalizedFileName,
        mimeType,
        processingStatus: 'pending',
        fileEncryptionKeyWrapped: wrappedDek,
        fileEncryptionKekVersion: kekVersion,
        fileEncryptionAlgorithm: algorithm,
      })
      .returning();

    if (document === undefined) {
      throw new Error('Failed to insert document record');
    }

    return { document, duplicate: false, existingId: null, duplicateScope: null };
  }

  async function uploadDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
    folderId = null,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    folderId?: string | null;
  }) {
    return finalizeUploadedDocument({
      vaultId,
      userId,
      fileName,
      mimeType,
      fileData,
      folderId,
    });
  }

  async function downloadDocument({
    documentId,
    vaultId,
    includeDeleted = false,
  }: {
    documentId: string;
    vaultId: string;
    includeDeleted?: boolean;
  }) {
    const doc = await getActiveDocumentRecord({ documentId, vaultId, includeDeleted });
    if (doc === null) {
      return null;
    }

    const fileData = await readDocumentPayload(doc);

    return {
      fileData,
      fileName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.originalSize,
    };
  }

  async function renderDocumentPagePreview({
    documentId,
    vaultId,
    pageNumber,
    includeDeleted = false,
  }: {
    documentId: string;
    vaultId: string;
    pageNumber: number;
    includeDeleted?: boolean;
  }) {
    const doc = await getActiveDocumentRecord({ documentId, vaultId, includeDeleted });
    if (doc === null) {
      return null;
    }

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return { error: 'invalid_page_number' as const };
    }

    const storageKey = documentPagePreviewStorageKey({ documentId, pageNumber });
    const etag = `"doc-page-${doc.originalSha256Hash}-${pageNumber}"`;

    if (await storage.exists(storageKey)) {
      return {
        fileData: await storage.read(storageKey),
        mimeType: 'image/png',
        etag,
        pageNumber,
      };
    }

    const sourceFile = await readDocumentPayload(doc);
    const image = await renderPdfPageToImage({
      fileData: sourceFile,
      fileName: doc.originalName,
      mimeType: doc.mimeType,
      pageNumber,
    });

    if (image === null) {
      return { error: 'page_not_available' as const };
    }

    await storage.write(storageKey, image.data);

    return {
      fileData: image.data,
      mimeType: image.mimeType,
      etag,
      pageNumber,
    };
  }

  async function getChunkAsset({
    vaultId,
    chunkId,
    assetId,
  }: {
    vaultId: string;
    chunkId: string;
    assetId: string;
  }) {
    const [asset] = await db
      .select({
        id: documentChunkAssetsTable.id,
        chunkId: documentChunkAssetsTable.chunkId,
        documentId: documentChunkAssetsTable.documentId,
        vaultId: documentChunkAssetsTable.vaultId,
        assetType: documentChunkAssetsTable.assetType,
        mimeType: documentChunkAssetsTable.mimeType,
        storageKey: documentChunkAssetsTable.storageKey,
        inlinePayload: documentChunkAssetsTable.inlinePayload,
        sourceElementId: documentChunkAssetsTable.sourceElementId,
        sha256Hash: documentChunkAssetsTable.sha256Hash,
        byteSize: documentChunkAssetsTable.byteSize,
        fileEncryptionKeyWrapped: documentChunkAssetsTable.fileEncryptionKeyWrapped,
        fileEncryptionKekVersion: documentChunkAssetsTable.fileEncryptionKekVersion,
      })
      .from(documentChunkAssetsTable)
      .innerJoin(documentChunksTable, eq(documentChunkAssetsTable.chunkId, documentChunksTable.id))
      .innerJoin(documentsTable, eq(documentChunkAssetsTable.documentId, documentsTable.id))
      .where(
        and(
          eq(documentChunkAssetsTable.id, assetId),
          eq(documentChunkAssetsTable.chunkId, chunkId),
          eq(documentChunkAssetsTable.vaultId, vaultId),
          eq(documentChunksTable.vaultId, vaultId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1) as ChunkAssetRecord[];

    if (asset === undefined) {
      return null;
    }

    const etag = asset.sha256Hash !== null
      ? `"chunk-asset-${asset.sha256Hash}"`
      : `"chunk-asset-${asset.id}"`;

    if (asset.inlinePayload !== null) {
      return {
        assetType: asset.assetType,
        mimeType: asset.mimeType ?? 'text/html; charset=utf-8',
        inlinePayload: asset.inlinePayload,
        sourceElementId: asset.sourceElementId,
        byteSize: asset.byteSize ?? Buffer.byteLength(asset.inlinePayload, 'utf8'),
        etag,
      };
    }

    if (asset.storageKey === null) {
      return null;
    }

    const rawData = await storage.read(asset.storageKey);
    const fileData =
      asset.fileEncryptionKeyWrapped !== null && asset.fileEncryptionKekVersion !== null
        ? encryption.decrypt({
            encryptedData: rawData,
            wrappedDek: asset.fileEncryptionKeyWrapped,
            kekVersion: asset.fileEncryptionKekVersion,
          })
        : rawData;

    return {
      assetType: asset.assetType,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      fileData,
      sourceElementId: asset.sourceElementId,
      byteSize: asset.byteSize ?? fileData.length,
      etag,
    };
  }

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
        documentDate: documentsTable.documentDate,
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
        documentDate: documentsTable.documentDate,
        language: documentsTable.language,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
        createdBy: usersTable.name,
      })
      .from(documentsTable)
      .leftJoin(usersTable, eq(documentsTable.createdBy, usersTable.id))
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)))
      .limit(1);

    if (doc === undefined) {
      return null;
    }

    return {
      ...doc,
      displayContent: doc.content,
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
        documentDate: documentsTable.documentDate,
        language: documentsTable.language,
        createdAt: documentsTable.createdAt,
        updatedAt: documentsTable.updatedAt,
        isDeleted: documentsTable.isDeleted,
        deletedAt: documentsTable.deletedAt,
      })
      .from(documentsTable)
      .innerJoin(vaultsTable, eq(documentsTable.vaultId, vaultsTable.id))
      .where(
        and(
          inArray(documentsTable.vaultId, vaultIds),
          eq(documentsTable.isDeleted, true),
        ),
      )
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
    if (await getActiveFolderInVault({ vaultId, folderId }) === null) {
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

  async function updateDocumentDate({
    documentId,
    vaultId,
    documentDate,
  }: {
    documentId: string;
    vaultId: string;
    documentDate: Date | null;
  }) {
    const [doc] = await db
      .update(documentsTable)
      .set({ documentDate, updatedAt: new Date() })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .returning({
        id: documentsTable.id,
        documentDate: documentsTable.documentDate,
        updatedAt: documentsTable.updatedAt,
      });

    return doc ?? null;
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

    return doc ?? null;
  }

  async function restoreDocument({
    documentId,
    vaultId,
  }: {
    documentId: string;
    vaultId: string;
  }): Promise<RestoreDocumentResult> {
    return db.transaction(async (tx) => {
      const [deletedDoc] = await tx
        .select({
          id: documentsTable.id,
          originalSha256Hash: documentsTable.originalSha256Hash,
          folderId: documentsTable.folderId,
          originalName: documentsTable.originalName,
          name: documentsTable.name,
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

      if (deletedDoc === undefined) {
        return { success: false, reason: 'not_found' };
      }
      const deletedDocument = deletedDoc;

      const [existing] = await tx
        .select({ id: documentsTable.id })
        .from(documentsTable)
        .where(
          and(
            eq(documentsTable.vaultId, vaultId),
            eq(documentsTable.originalSha256Hash, deletedDocument.originalSha256Hash),
            eq(documentsTable.isDeleted, false),
          ),
        )
        .limit(1);

      if (existing !== undefined) {
        return { success: false, reason: 'duplicate', existingId: existing.id };
      }

      let targetFolderId = deletedDocument.folderId;
      let hierarchyRecreated = false;

      if (deletedDocument.folderId !== null) {
        const folders = await tx
          .select({
            id: vaultFoldersTable.id,
            parentId: vaultFoldersTable.parentId,
            name: vaultFoldersTable.name,
            isDeleted: vaultFoldersTable.isDeleted,
          })
          .from(vaultFoldersTable)
          .where(eq(vaultFoldersTable.vaultId, vaultId));

        const chain = buildFolderRestoreChain({ folders, folderId: deletedDocument.folderId });
        let currentParentId: string | null = null;
        const now = new Date();

        for (const folder of chain) {
          const activeSibling = findActiveSiblingFolderByName({
            folders,
            parentId: currentParentId,
            name: folder.name,
          });

          if (activeSibling !== null) {
            if (activeSibling.id !== folder.id || folder.isDeleted || folder.parentId !== currentParentId) {
              hierarchyRecreated = true;
            }

            currentParentId = activeSibling.id;
            continue;
          }

          if (folder.isDeleted || folder.parentId !== currentParentId) {
            hierarchyRecreated = true;
          }

          const restoredFolders: FolderRestoreNode[] = await tx
            .update(vaultFoldersTable)
            .set({
              parentId: currentParentId,
              isDeleted: false,
              deletedAt: null,
              deletedBy: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(vaultFoldersTable.id, folder.id),
                eq(vaultFoldersTable.vaultId, vaultId),
              ),
            )
            .returning({
              id: vaultFoldersTable.id,
              parentId: vaultFoldersTable.parentId,
              name: vaultFoldersTable.name,
              isDeleted: vaultFoldersTable.isDeleted,
            });
          const restoredFolder: FolderRestoreNode | undefined = restoredFolders[0];

          if (restoredFolder === undefined) {
            return { success: false, reason: 'not_found' };
          }

          const folderIndex = folders.findIndex(item => item.id === folder.id);
          if (folderIndex >= 0) {
            folders[folderIndex] = restoredFolder;
          }

          currentParentId = restoredFolder.id;
        }

        targetFolderId = currentParentId;
      }

      async function findRestoreNameCollision(fileName: string) {
        const normalizedFileName = normalizeDocumentFileName(fileName).toLocaleLowerCase();
        const [collision] = await tx
          .select({ id: documentsTable.id })
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.vaultId, vaultId),
              eq(documentsTable.isDeleted, false),
              getFolderCondition(targetFolderId),
              sql`LOWER(${documentsTable.originalName}) = ${normalizedFileName}`,
              ne(documentsTable.id, deletedDocument.id),
            ),
          )
          .limit(1);

        return collision ?? null;
      }

      const normalizedOriginalName = normalizeDocumentFileName(deletedDocument.originalName);
      let restoredOriginalName = normalizedOriginalName;

      if (await findRestoreNameCollision(restoredOriginalName) !== null) {
        restoredOriginalName = '';

        for (let attempt = 1; attempt <= 1000; attempt += 1) {
          const candidate = buildRestoredFileName(normalizedOriginalName, attempt);

          if (await findRestoreNameCollision(candidate) === null) {
            restoredOriginalName = candidate;
            break;
          }
        }

        if (restoredOriginalName.length === 0) {
          throw new Error(`Could not resolve a restore filename for document ${deletedDocument.id}`);
        }
      }
      const shouldUpdateDisplayName = deletedDocument.name === deletedDocument.originalName;
      const now = new Date();

      const [doc] = await tx
        .update(documentsTable)
        .set({
          folderId: targetFolderId,
          originalName: restoredOriginalName,
          name: shouldUpdateDisplayName ? restoredOriginalName : deletedDocument.name,
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(documentsTable.id, documentId),
            eq(documentsTable.vaultId, vaultId),
            eq(documentsTable.isDeleted, true),
          ),
        )
        .returning({
          id: documentsTable.id,
          originalName: documentsTable.originalName,
          folderId: documentsTable.folderId,
        });

      if (doc === undefined) {
        return { success: false, reason: 'not_found' };
      }

      return {
        success: true,
        id: doc.id,
        hierarchyRecreated,
        originalName: doc.originalName,
        folderId: doc.folderId,
      };
    });
  }

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
      deletedBeforeOrAt !== undefined
      && (doc.deletedAt === null || doc.deletedAt > deletedBeforeOrAt)
    ) {
      return { success: false, reason: 'retention_window_active' };
    }

    const assetRows = await db
      .select({
        storageKey: documentChunkAssetsTable.storageKey,
      })
      .from(documentChunkAssetsTable)
      .where(
        and(
          eq(documentChunkAssetsTable.documentId, doc.id),
          eq(documentChunkAssetsTable.vaultId, vaultId),
        ),
      );

    const assetStorageKeys = [...new Set(assetRows
      .map(row => row.storageKey)
      .filter((storageKey): storageKey is string => storageKey !== null))];

    for (const storageKey of assetStorageKeys) {
      await storage.remove(storageKey);
    }

    await storage.removePrefix?.(documentPagePreviewStoragePrefix(doc.id));
    await storage.remove(doc.originalStorageKey);

    // Delete DB record
    await db.delete(documentsTable).where(eq(documentsTable.id, doc.id));

    return { success: true, id: doc.id };
  }

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

  return {
    downloadDocument,
    finalizeUploadedDocument,
    getDocument,
    getChunkAsset,
    hardDeleteDocument,
    listDeletedDocuments,
    listDocuments,
    moveDocument,
    renameDocument,
    renderDocumentPagePreview,
    restoreDocument,
    softDeleteDocument,
    updateDocumentProcessingStatus,
    updateDocumentDate,
    updateDocumentLanguage,
    uploadDocument,
  };
}
