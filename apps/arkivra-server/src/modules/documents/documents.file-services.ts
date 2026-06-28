import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { documentChunkAssetsTable, documentChunksTable, documentsTable } from '../database/schema/index.js';
import { renderPdfPageToImage } from '../parsing/pdf-page-renderer.js';
import type { StorageDriver } from '../storage/storage.types.js';
import {
  documentVersionPagePreviewStorageKey,
} from './document-storage-keys.js';
import type {
  ActiveDocumentRecord,
  ChunkAssetRecord,
  DocumentChunkSummary,
  DocumentVersionSummary,
} from './documents.service-types.js';

export function createDocumentFileServices({
  db,
  storage,
  encryption,
  resolveDocumentVersion,
  resolveLatestDocumentVersion,
}: {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  resolveDocumentVersion: (input: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersion?: boolean;
  }) => Promise<DocumentVersionSummary | null>;
  resolveLatestDocumentVersion: (input: {
    documentId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersion?: boolean;
  }) => Promise<DocumentVersionSummary | null>;
}) {
  async function getActiveDocumentRecord({
    documentId,
    vaultId,
    includeDeleted = false,
  }: {
    documentId: string;
    vaultId: string;
    includeDeleted?: boolean;
  }): Promise<ActiveDocumentRecord | null> {
    const conditions = [eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)];

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

  async function readDocumentVersionPayload(version: DocumentVersionSummary) {
    return readDocumentPayload({
      id: version.documentId,
      vaultId: version.vaultId,
      originalName: version.originalName,
      originalSize: version.originalSize,
      originalStorageKey: version.originalStorageKey,
      originalSha256Hash: version.originalSha256Hash,
      mimeType: version.mimeType,
      fileEncryptionKeyWrapped: version.fileEncryptionKeyWrapped,
      fileEncryptionKekVersion: version.fileEncryptionKekVersion,
    });
  }

  async function readDocumentVersionPreviewPdfPayload(version: DocumentVersionSummary) {
    if (version.previewPdfStorageKey === null) {
      return null;
    }

    const rawData = await storage.read(version.previewPdfStorageKey);

    if (
      version.previewPdfEncryptionKeyWrapped !== null &&
      version.previewPdfEncryptionKekVersion !== null
    ) {
      return encryption.decrypt({
        encryptedData: rawData,
        wrappedDek: version.previewPdfEncryptionKeyWrapped,
        kekVersion: version.previewPdfEncryptionKekVersion,
      });
    }

    return rawData;
  }

  async function readRenderablePdfPayload(version: DocumentVersionSummary) {
    const previewPdf = await readDocumentVersionPreviewPdfPayload(version);

    if (previewPdf !== null) {
      return {
        fileData: previewPdf,
        fileName: `${version.originalName}.preview.pdf`,
        mimeType: 'application/pdf',
        sourceSha256Hash: version.previewPdfSha256Hash ?? version.originalSha256Hash,
      };
    }

    return {
      fileData: await readDocumentVersionPayload(version),
      fileName: version.originalName,
      mimeType: version.mimeType,
      sourceSha256Hash: version.originalSha256Hash,
    };
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

  async function previewDocumentFile({
    documentId,
    vaultId,
    includeDeleted = false,
  }: {
    documentId: string;
    vaultId: string;
    includeDeleted?: boolean;
  }) {
    const version = await resolveLatestDocumentVersion({
      documentId,
      vaultId,
      includeDeletedDocument: includeDeleted,
    });
    if (version === null) {
      return null;
    }

    const previewPdf = await readDocumentVersionPreviewPdfPayload(version);

    if (previewPdf !== null) {
      return {
        fileData: previewPdf,
        fileName: version.originalName,
        mimeType: 'application/pdf',
        size: previewPdf.length,
      };
    }

    const fileData = await readDocumentVersionPayload(version);

    return {
      fileData,
      fileName: version.originalName,
      mimeType: version.mimeType,
      size: version.originalSize,
    };
  }

  async function downloadDocumentVersion({
    documentId,
    documentVersionId,
    vaultId,
    includeDeletedDocument = false,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
  }) {
    const version = await resolveDocumentVersion({
      documentId,
      documentVersionId,
      vaultId,
      includeDeletedDocument,
    });
    if (version === null) {
      return null;
    }

    const fileData = await readDocumentVersionPayload(version);

    return {
      fileData,
      fileName: version.originalName,
      mimeType: version.mimeType,
      size: version.originalSize,
      documentVersion: version,
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
    const version = await resolveLatestDocumentVersion({
      documentId,
      vaultId,
      includeDeletedDocument: includeDeleted,
    });
    if (version === null) {
      return null;
    }

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return { error: 'invalid_page_number' as const };
    }

    const storageKey = documentVersionPagePreviewStorageKey({
      documentVersionId: version.id,
      pageNumber,
    });
    const renderable = await readRenderablePdfPayload(version);
    const etag = `"doc-page-${renderable.sourceSha256Hash}-${version.id}-${pageNumber}"`;

    if (await storage.exists(storageKey)) {
      return {
        fileData: await storage.read(storageKey),
        mimeType: 'image/png',
        etag,
        pageNumber,
      };
    }

    const image = await renderPdfPageToImage({
      fileData: renderable.fileData,
      fileName: renderable.fileName,
      mimeType: renderable.mimeType,
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

  async function renderDocumentVersionPagePreview({
    documentId,
    documentVersionId,
    vaultId,
    pageNumber,
    includeDeletedDocument = false,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    pageNumber: number;
    includeDeletedDocument?: boolean;
  }) {
    const version = await resolveDocumentVersion({
      documentId,
      documentVersionId,
      vaultId,
      includeDeletedDocument,
    });
    if (version === null) {
      return null;
    }

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return { error: 'invalid_page_number' as const };
    }

    const storageKey = documentVersionPagePreviewStorageKey({
      documentVersionId: version.id,
      pageNumber,
    });
    const renderable = await readRenderablePdfPayload(version);
    const etag = `"doc-page-${renderable.sourceSha256Hash}-${version.id}-${pageNumber}"`;

    if (await storage.exists(storageKey)) {
      return {
        fileData: await storage.read(storageKey),
        mimeType: 'image/png',
        etag,
        pageNumber,
      };
    }

    const image = await renderPdfPageToImage({
      fileData: renderable.fileData,
      fileName: renderable.fileName,
      mimeType: renderable.mimeType,
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
    documentVersionId,
  }: {
    vaultId: string;
    chunkId: string;
    assetId: string;
    documentVersionId?: string;
  }) {
    const [asset] = (await db
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
          eq(documentChunkAssetsTable.documentVersionId, documentChunksTable.documentVersionId),
          eq(documentChunksTable.vaultId, vaultId),
          documentVersionId === undefined
            ? eq(documentsTable.currentVersionId, documentChunksTable.documentVersionId)
            : eq(documentChunksTable.documentVersionId, documentVersionId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1)) as ChunkAssetRecord[];

    if (asset === undefined) {
      return null;
    }

    const etag =
      asset.sha256Hash !== null ? `"chunk-asset-${asset.sha256Hash}"` : `"chunk-asset-${asset.id}"`;

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

  async function listDocumentChunks({
    documentId,
    vaultId,
  }: {
    documentId: string;
    vaultId: string;
  }): Promise<DocumentChunkSummary[] | null> {
    const [doc] = await db
      .select({ id: documentsTable.id, currentVersionId: documentsTable.currentVersionId })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.isDeleted, false),
        ),
      )
      .limit(1);

    if (doc === undefined) {
      return null;
    }

    if (doc.currentVersionId === null) {
      return [];
    }

    return await db
      .select({
        id: documentChunksTable.id,
        chunkIndex: documentChunksTable.chunkIndex,
        content: documentChunksTable.content,
        originalText: documentChunksTable.originalText,
        section: documentChunksTable.section,
        sectionPath: documentChunksTable.sectionPath,
        pageNumber: documentChunksTable.pageNumber,
        pageStart: documentChunksTable.pageStart,
        pageEnd: documentChunksTable.pageEnd,
        chunkType: documentChunksTable.chunkType,
        tokenCount: documentChunksTable.tokenCount,
        parserEngine: documentChunksTable.parserEngine,
        citationPrecision: documentChunksTable.citationPrecision,
        sourceElementIds: documentChunksTable.sourceElementIds,
        metadata: documentChunksTable.metadata,
        createdAt: documentChunksTable.createdAt,
      })
      .from(documentChunksTable)
      .where(
        and(
          eq(documentChunksTable.documentId, documentId),
          eq(documentChunksTable.documentVersionId, doc.currentVersionId),
          eq(documentChunksTable.vaultId, vaultId),
        ),
      )
      .orderBy(asc(documentChunksTable.chunkIndex));
  }

  async function listDocumentVersionChunks({
    documentId,
    documentVersionId,
    vaultId,
    includeDeletedDocument = false,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
  }): Promise<DocumentChunkSummary[] | null> {
    const version = await resolveDocumentVersion({
      documentId,
      documentVersionId,
      vaultId,
      includeDeletedDocument,
    });

    if (version === null) {
      return null;
    }

    return await db
      .select({
        id: documentChunksTable.id,
        chunkIndex: documentChunksTable.chunkIndex,
        content: documentChunksTable.content,
        originalText: documentChunksTable.originalText,
        section: documentChunksTable.section,
        sectionPath: documentChunksTable.sectionPath,
        pageNumber: documentChunksTable.pageNumber,
        pageStart: documentChunksTable.pageStart,
        pageEnd: documentChunksTable.pageEnd,
        chunkType: documentChunksTable.chunkType,
        tokenCount: documentChunksTable.tokenCount,
        parserEngine: documentChunksTable.parserEngine,
        citationPrecision: documentChunksTable.citationPrecision,
        sourceElementIds: documentChunksTable.sourceElementIds,
        metadata: documentChunksTable.metadata,
        createdAt: documentChunksTable.createdAt,
      })
      .from(documentChunksTable)
      .where(
        and(
          eq(documentChunksTable.documentId, documentId),
          eq(documentChunksTable.documentVersionId, documentVersionId),
          eq(documentChunksTable.vaultId, vaultId),
        ),
      )
      .orderBy(asc(documentChunksTable.chunkIndex));
  }



  return {
    downloadDocument,
    downloadDocumentVersion,
    getActiveDocumentRecord,
    getChunkAsset,
    listDocumentChunks,
    listDocumentVersionChunks,
    previewDocumentFile,
    readDocumentPayload,
    readDocumentVersionPayload,
    readDocumentVersionPreviewPdfPayload,
    renderDocumentPagePreview,
    renderDocumentVersionPagePreview,
  };
}
