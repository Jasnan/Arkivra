import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { ParsedChunk, ParsedDocument } from './parsed-document.schema.js';
import {
  documentChunkAssetsTable,
  documentChunksTable,
  documentVersionsTable,
  documentsTable,
} from '../database/schema/index.js';
import { documentVersionChunkAssetStorageKey } from '../documents/document-storage-keys.js';

/**
 * Maximum byte size for table HTML stored inline on the asset row.
 * Larger payloads spill into StorageDriver under `tables/` to keep the
 * `document_chunk_assets` row size bounded.
 */
const INLINE_TABLE_HTML_MAX_BYTES = 64 * 1024;

function sha256Hex(data: Buffer | string): string {
  const hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

function newAssetId(): string {
  return `cas_${randomBytes(12).toString('hex')}`;
}

function imageStorageKey({
  documentVersionId,
  chunkKey,
  imageIndex,
  mimeType,
}: {
  documentVersionId: string;
  chunkKey: string;
  imageIndex: number;
  mimeType: string;
}): string {
  const safeChunkKey = chunkKey.replace(/[^\w:-]/g, '_');
  const ext = mimeType.split('/')[1]?.split('+')[0] ?? 'bin';
  return documentVersionChunkAssetStorageKey({
    documentVersionId,
    assetPath: `${safeChunkKey}/image-${imageIndex}.${ext}`,
  });
}

function tableStorageKey({
  documentVersionId,
  chunkKey,
  tableIndex,
}: {
  documentVersionId: string;
  chunkKey: string;
  tableIndex: number;
}): string {
  const safeChunkKey = chunkKey.replace(/[^\w:-]/g, '_');
  return documentVersionChunkAssetStorageKey({
    documentVersionId,
    assetPath: `${safeChunkKey}/table-${tableIndex}.html`,
  });
}

type AssetRow = typeof documentChunkAssetsTable.$inferInsert;

type AssetProvenance = {
  elementId?: string;
  pageNumber?: number | null;
  bbox?: {
    pageNumber: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    layoutWidth: number;
    layoutHeight: number;
    system: string;
  } | null;
};

function readAssetProvenance(metadata: ParsedChunk['metadata'], key: 'imageProvenance' | 'tableProvenance') {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is AssetProvenance => typeof entry === 'object' && entry !== null);
}

async function buildImageAssetRow({
  chunk,
  chunkId,
  documentId,
  documentVersionId,
  vaultId,
  imageIndex,
  storage,
  encryption,
}: {
  chunk: ParsedChunk;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  vaultId: string;
  imageIndex: number;
  storage: StorageDriver;
  encryption: EncryptionServices;
}): Promise<AssetRow> {
  const image = chunk.images[imageIndex]!;
  const storageKey = imageStorageKey({
    documentVersionId,
    chunkKey: chunk.id,
    imageIndex,
    mimeType: image.mimeType,
  });

  const sha = sha256Hex(image.data);
  let payloadToStore: Buffer = image.data;
  let wrappedDek: string | null = null;
  let kekVersion: string | null = null;

  if (encryption.isEnabled()) {
    const encrypted = encryption.encrypt(image.data);
    payloadToStore = encrypted.encryptedData;
    wrappedDek = encrypted.wrappedDek;
    kekVersion = encrypted.kekVersion;
  }

  await storage.write(storageKey, payloadToStore);

  // Bounding box: prefer the chunk's first matching bbox on the same
  // page. The chunk-level bounding boxes are page-tagged so we can
  // pick deterministically without re-walking elements.
  const provenance = readAssetProvenance(chunk.metadata, 'imageProvenance')[imageIndex];
  const bbox = provenance?.bbox ?? chunk.boundingBoxes[imageIndex] ?? null;
  const pageNumber = provenance?.pageNumber ?? chunk.pageStart;

  return {
    id: newAssetId(),
    chunkId,
    documentId,
    documentVersionId,
    vaultId,
    assetType: 'image',
    mimeType: image.mimeType,
    storageKey,
    inlinePayload: null,
    sourceElementId: provenance?.elementId ?? null,
    pageNumber,
    bbox,
    byteSize: image.data.length,
    sha256Hash: sha,
    fileEncryptionKeyWrapped: wrappedDek,
    fileEncryptionKekVersion: kekVersion,
  };
}

