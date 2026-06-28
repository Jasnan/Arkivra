import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { generateId } from '../database/schema/helpers.js';
import type { Database } from '../database/database.js';
import {
  documentChunkAssetsTable,
  documentChunkEmbeddingsTable,
  documentChunksTable,
  documentEmbeddingIndexStatusTable,
  documentVersionsTable,
  documentsTable,
} from '../database/schema/index.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import type { StorageDriver } from '../storage/storage.types.js';
import {
  documentVersionChunkAssetStorageKey,
  documentVersionChunkAssetStoragePrefix,
  documentVersionPagePreviewStoragePrefix,
  documentVersionPreviewPdfStorageKey,
  documentVersionSourceStorageKey,
} from './document-storage-keys.js';
import type {
  DeleteDocumentVersionResult,
  DocumentVersionSummary,
  RestoreDocumentVersionResult,
} from './documents.service-types.js';

export function createDocumentVersionLifecycleServices({
  db,
  storage,
  resolveDocumentVersion,
  documentVersionSelectFields,
  toDocumentVersionSummary,
}: {
  db: Database;
  storage: StorageDriver;
  resolveDocumentVersion: (input: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersion?: boolean;
  }) => Promise<DocumentVersionSummary | null>;
  documentVersionSelectFields: () => any;
  toDocumentVersionSummary: (row: any) => DocumentVersionSummary;
}) {
  async function refreshEmbeddingCountsAfterVersionRemoval(documentVersionId: string) {
    await db.execute(sql`
      WITH affected_indexes AS (
        SELECT embedding_index_id
        FROM document_chunk_embeddings
        WHERE document_version_id = ${documentVersionId}
        UNION
        SELECT embedding_index_id
        FROM document_embedding_index_status
        WHERE document_version_id = ${documentVersionId}
      ),
      deleted_embeddings AS (
        DELETE FROM document_chunk_embeddings
        WHERE document_version_id = ${documentVersionId}
        RETURNING embedding_index_id
      ),
      deleted_statuses AS (
        DELETE FROM document_embedding_index_status
        WHERE document_version_id = ${documentVersionId}
        RETURNING embedding_index_id
      )
      UPDATE embedding_indexes AS ei
      SET
        expected_chunk_count = COALESCE((
          SELECT sum(expected_chunk_count)::int
          FROM document_embedding_index_status
          WHERE embedding_index_id = ei.id
        ), 0),
        embedded_chunk_count = COALESCE((
          SELECT count(*)::int
          FROM document_chunk_embeddings
          WHERE embedding_index_id = ei.id
        ), 0),
        failed_chunk_count = COALESCE((
          SELECT sum(expected_chunk_count)::int
          FROM document_embedding_index_status
          WHERE embedding_index_id = ei.id
            AND status IN ('failed', 'stale')
        ), 0),
        updated_at = now()
      WHERE ei.id IN (SELECT embedding_index_id FROM affected_indexes)
    `);
  }

  function restoredAssetStorageKey({
    sourceStorageKey,
    sourceDocumentVersionId,
    targetDocumentVersionId,
    targetAssetId,
  }: {
    sourceStorageKey: string;
    sourceDocumentVersionId: string;
    targetDocumentVersionId: string;
    targetAssetId: string;
  }) {
    const sourcePrefix = `${documentVersionChunkAssetStoragePrefix(sourceDocumentVersionId)}/`;
    const relativePath = sourceStorageKey.startsWith(sourcePrefix)
      ? sourceStorageKey.slice(sourcePrefix.length)
      : `restored-assets/${targetAssetId}`;

    return documentVersionChunkAssetStorageKey({
      documentVersionId: targetDocumentVersionId,
      assetPath: relativePath,
    });
  }

  async function restoreDocumentVersion({
    documentId,
    documentVersionId,
    vaultId,
    restoredBy,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    restoredBy: string;
  }): Promise<RestoreDocumentVersionResult> {
    const sourceVersion = await resolveDocumentVersion({
      documentId,
      documentVersionId,
      vaultId,
    });

    if (sourceVersion === null) {
      return { success: false, reason: 'not_found' };
    }

    if (sourceVersion.isCurrent) {
      return { success: false, reason: 'current_version' };
    }

    if (sourceVersion.processingStatus !== 'completed') {
      return { success: false, reason: 'invalid_status' };
    }

    const sourceChunks = await db
      .select()
      .from(documentChunksTable)
      .where(
        and(
          eq(documentChunksTable.documentId, documentId),
          eq(documentChunksTable.documentVersionId, documentVersionId),
          eq(documentChunksTable.vaultId, vaultId),
        ),
      )
      .orderBy(asc(documentChunksTable.chunkIndex));

    const sourceAssets = await db
      .select()
      .from(documentChunkAssetsTable)
      .where(
        and(
          eq(documentChunkAssetsTable.documentId, documentId),
          eq(documentChunkAssetsTable.documentVersionId, documentVersionId),
          eq(documentChunkAssetsTable.vaultId, vaultId),
        ),
      );

    const targetDocumentVersionId = generateId({ prefix: 'dvr' });
    const targetSourceStorageKey = documentVersionSourceStorageKey({
      vaultId,
      documentVersionId: targetDocumentVersionId,
    });
    const targetPreviewPdfStorageKey =
      sourceVersion.previewPdfStorageKey === null
        ? null
        : documentVersionPreviewPdfStorageKey({ documentVersionId: targetDocumentVersionId });
    const restoredStorageKeys: string[] = [];

    const chunkIdBySourceId = new Map<string, string>();
    for (const chunk of sourceChunks) {
      chunkIdBySourceId.set(chunk.id, generateId({ prefix: 'chk' }));
    }

    const assetCopies: Array<{ sourceStorageKey: string; targetStorageKey: string }> = [];
    const targetAssets = sourceAssets.map((asset) => {
      const targetAssetId = generateId({ prefix: 'cas' });
      const targetStorageKey =
        asset.storageKey === null
          ? null
          : restoredAssetStorageKey({
              sourceStorageKey: asset.storageKey,
              sourceDocumentVersionId: documentVersionId,
              targetDocumentVersionId,
              targetAssetId,
            });

      if (asset.storageKey !== null && targetStorageKey !== null) {
        assetCopies.push({ sourceStorageKey: asset.storageKey, targetStorageKey });
      }

      return {
        ...asset,
        id: targetAssetId,
        chunkId: chunkIdBySourceId.get(asset.chunkId) ?? asset.chunkId,
        documentVersionId: targetDocumentVersionId,
        storageKey: targetStorageKey,
      };
    });

    let restoredVersion: DocumentVersionSummary;
    try {
      const sourceBytes = await storage.read(sourceVersion.originalStorageKey);
      await storage.write(targetSourceStorageKey, sourceBytes);
      restoredStorageKeys.push(targetSourceStorageKey);

      if (sourceVersion.previewPdfStorageKey !== null && targetPreviewPdfStorageKey !== null) {
        await storage.write(
          targetPreviewPdfStorageKey,
          await storage.read(sourceVersion.previewPdfStorageKey),
        );
        restoredStorageKeys.push(targetPreviewPdfStorageKey);
      }

      for (const copy of assetCopies) {
        await storage.write(copy.targetStorageKey, await storage.read(copy.sourceStorageKey));
        restoredStorageKeys.push(copy.targetStorageKey);
      }

      restoredVersion = await db.transaction(async (tx) => {
        const [latestVersion] = await tx
          .select({ versionNumber: documentVersionsTable.versionNumber })
          .from(documentVersionsTable)
          .where(
            and(
              eq(documentVersionsTable.documentId, documentId),
              eq(documentVersionsTable.vaultId, vaultId),
            ),
          )
          .orderBy(desc(documentVersionsTable.versionNumber))
          .limit(1);
        const [version] = await tx
          .insert(documentVersionsTable)
          .values({
            id: targetDocumentVersionId,
            documentId,
            vaultId,
            versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
            uploadedBy: restoredBy,
            uploadedAt: sql`now()`,
            originalName: sourceVersion.originalName,
            originalSize: sourceVersion.originalSize,
            originalStorageKey: targetSourceStorageKey,
            originalSha256Hash: sourceVersion.originalSha256Hash,
            mimeType: sourceVersion.mimeType,
            previewPdfStorageKey: targetPreviewPdfStorageKey,
            previewPdfSize: sourceVersion.previewPdfSize,
            previewPdfSha256Hash: sourceVersion.previewPdfSha256Hash,
            previewPdfConverter: sourceVersion.previewPdfConverter,
            previewPdfConverterVersion: sourceVersion.previewPdfConverterVersion,
            previewPdfCreatedAt: sourceVersion.previewPdfCreatedAt,
            previewPdfEncryptionKeyWrapped: sourceVersion.previewPdfEncryptionKeyWrapped,
            previewPdfEncryptionKekVersion: sourceVersion.previewPdfEncryptionKekVersion,
            previewPdfEncryptionAlgorithm: sourceVersion.previewPdfEncryptionAlgorithm,
            content: sourceVersion.content,
            rawText: sourceVersion.rawText,
            rawMarkdown: sourceVersion.rawMarkdown,
            parserStructuredOutput: sourceVersion.parserStructuredOutput,
            language: sourceVersion.language,
            parserEngine: sourceVersion.parserEngine,
            parserEngineVersion: sourceVersion.parserEngineVersion,
            parserWarnings: sourceVersion.parserWarnings,
            processingStatus: sourceVersion.processingStatus,
            fileEncryptionKeyWrapped: sourceVersion.fileEncryptionKeyWrapped,
            fileEncryptionKekVersion: sourceVersion.fileEncryptionKekVersion,
            fileEncryptionAlgorithm: sourceVersion.fileEncryptionAlgorithm,
            restoredFromVersionId: sourceVersion.id,
          })
          .returning();

        if (version === undefined) {
          throw new Error('Failed to insert restored document version');
        }

        if (sourceChunks.length > 0) {
          await tx.insert(documentChunksTable).values(
            sourceChunks.map((chunk) => ({
              id: chunkIdBySourceId.get(chunk.id) ?? generateId({ prefix: 'chk' }),
              documentId,
              documentVersionId: targetDocumentVersionId,
              vaultId,
              chunkIndex: chunk.chunkIndex,
              chunkKey: chunk.chunkKey,
              content: chunk.content,
              section: chunk.section,
              sectionPath: chunk.sectionPath,
              pageNumber: chunk.pageNumber,
              chunkType: chunk.chunkType,
              tokenCount: chunk.tokenCount,
              contentSha256: chunk.contentSha256,
              parserEngine: chunk.parserEngine,
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
          );
        }

        if (targetAssets.length > 0) {
          await tx.insert(documentChunkAssetsTable).values(
            targetAssets.map((asset) => ({
              id: asset.id,
              chunkId: asset.chunkId,
              documentId,
              documentVersionId: targetDocumentVersionId,
              vaultId,
              assetType: asset.assetType,
              mimeType: asset.mimeType,
              storageKey: asset.storageKey,
              inlinePayload: asset.inlinePayload,
              sourceElementId: asset.sourceElementId,
              pageNumber: asset.pageNumber,
              bbox: asset.bbox,
              byteSize: asset.byteSize,
              sha256Hash: asset.sha256Hash,
              fileEncryptionKeyWrapped: asset.fileEncryptionKeyWrapped,
              fileEncryptionKekVersion: asset.fileEncryptionKekVersion,
            })),
          );
        }

        await tx
          .update(documentsTable)
          .set({
            currentVersionId: targetDocumentVersionId,
            originalName: sourceVersion.originalName,
            originalSize: sourceVersion.originalSize,
            originalStorageKey: targetSourceStorageKey,
            originalSha256Hash: sourceVersion.originalSha256Hash,
            mimeType: sourceVersion.mimeType,
            previewPdfStorageKey: targetPreviewPdfStorageKey,
            previewPdfSize: sourceVersion.previewPdfSize,
            previewPdfSha256Hash: sourceVersion.previewPdfSha256Hash,
            previewPdfConverter: sourceVersion.previewPdfConverter,
            previewPdfConverterVersion: sourceVersion.previewPdfConverterVersion,
            previewPdfCreatedAt: sourceVersion.previewPdfCreatedAt,
            previewPdfEncryptionKeyWrapped: sourceVersion.previewPdfEncryptionKeyWrapped,
            previewPdfEncryptionKekVersion: sourceVersion.previewPdfEncryptionKekVersion,
            previewPdfEncryptionAlgorithm: sourceVersion.previewPdfEncryptionAlgorithm,
            content: sourceVersion.content,
            rawText: sourceVersion.rawText,
            rawMarkdown: sourceVersion.rawMarkdown,
            parserStructuredOutput: sourceVersion.parserStructuredOutput,
            language: sourceVersion.language,
            parserEngine: sourceVersion.parserEngine,
            parserEngineVersion: sourceVersion.parserEngineVersion,
            parserWarnings: sourceVersion.parserWarnings,
            processingStatus: sourceVersion.processingStatus,
            fileEncryptionKeyWrapped: sourceVersion.fileEncryptionKeyWrapped,
            fileEncryptionKekVersion: sourceVersion.fileEncryptionKekVersion,
            fileEncryptionAlgorithm: sourceVersion.fileEncryptionAlgorithm,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(documentsTable.id, documentId),
              eq(documentsTable.vaultId, vaultId),
              eq(documentsTable.isDeleted, false),
            ),
          );

        const [row] = await tx
          .select(documentVersionSelectFields())
          .from(documentVersionsTable)
          .innerJoin(
            documentsTable,
            and(
              eq(documentVersionsTable.documentId, documentsTable.id),
              eq(documentVersionsTable.vaultId, documentsTable.vaultId),
            ),
          )
          .where(eq(documentVersionsTable.id, targetDocumentVersionId))
          .limit(1);

        if (row === undefined) {
          throw new Error('Failed to load restored document version');
        }

        return toDocumentVersionSummary(row);
      });
    } catch (error) {
      await Promise.allSettled(restoredStorageKeys.map((storageKey) => storage.remove(storageKey)));
      throw error;
    }

    const copied = await createEmbeddingIndexServices({ db }).copyEmbeddingsForRestoredVersion({
      sourceDocumentVersionId: sourceVersion.id,
      targetDocumentVersionId: restoredVersion.id,
    });

    return {
      success: true,
      documentVersion: restoredVersion,
      sourceVersion,
      copiedEmbeddingIndexIds: copied.readyEmbeddingIndexIds,
    };
  }

  async function deleteDocumentVersion({
    documentId,
    documentVersionId,
    vaultId,
    deletedBy,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    deletedBy: string;
  }): Promise<DeleteDocumentVersionResult> {
    const version = await resolveDocumentVersion({
      documentId,
      documentVersionId,
      vaultId,
    });

    if (version === null) {
      return { success: false, reason: 'not_found' };
    }

    if (version.isCurrent) {
      return { success: false, reason: 'current_version' };
    }

    const assetRows = await db
      .select({ storageKey: documentChunkAssetsTable.storageKey })
      .from(documentChunkAssetsTable)
      .where(
        and(
          eq(documentChunkAssetsTable.documentId, documentId),
          eq(documentChunkAssetsTable.documentVersionId, documentVersionId),
          eq(documentChunkAssetsTable.vaultId, vaultId),
        ),
      );

    await refreshEmbeddingCountsAfterVersionRemoval(documentVersionId);

    await db.transaction(async (tx) => {
      await tx
        .delete(documentChunkAssetsTable)
        .where(eq(documentChunkAssetsTable.documentVersionId, documentVersionId));
      await tx
        .delete(documentChunkEmbeddingsTable)
        .where(eq(documentChunkEmbeddingsTable.documentVersionId, documentVersionId));
      await tx
        .delete(documentEmbeddingIndexStatusTable)
        .where(eq(documentEmbeddingIndexStatusTable.documentVersionId, documentVersionId));
      await tx
        .delete(documentChunksTable)
        .where(eq(documentChunksTable.documentVersionId, documentVersionId));
      await tx
        .update(documentVersionsTable)
        .set({
          content: '',
          rawText: '',
          rawMarkdown: '',
          parserStructuredOutput: null,
          language: null,
          parserEngine: null,
          parserEngineVersion: null,
          parserWarnings: null,
          deletedAt: sql`now()`,
          deletedBy,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(documentVersionsTable.id, documentVersionId),
            eq(documentVersionsTable.documentId, documentId),
            eq(documentVersionsTable.vaultId, vaultId),
            isNull(documentVersionsTable.deletedAt),
          ),
        );
    });

    for (const asset of assetRows) {
      if (asset.storageKey !== null) {
        await storage.remove(asset.storageKey);
      }
    }
    await storage.removePrefix?.(documentVersionChunkAssetStoragePrefix(documentVersionId));
    await storage.removePrefix?.(documentVersionPagePreviewStoragePrefix(documentVersionId));
    await storage.remove(version.originalStorageKey);

    const deletedVersion = await resolveDocumentVersion({
      documentId,
      documentVersionId,
      vaultId,
      includeDeletedVersion: true,
    });

    return {
      success: true,
      documentVersion: deletedVersion ?? {
        ...version,
        content: '',
        rawText: '',
        rawMarkdown: '',
        parserStructuredOutput: null,
        language: null,
        parserEngine: null,
        parserEngineVersion: null,
        parserWarnings: null,
        deletedAt: new Date(),
        deletedBy,
      },
    };
  }



  return {
    deleteDocumentVersion,
    refreshEmbeddingCountsAfterVersionRemoval,
    restoreDocumentVersion,
  };
}
