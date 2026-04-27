import { createHash } from 'node:crypto';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { and, asc, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import {
  documentChunkAssetsTable,
  documentChunksTable,
  documentTagsTable,
  documentsTable,
  tagsTable,
  usersTable,
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
  | { success: true; id: string }
  | { success: false; reason: 'not_found' }
  | { success: false; reason: 'duplicate'; existingId: string };

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
  sha256Hash: string | null;
  byteSize: number | null;
  fileEncryptionKeyWrapped: string | null;
  fileEncryptionKekVersion: string | null;
};

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

  function deriveDisplayName(fileName: string): string {
    const trimmed = fileName.trim();
    if (trimmed.length === 0) {
      return 'untitled';
    }

    const extensionIndex = trimmed.lastIndexOf('.');
    const baseName = extensionIndex > 0 ? trimmed.slice(0, extensionIndex) : trimmed;
    const normalized = baseName
      .replace(/_+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized.length > 0 ? normalized : baseName || 'untitled';
  }

  async function getActiveDocumentRecord({
    documentId,
    vaultId,
  }: {
    documentId: string;
    vaultId: string;
  }): Promise<ActiveDocumentRecord | null> {
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
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
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

  async function finalizeUploadedDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
  }) {
    const sha256Hash = computeSha256(fileData);
    const fileSize = fileData.length;

    const [existing] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.originalSha256Hash, sha256Hash),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (existing !== undefined) {
      return { document: null, duplicate: true, existingId: existing.id };
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
        createdBy: userId,
        originalName: fileName,
        originalSize: fileSize,
        originalStorageKey: storageKey,
        originalSha256Hash: sha256Hash,
        name: deriveDisplayName(fileName),
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

    return { document, duplicate: false, existingId: null };
  }

  async function uploadDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
  }) {
    return finalizeUploadedDocument({
      vaultId,
      userId,
      fileName,
      mimeType,
      fileData,
    });
  }

  async function downloadDocument({
    documentId,
    vaultId,
  }: {
    documentId: string;
    vaultId: string;
  }) {
    const doc = await getActiveDocumentRecord({ documentId, vaultId });
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
  }: {
    documentId: string;
    vaultId: string;
    pageNumber: number;
  }) {
    const doc = await getActiveDocumentRecord({ documentId, vaultId });
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
      byteSize: asset.byteSize ?? fileData.length,
      etag,
    };
  }

  async function listDocuments({
    vaultId,
    includeDeleted = false,
    tagId,
    sortBy = 'created_desc',
  }: {
    vaultId: string;
    includeDeleted?: boolean;
    tagId?: string;
    sortBy?: SearchSortBy;
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
            .innerJoin(tagsTable, eq(documentTagsTable.tagId, tagsTable.id))
            .where(
              and(
                eq(documentTagsTable.documentId, documentsTable.id),
                eq(documentTagsTable.tagId, tagId),
                eq(tagsTable.vaultId, vaultId),
              ),
            ),
        ),
      );
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
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        processingStatus: documentsTable.processingStatus,
        documentDate: documentsTable.documentDate,
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
        originalSize: documentsTable.originalSize,
        originalSha256Hash: documentsTable.originalSha256Hash,
        mimeType: documentsTable.mimeType,
        content: documentsTable.content,
        processingStatus: documentsTable.processingStatus,
        documentDate: documentsTable.documentDate,
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
        originalSize: documentsTable.originalSize,
        mimeType: documentsTable.mimeType,
        documentDate: documentsTable.documentDate,
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
  }) {
    const [doc] = await db
      .update(documentsTable)
      .set({ name, updatedAt: new Date() })
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

    return doc ?? null;
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
    const [deletedDoc] = await db
      .select({
        id: documentsTable.id,
        originalSha256Hash: documentsTable.originalSha256Hash,
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

    const [existing] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.originalSha256Hash, deletedDoc.originalSha256Hash),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (existing !== undefined) {
      return { success: false, reason: 'duplicate', existingId: existing.id };
    }

    const [doc] = await db
      .update(documentsTable)
      .set({
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, true),
        ),
      )
      .returning({ id: documentsTable.id });

    if (doc === undefined) {
      return { success: false, reason: 'not_found' };
    }

    return { success: true, id: doc.id };
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

    // Remove file from storage
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
    renameDocument,
    renderDocumentPagePreview,
    restoreDocument,
    softDeleteDocument,
    updateDocumentProcessingStatus,
    updateDocumentDate,
    uploadDocument,
  };
}