async function buildTableAssetRow({
  chunk,
  chunkId,
  documentId,
  documentVersionId,
  vaultId,
  tableIndex,
  storage,
  encryption,
}: {
  chunk: ParsedChunk;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  vaultId: string;
  tableIndex: number;
  storage: StorageDriver;
  encryption: EncryptionServices;
}): Promise<AssetRow> {
  const html = chunk.tablesHtml[tableIndex]!;
  const htmlBytes = Buffer.byteLength(html, 'utf8');
  const sha = sha256Hex(html);
  const provenance = readAssetProvenance(chunk.metadata, 'tableProvenance')[tableIndex];
  const pageNumber = provenance?.pageNumber ?? chunk.pageStart;
  const bbox = provenance?.bbox ?? null;

  // Inline path keeps small tables next to the chunk for fast retrieval
  // and avoids one storage read per citation. Inline payloads are not
  // encrypted because the column is plain text — operators wanting
  // table HTML at rest encryption should let it spill to storage.
  if (htmlBytes <= INLINE_TABLE_HTML_MAX_BYTES) {
    return {
      id: newAssetId(),
      chunkId,
      documentId,
      documentVersionId,
      vaultId,
      assetType: 'table',
      mimeType: 'text/html',
      storageKey: null,
      inlinePayload: html,
      sourceElementId: provenance?.elementId ?? null,
      pageNumber,
      bbox,
      byteSize: htmlBytes,
      sha256Hash: sha,
      fileEncryptionKeyWrapped: null,
      fileEncryptionKekVersion: null,
    };
  }

  const storageKey = tableStorageKey({
    documentVersionId,
    chunkKey: chunk.id,
    tableIndex,
  });

  let payloadToStore: Buffer = Buffer.from(html, 'utf8');
  let wrappedDek: string | null = null;
  let kekVersion: string | null = null;

  if (encryption.isEnabled()) {
    const encrypted = encryption.encrypt(payloadToStore);
    payloadToStore = encrypted.encryptedData;
    wrappedDek = encrypted.wrappedDek;
    kekVersion = encrypted.kekVersion;
  }

  await storage.write(storageKey, payloadToStore);

  return {
    id: newAssetId(),
    chunkId,
    documentId,
    documentVersionId,
    vaultId,
    assetType: 'table',
    mimeType: 'text/html',
    storageKey,
    inlinePayload: null,
    sourceElementId: provenance?.elementId ?? null,
    pageNumber,
    bbox,
    byteSize: htmlBytes,
    sha256Hash: sha,
    fileEncryptionKeyWrapped: wrappedDek,
    fileEncryptionKekVersion: kekVersion,
  };
}

/**
 * Persist a {@link ParsedDocument} into `document_versions` +
 * `document_chunks` + `document_chunk_assets`. This is the sole writer of
 * parser output — the worker never touches chunk columns directly.
 *
 * Idempotent for an in-progress version: existing chunk rows and asset rows
 * for the version are deleted before re-insert. Storage objects for previous
 * assets are *not* swept here (the storage driver may not support
 * enumeration); logical purge handles stored asset cleanup.
 */
export async function persistParsedDocument({
  db,
  storage,
  encryption,
  documentId,
  documentVersionId,
  vaultId,
  parsed,
}: {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  documentId: string;
  documentVersionId: string;
  vaultId: string;
  parsed: ParsedDocument;
}) {
  await db.transaction(async (tx) => {
    const [version] = await tx
      .select({ id: documentVersionsTable.id })
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.id, documentVersionId),
          eq(documentVersionsTable.documentId, documentId),
          eq(documentVersionsTable.vaultId, vaultId),
          isNull(documentVersionsTable.deletedAt),
        ),
      )
      .limit(1);

    if (version === undefined) {
      throw new Error(`Document version ${documentVersionId} not found for document ${documentId}`);
    }

    // Replace all existing chunks + assets for idempotent re-processing.
    // Asset rows would also cascade-delete via the chunk FK, but explicit
    // deletes give us a deterministic ordering and let us drop stale rows
    // even when the chunk count shrinks.
    await tx
      .delete(documentChunkAssetsTable)
      .where(eq(documentChunkAssetsTable.documentVersionId, documentVersionId));
    await tx
      .delete(documentChunksTable)
      .where(eq(documentChunksTable.documentVersionId, documentVersionId));

    if (parsed.chunks.length > 0) {
      const insertedChunks = await tx
        .insert(documentChunksTable)
        .values(
          parsed.chunks.map((chunk, index) => ({
            documentId,
            documentVersionId,
            vaultId,
            chunkIndex: index,
            chunkKey: chunk.id,
            content: chunk.text,
            section: chunk.section,
            sectionPath: chunk.sectionPath,
            pageNumber: chunk.pageNumber,
            chunkType: chunk.type,
            tokenCount:
              typeof chunk.metadata.tokenCount === 'number' ? chunk.metadata.tokenCount : null,
            contentSha256: sha256Hex(chunk.text),
            parserEngine: parsed.engine,
            metadata: chunk.metadata,
            pageStart: chunk.pageStart,
            pageEnd: chunk.pageEnd,
            boundingBoxes: chunk.boundingBoxes,
            sourceElementIds: chunk.sourceElementIds,
            parentElementId: chunk.parentElementId,
            originalText: chunk.originalText,
            tablesHtml: chunk.tablesHtml,
            citationPrecision: chunk.citationPrecision,
          })),
        )
        .returning({ id: documentChunksTable.id, chunkKey: documentChunksTable.chunkKey });

      const chunkIdByKey = new Map(insertedChunks.map(row => [row.chunkKey, row.id]));

      const assetRows: AssetRow[] = [];
      for (const chunk of parsed.chunks) {
        const chunkId = chunkIdByKey.get(chunk.id);
        if (chunkId === undefined) {
          continue;
        }

        for (let imageIndex = 0; imageIndex < chunk.images.length; imageIndex += 1) {
          assetRows.push(
            await buildImageAssetRow({
              chunk,
              chunkId,
              documentId,
              documentVersionId,
              vaultId,
              imageIndex,
              storage,
              encryption,
            }),
          );
        }

        for (let tableIndex = 0; tableIndex < chunk.tablesHtml.length; tableIndex += 1) {
          assetRows.push(
            await buildTableAssetRow({
              chunk,
              chunkId,
              documentId,
              documentVersionId,
              vaultId,
              tableIndex,
              storage,
              encryption,
            }),
          );
        }
      }

      if (assetRows.length > 0) {
        await tx.insert(documentChunkAssetsTable).values(assetRows);
      }
    }

    await tx
      .update(documentVersionsTable)
      .set({
        content: parsed.text,
        rawText: parsed.rawText,
        rawMarkdown: parsed.rawMarkdown,
        parserStructuredOutput: parsed.rawStructuredOutput,
        language: parsed.language,
        parserEngine: parsed.engine,
        parserEngineVersion: parsed.engineVersion,
        parserWarnings: parsed.warnings,
        processingStatus: 'completed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentVersionsTable.id, documentVersionId),
          eq(documentVersionsTable.documentId, documentId),
          eq(documentVersionsTable.vaultId, vaultId),
          isNull(documentVersionsTable.deletedAt),
        ),
      );

    await tx
      .update(documentsTable)
      .set({
        content: parsed.text,
        rawText: parsed.rawText,
        rawMarkdown: parsed.rawMarkdown,
        parserStructuredOutput: parsed.rawStructuredOutput,
        language: parsed.language,
        parserEngine: parsed.engine,
        parserEngineVersion: parsed.engineVersion,
        parserWarnings: parsed.warnings,
        processingStatus: 'completed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.vaultId, vaultId),
          eq(documentsTable.currentVersionId, documentVersionId),
        ),
      );
  });
}
