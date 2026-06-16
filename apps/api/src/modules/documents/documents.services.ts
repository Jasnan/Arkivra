import { createHash } from 'node:crypto';
import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import { and, asc, desc, eq, exists, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  chatConversationsTable,
  chatMessageCitationsTable,
  documentChunkAssetsTable,
  documentChunkEmbeddingsTable,
  documentChunksTable,
  documentEmbeddingIndexStatusTable,
  documentTagsTable,
  documentVersionsTable,
  documentsTable,
  usersTable,
  vaultFoldersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { generateId } from '../database/schema/helpers.js';
import type { SearchSortBy } from '../search/search.types.js';
import { renderPdfPageToImage } from '../parsing/pdf-page-renderer.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import {
  documentVersionChunkAssetStorageKey,
  documentVersionChunkAssetStoragePrefix,
  documentVersionPagePreviewStorageKey,
  documentVersionSourceStorageKey,
  legacyDocumentPagePreviewStoragePrefix,
  documentVersionPagePreviewStoragePrefix,
} from './document-storage-keys.js';

export type DocumentsServices = ReturnType<typeof createDocumentsServices>;
export type DocumentProcessingStatus =
  | 'pending'
  | 'queued'
  | 'partitioning'
  | 'chunking'
  | 'summarising'
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
  | { success: false; reason: 'duplicate'; existingId: string }
  | { success: false; reason: 'skipped'; existingId: string };

export type RestoreDocumentVersionResult =
  | {
      success: true;
      documentVersion: DocumentVersionSummary;
      sourceVersion: DocumentVersionSummary;
      copiedEmbeddingIndexIds: string[];
    }
  | { success: false; reason: 'not_found' | 'current_version' | 'invalid_status' };

export type DeleteDocumentVersionResult =
  | { success: true; documentVersion: DocumentVersionSummary }
  | {
      success: false;
      reason: 'not_found' | 'current_version';
    };

export type DeletionImpactConversation = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DeletionImpactPreview = {
  affectedConversationCount: number;
  affectedConversations: DeletionImpactConversation[];
  limit: number;
};

export type DocumentDeletionImpactPreview = DeletionImpactPreview & {
  versionCount: number;
};

export type BulkDocumentDeletionImpactPreview = {
  documentCount: number;
  versionCount: number;
  affectedConversationCount: number;
};

export type VersionDeletionImpactResult =
  | { success: true; impact: DeletionImpactPreview }
  | { success: false; reason: 'not_found' };

export type DocumentDeletionImpactResult =
  | { success: true; impact: DocumentDeletionImpactPreview }
  | { success: false; reason: 'not_found' };

export type BulkDocumentDeletionImpactResult = {
  success: true;
  impact: BulkDocumentDeletionImpactPreview;
};

export type RenameDocumentResult =
  | { success: true; document: { id: string; name: string; updatedAt: Date } }
  | { success: false; reason: 'not_found' | 'duplicate_name'; existingId?: string };

export type MoveDocumentResult =
  | { success: true; document: { id: string; folderId: string | null; updatedAt: Date } }
  | {
      success: false;
      reason: 'not_found' | 'folder_not_found' | 'duplicate_name';
      existingId?: string;
    };

export type DuplicateDocumentScope = 'active' | 'trash';
export type UploadConflictStrategy = 'skip' | 'keep_both' | 'new_version';
export type UploadConflictType = 'name' | 'hash';
export type DocumentLanguageMetadata = typeof documentsTable.$inferSelect.language;

export type DocumentVersionSummary = {
  id: string;
  documentId: string;
  vaultId: string;
  versionNumber: number;
  uploadedBy: string | null;
  uploadedAt: Date;
  originalName: string;
  originalSize: number;
  originalStorageKey: string;
  originalSha256Hash: string;
  mimeType: string;
  content: string;
  rawText: string;
  rawMarkdown: string;
  parserStructuredOutput: Record<string, unknown> | null;
  language: DocumentLanguageMetadata;
  parserEngine: string | null;
  parserEngineVersion: string | null;
  parserWarnings: string[] | null;
  processingStatus: DocumentProcessingStatus;
  fileEncryptionKeyWrapped: string | null;
  fileEncryptionKekVersion: string | null;
  fileEncryptionAlgorithm: string | null;
  restoredFromVersionId: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  isCurrent: boolean;
  document: {
    id: string;
    vaultId: string;
    name: string;
    folderId: string | null;
    currentVersionId: string | null;
    isDeleted: boolean;
    deletedAt: Date | null;
  };
};

export type CreateDocumentVersionInput = {
  versionId?: string;
  documentId: string;
  vaultId: string;
  uploadedBy: string;
  originalName: string;
  originalSize: number;
  originalStorageKey: string;
  originalSha256Hash: string;
  mimeType: string;
  fileEncryptionKeyWrapped?: string | null;
  fileEncryptionKekVersion?: string | null;
  fileEncryptionAlgorithm?: string | null;
  processingStatus?: DocumentProcessingStatus;
  restoredFromVersionId?: string | null;
  makeCurrent?: boolean;
};

export type CreateLogicalDocumentWithInitialVersionInput = Omit<
  CreateDocumentVersionInput,
  'documentId' | 'makeCurrent' | 'restoredFromVersionId'
> & {
  documentId?: string;
  versionId?: string;
  folderId?: string | null;
  logicalOriginalName?: string;
  name?: string;
};

export type DocumentPurgePlan = {
  documentId: string;
  vaultId: string;
  versionIds: string[];
  sourceStorageKeys: string[];
  previewStoragePrefixes: string[];
  chunkAssetStorageKeys: string[];
};

export type DocumentChunkSummary = {
  id: string;
  chunkIndex: number;
  content: string;
  originalText: string | null;
  section: string | null;
  sectionPath: string[] | null;
  pageNumber: number | null;
  pageStart: number | null;
  pageEnd: number | null;
  chunkType: string | null;
  tokenCount: number | null;
  parserEngine: string | null;
  citationPrecision: string;
  sourceElementIds: string[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

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

  function buildKeepBothFileName(fileName: string, attempt: number) {
    const dotIndex = fileName.lastIndexOf('.');
    const hasExtension = dotIndex > 0 && dotIndex < fileName.length - 1;
    const baseName = hasExtension ? fileName.slice(0, dotIndex) : fileName;
    const extension = hasExtension ? fileName.slice(dotIndex) : '';
    return normalizeDocumentFileName(`${baseName} (${attempt})${extension}`);
  }

  async function buildAvailableKeepBothFileName({
    vaultId,
    folderId,
    fileName,
  }: {
    vaultId: string;
    folderId: string | null;
    fileName: string;
  }) {
    for (let attempt = 1; attempt <= 100; attempt += 1) {
      const candidate = buildKeepBothFileName(fileName, attempt);
      const collision = await findActiveDocumentFileNameCollision({
        vaultId,
        folderId,
        fileName: candidate,
      });

      if (collision === null) {
        return candidate;
      }
    }

    throw new Error('Could not allocate a unique filename for this upload');
  }

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

  function buildFolderRestoreChain({
    folders,
    folderId,
  }: {
    folders: FolderRestoreNode[];
    folderId: string;
  }) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const chain: FolderRestoreNode[] = [];
    const seen = new Set<string>();
    let current = byId.get(folderId) ?? null;

    while (current !== null) {
      if (seen.has(current.id)) {
        throw new Error(`Cycle detected while resolving restore folder hierarchy for ${folderId}`);
      }

      seen.add(current.id);
      chain.unshift(current);
      current = current.parentId === null ? null : (byId.get(current.parentId) ?? null);
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

    return (
      folders.find(
        (folder) =>
          !folder.isDeleted &&
          (folder.parentId ?? null) === parentId &&
          folder.name.trim().toLocaleLowerCase() === normalizedName,
      ) ?? null
    );
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

  function toDocumentVersionSummary(row: {
    id: string;
    documentId: string;
    vaultId: string;
    versionNumber: number;
    uploadedBy: string | null;
    uploadedAt: Date;
    originalName: string;
    originalSize: number;
    originalStorageKey: string;
    originalSha256Hash: string;
    mimeType: string;
    content: string;
    rawText: string;
    rawMarkdown: string;
    parserStructuredOutput: Record<string, unknown> | null;
    language: DocumentLanguageMetadata;
    parserEngine: string | null;
    parserEngineVersion: string | null;
    parserWarnings: string[] | null;
    processingStatus: DocumentProcessingStatus;
    fileEncryptionKeyWrapped: string | null;
    fileEncryptionKekVersion: string | null;
    fileEncryptionAlgorithm: string | null;
    restoredFromVersionId: string | null;
    deletedAt: Date | null;
    deletedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    documentName: string;
    documentFolderId: string | null;
    documentCurrentVersionId: string | null;
    documentIsDeleted: boolean;
    documentDeletedAt: Date | null;
  }): DocumentVersionSummary {
    return {
      id: row.id,
      documentId: row.documentId,
      vaultId: row.vaultId,
      versionNumber: row.versionNumber,
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt,
      originalName: row.originalName,
      originalSize: row.originalSize,
      originalStorageKey: row.originalStorageKey,
      originalSha256Hash: row.originalSha256Hash,
      mimeType: row.mimeType,
      content: row.content,
      rawText: row.rawText,
      rawMarkdown: row.rawMarkdown,
      parserStructuredOutput: row.parserStructuredOutput,
      language: row.language,
      parserEngine: row.parserEngine,
      parserEngineVersion: row.parserEngineVersion,
      parserWarnings: row.parserWarnings,
      processingStatus: row.processingStatus,
      fileEncryptionKeyWrapped: row.fileEncryptionKeyWrapped,
      fileEncryptionKekVersion: row.fileEncryptionKekVersion,
      fileEncryptionAlgorithm: row.fileEncryptionAlgorithm,
      restoredFromVersionId: row.restoredFromVersionId,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isCurrent: row.documentCurrentVersionId === row.id,
      document: {
        id: row.documentId,
        vaultId: row.vaultId,
        name: row.documentName,
        folderId: row.documentFolderId,
        currentVersionId: row.documentCurrentVersionId,
        isDeleted: row.documentIsDeleted,
        deletedAt: row.documentDeletedAt,
      },
    };
  }

  function documentVersionSelectFields() {
    return {
      id: documentVersionsTable.id,
      documentId: documentVersionsTable.documentId,
      vaultId: documentVersionsTable.vaultId,
      versionNumber: documentVersionsTable.versionNumber,
      uploadedBy: documentVersionsTable.uploadedBy,
      uploadedAt: documentVersionsTable.uploadedAt,
      originalName: documentVersionsTable.originalName,
      originalSize: documentVersionsTable.originalSize,
      originalStorageKey: documentVersionsTable.originalStorageKey,
      originalSha256Hash: documentVersionsTable.originalSha256Hash,
      mimeType: documentVersionsTable.mimeType,
      content: documentVersionsTable.content,
      rawText: documentVersionsTable.rawText,
      rawMarkdown: documentVersionsTable.rawMarkdown,
      parserStructuredOutput: documentVersionsTable.parserStructuredOutput,
      language: documentVersionsTable.language,
      parserEngine: documentVersionsTable.parserEngine,
      parserEngineVersion: documentVersionsTable.parserEngineVersion,
      parserWarnings: documentVersionsTable.parserWarnings,
      processingStatus: documentVersionsTable.processingStatus,
      fileEncryptionKeyWrapped: documentVersionsTable.fileEncryptionKeyWrapped,
      fileEncryptionKekVersion: documentVersionsTable.fileEncryptionKekVersion,
      fileEncryptionAlgorithm: documentVersionsTable.fileEncryptionAlgorithm,
      restoredFromVersionId: documentVersionsTable.restoredFromVersionId,
      deletedAt: documentVersionsTable.deletedAt,
      deletedBy: documentVersionsTable.deletedBy,
      createdAt: documentVersionsTable.createdAt,
      updatedAt: documentVersionsTable.updatedAt,
      documentName: documentsTable.name,
      documentFolderId: documentsTable.folderId,
      documentCurrentVersionId: documentsTable.currentVersionId,
      documentIsDeleted: documentsTable.isDeleted,
      documentDeletedAt: documentsTable.deletedAt,
    };
  }

  async function resolveDocumentVersion({
    documentId,
    documentVersionId,
    vaultId,
    includeDeletedDocument = false,
    includeDeletedVersion = false,
  }: {
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersion?: boolean;
  }): Promise<DocumentVersionSummary | null> {
    const conditions = [
      eq(documentVersionsTable.id, documentVersionId),
      eq(documentVersionsTable.documentId, documentId),
      eq(documentVersionsTable.vaultId, vaultId),
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
    ];

    if (!includeDeletedDocument) {
      conditions.push(eq(documentsTable.isDeleted, false));
    }

    if (!includeDeletedVersion) {
      conditions.push(isNull(documentVersionsTable.deletedAt));
    }

    const [row] = await db
      .select(documentVersionSelectFields())
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        and(
          eq(documentVersionsTable.documentId, documentsTable.id),
          eq(documentVersionsTable.vaultId, documentsTable.vaultId),
        ),
      )
      .where(and(...conditions))
      .limit(1);

    return row === undefined ? null : toDocumentVersionSummary(row);
  }

  async function resolveLatestDocumentVersion({
    documentId,
    vaultId,
    includeDeletedDocument = false,
    includeDeletedVersion = false,
  }: {
    documentId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersion?: boolean;
  }): Promise<DocumentVersionSummary | null> {
    const conditions = [
      eq(documentVersionsTable.documentId, documentId),
      eq(documentVersionsTable.vaultId, vaultId),
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
    ];

    if (!includeDeletedDocument) {
      conditions.push(eq(documentsTable.isDeleted, false));
    }

    if (!includeDeletedVersion) {
      conditions.push(isNull(documentVersionsTable.deletedAt));
    }

    const currentVersionRank = sql<number>`
      CASE
        WHEN ${documentsTable.currentVersionId} = ${documentVersionsTable.id} THEN 0
        ELSE 1
      END
    `;

    const [row] = await db
      .select(documentVersionSelectFields())
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        and(
          eq(documentVersionsTable.documentId, documentsTable.id),
          eq(documentVersionsTable.vaultId, documentsTable.vaultId),
        ),
      )
      .where(and(...conditions))
      .orderBy(currentVersionRank, desc(documentVersionsTable.versionNumber))
      .limit(1);

    return row === undefined ? null : toDocumentVersionSummary(row);
  }

  async function listDocumentVersions({
    documentId,
    vaultId,
    includeDeletedDocument = false,
    includeDeletedVersions = false,
  }: {
    documentId: string;
    vaultId: string;
    includeDeletedDocument?: boolean;
    includeDeletedVersions?: boolean;
  }): Promise<DocumentVersionSummary[] | null> {
    const documentConditions = [
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
    ];

    if (!includeDeletedDocument) {
      documentConditions.push(eq(documentsTable.isDeleted, false));
    }

    const [document] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(and(...documentConditions))
      .limit(1);

    if (document === undefined) {
      return null;
    }

    const versionConditions = [
      eq(documentVersionsTable.documentId, documentId),
      eq(documentVersionsTable.vaultId, vaultId),
    ];

    if (!includeDeletedVersions) {
      versionConditions.push(isNull(documentVersionsTable.deletedAt));
    }

    const rows = await db
      .select(documentVersionSelectFields())
      .from(documentVersionsTable)
      .innerJoin(
        documentsTable,
        and(
          eq(documentVersionsTable.documentId, documentsTable.id),
          eq(documentVersionsTable.vaultId, documentsTable.vaultId),
        ),
      )
      .where(and(...versionConditions))
      .orderBy(desc(documentVersionsTable.versionNumber));

    return rows.map(toDocumentVersionSummary);
  }

  async function createDocumentVersion({
    versionId: providedVersionId,
    documentId,
    vaultId,
    uploadedBy,
    originalName,
    originalSize,
    originalStorageKey,
    originalSha256Hash,
    mimeType,
    fileEncryptionKeyWrapped = null,
    fileEncryptionKekVersion = null,
    fileEncryptionAlgorithm = null,
    processingStatus = 'pending',
    restoredFromVersionId = null,
    makeCurrent = true,
  }: CreateDocumentVersionInput): Promise<DocumentVersionSummary | null> {
    return db.transaction(async (tx) => {
      const [document] = await tx
        .select({
          id: documentsTable.id,
          name: documentsTable.name,
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

      if (document === undefined) {
        return null;
      }

      if (restoredFromVersionId !== null) {
        const [sourceVersion] = await tx
          .select({ id: documentVersionsTable.id })
          .from(documentVersionsTable)
          .where(
            and(
              eq(documentVersionsTable.id, restoredFromVersionId),
              eq(documentVersionsTable.documentId, documentId),
              eq(documentVersionsTable.vaultId, vaultId),
              isNull(documentVersionsTable.deletedAt),
            ),
          )
          .limit(1);

        if (sourceVersion === undefined) {
          return null;
        }
      }

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

      const versionId = providedVersionId ?? generateId({ prefix: 'dvr' });
      const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
      const now = new Date();

      const [version] = await tx
        .insert(documentVersionsTable)
        .values({
          id: versionId,
          documentId,
          vaultId,
          versionNumber,
          uploadedBy,
          uploadedAt: now,
          originalName,
          originalSize,
          originalStorageKey,
          originalSha256Hash,
          mimeType,
          processingStatus,
          fileEncryptionKeyWrapped,
          fileEncryptionKekVersion,
          fileEncryptionAlgorithm,
          restoredFromVersionId,
        })
        .returning();

      if (version === undefined) {
        throw new Error('Failed to insert document version record');
      }

      if (makeCurrent) {
        await tx
          .update(documentsTable)
          .set({
            currentVersionId: version.id,
            originalName,
            originalSize,
            originalStorageKey,
            originalSha256Hash,
            mimeType,
            content: '',
            rawText: '',
            rawMarkdown: '',
            parserStructuredOutput: null,
            language: null,
            parserEngine: null,
            parserEngineVersion: null,
            parserWarnings: null,
            processingStatus,
            fileEncryptionKeyWrapped,
            fileEncryptionKekVersion,
            fileEncryptionAlgorithm,
            updatedAt: now,
          })
          .where(and(eq(documentsTable.id, documentId), eq(documentsTable.vaultId, vaultId)));
      }

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
        .where(
          and(
            eq(documentVersionsTable.id, version.id),
            eq(documentVersionsTable.documentId, documentId),
            eq(documentVersionsTable.vaultId, vaultId),
          ),
        )
        .limit(1);

      return row === undefined ? null : toDocumentVersionSummary(row);
    });
  }

  async function createLogicalDocumentWithInitialVersion({
    documentId: providedDocumentId,
    versionId: providedVersionId,
    vaultId,
    uploadedBy,
    originalName,
    originalSize,
    originalStorageKey,
    originalSha256Hash,
    mimeType,
    fileEncryptionKeyWrapped = null,
    fileEncryptionKekVersion = null,
    fileEncryptionAlgorithm = null,
    processingStatus = 'pending',
    folderId = null,
    logicalOriginalName,
    name,
  }: CreateLogicalDocumentWithInitialVersionInput) {
    return db.transaction(async (tx) => {
      const documentId = providedDocumentId ?? generateId({ prefix: 'doc' });
      const versionId = providedVersionId ?? generateId({ prefix: 'dvr' });
      const logicalName = name ?? originalName;
      const documentOriginalName = logicalOriginalName ?? originalName;
      const now = new Date();

      const [document] = await tx
        .insert(documentsTable)
        .values({
          id: documentId,
          vaultId,
          folderId,
          createdBy: uploadedBy,
          originalName: documentOriginalName,
          originalSize,
          originalStorageKey,
          originalSha256Hash,
          name: logicalName,
          mimeType,
          processingStatus,
          fileEncryptionKeyWrapped,
          fileEncryptionKekVersion,
          fileEncryptionAlgorithm,
        })
        .returning();

      if (document === undefined) {
        throw new Error('Failed to insert logical document record');
      }

      const [version] = await tx
        .insert(documentVersionsTable)
        .values({
          id: versionId,
          documentId,
          vaultId,
          versionNumber: 1,
          uploadedBy,
          uploadedAt: now,
          originalName,
          originalSize,
          originalStorageKey,
          originalSha256Hash,
          mimeType,
          processingStatus,
          fileEncryptionKeyWrapped,
          fileEncryptionKekVersion,
          fileEncryptionAlgorithm,
        })
        .returning();

      if (version === undefined) {
        throw new Error('Failed to insert initial document version record');
      }

      await tx
        .update(documentsTable)
        .set({
          currentVersionId: version.id,
          updatedAt: now,
        })
        .where(and(eq(documentsTable.id, document.id), eq(documentsTable.vaultId, vaultId)));

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
        .where(eq(documentVersionsTable.id, version.id))
        .limit(1);

      if (row === undefined) {
        throw new Error('Failed to load initial document version record');
      }

      return {
        document: {
          ...document,
          currentVersionId: version.id,
        },
        version: toDocumentVersionSummary(row),
      };
    });
  }

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

  async function finalizeUploadedDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
    folderId = null,
    conflictStrategy,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    folderId?: string | null;
    conflictStrategy?: UploadConflictStrategy;
  }) {
    const sha256Hash = computeSha256(fileData);
    const fileSize = fileData.length;
    const normalizedFileName = normalizeDocumentFileName(fileName);

    const existingName = await findActiveDocumentFileNameCollision({
      vaultId,
      folderId,
      fileName: normalizedFileName,
    });

    if (existingName !== null && conflictStrategy === undefined) {
      return {
        document: null,
        documentVersion: null,
        duplicate: true,
        skipped: false,
        existingId: existingName.id,
        duplicateScope: 'active' as const,
        conflictType: 'name' as const,
      };
    }

    if (existingName !== null && conflictStrategy === 'skip') {
      return {
        document: null,
        documentVersion: null,
        duplicate: false,
        skipped: true,
        existingId: existingName.id,
        duplicateScope: 'active' as const,
        conflictType: 'name' as const,
      };
    }

    const [existingHash] = await db
      .select({
        id: documentsTable.id,
        isDeleted: documentsTable.isDeleted,
      })
      .from(documentsTable)
      .where(
        and(eq(documentsTable.vaultId, vaultId), eq(documentsTable.originalSha256Hash, sha256Hash)),
      )
      .orderBy(asc(documentsTable.isDeleted), desc(documentsTable.updatedAt))
      .limit(1);

    if (
      existingHash !== undefined &&
      !existingHash.isDeleted &&
      (existingName === null || existingHash.id !== existingName.id) &&
      conflictStrategy === 'skip'
    ) {
      return {
        document: null,
        documentVersion: null,
        duplicate: false,
        skipped: true,
        existingId: existingHash.id,
        duplicateScope: existingHash.isDeleted ? ('trash' as const) : ('active' as const),
        conflictType: 'hash' as const,
      };
    }

    if (
      existingHash !== undefined &&
      !existingHash.isDeleted &&
      (existingName === null || existingHash.id !== existingName.id) &&
      conflictStrategy !== 'keep_both'
    ) {
      return {
        document: null,
        documentVersion: null,
        duplicate: true,
        skipped: false,
        existingId: existingHash.id,
        duplicateScope: existingHash.isDeleted ? ('trash' as const) : ('active' as const),
        conflictType: 'hash' as const,
      };
    }

    const shouldCreateNewVersion = existingName !== null && conflictStrategy === 'new_version';
    const docId = shouldCreateNewVersion ? existingName.id : generateId({ prefix: 'doc' });
    const versionId = generateId({ prefix: 'dvr' });
    const storageKey = documentVersionSourceStorageKey({ vaultId, documentVersionId: versionId });
    const logicalName =
      existingName !== null && conflictStrategy === 'keep_both'
        ? await buildAvailableKeepBothFileName({ vaultId, folderId, fileName: normalizedFileName })
        : normalizedFileName;

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

    if (shouldCreateNewVersion) {
      const version = await createDocumentVersion({
        versionId,
        documentId: docId,
        vaultId,
        uploadedBy: userId,
        originalName: normalizedFileName,
        originalSize: fileSize,
        originalStorageKey: storageKey,
        originalSha256Hash: sha256Hash,
        mimeType,
        processingStatus: 'pending',
        fileEncryptionKeyWrapped: wrappedDek,
        fileEncryptionKekVersion: kekVersion,
        fileEncryptionAlgorithm: algorithm,
        makeCurrent: true,
      });

      if (version === null) {
        throw new Error('Failed to insert document version record');
      }

      return {
        document: {
          id: version.document.id,
          vaultId: version.document.vaultId,
          folderId: version.document.folderId,
          currentVersionId: version.id,
          originalName: version.originalName,
          originalSize: version.originalSize,
          originalStorageKey: version.originalStorageKey,
          originalSha256Hash: version.originalSha256Hash,
          name: version.document.name,
          mimeType: version.mimeType,
          processingStatus: version.processingStatus,
          fileEncryptionKeyWrapped: version.fileEncryptionKeyWrapped,
          fileEncryptionKekVersion: version.fileEncryptionKekVersion,
          fileEncryptionAlgorithm: version.fileEncryptionAlgorithm,
          createdAt: version.document.deletedAt ?? version.createdAt,
          updatedAt: version.updatedAt,
        },
        documentVersion: version,
        duplicate: false,
        skipped: false,
        existingId: null,
        duplicateScope: null,
        conflictType: null,
      };
    }

    const created = await createLogicalDocumentWithInitialVersion({
      documentId: docId,
      versionId,
      vaultId,
      uploadedBy: userId,
      originalName: normalizedFileName,
      originalSize: fileSize,
      originalStorageKey: storageKey,
      originalSha256Hash: sha256Hash,
      mimeType,
      processingStatus: 'pending',
      fileEncryptionKeyWrapped: wrappedDek,
      fileEncryptionKekVersion: kekVersion,
      fileEncryptionAlgorithm: algorithm,
      folderId,
      logicalOriginalName: logicalName,
      name: logicalName,
    });

    return {
      document: created.document,
      documentVersion: created.version,
      duplicate: false,
      skipped: false,
      existingId: null,
      duplicateScope: null,
      conflictType: null,
    };
  }

  async function uploadDocument({
    vaultId,
    userId,
    fileName,
    mimeType,
    fileData,
    folderId = null,
    conflictStrategy,
  }: {
    vaultId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    folderId?: string | null;
    conflictStrategy?: UploadConflictStrategy;
  }) {
    return finalizeUploadedDocument({
      vaultId,
      userId,
      fileName,
      mimeType,
      fileData,
      folderId,
      conflictStrategy,
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
    const etag = `"doc-page-${version.originalSha256Hash}-${version.id}-${pageNumber}"`;

    if (await storage.exists(storageKey)) {
      return {
        fileData: await storage.read(storageKey),
        mimeType: 'image/png',
        etag,
        pageNumber,
      };
    }

    const sourceFile = await readDocumentPayload({
      id: documentId,
      vaultId,
      originalName: version.originalName,
      originalSize: version.originalSize,
      originalStorageKey: version.originalStorageKey,
      originalSha256Hash: version.originalSha256Hash,
      mimeType: version.mimeType,
      fileEncryptionKeyWrapped: version.fileEncryptionKeyWrapped,
      fileEncryptionKekVersion: version.fileEncryptionKekVersion,
    });
    const image = await renderPdfPageToImage({
      fileData: sourceFile,
      fileName: version.originalName,
      mimeType: version.mimeType,
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
    const etag = `"doc-page-${version.originalSha256Hash}-${version.id}-${pageNumber}"`;

    if (await storage.exists(storageKey)) {
      return {
        fileData: await storage.read(storageKey),
        mimeType: 'image/png',
        etag,
        pageNumber,
      };
    }

    const sourceFile = await readDocumentVersionPayload(version);
    const image = await renderPdfPageToImage({
      fileData: sourceFile,
      fileName: version.originalName,
      mimeType: version.mimeType,
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

  async function restoreDocument({
    documentId,
    vaultId,
    conflictStrategy,
  }: {
    documentId: string;
    vaultId: string;
    conflictStrategy?: UploadConflictStrategy;
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
        if (conflictStrategy === 'skip') {
          return { success: false, reason: 'skipped', existingId: existing.id };
        }

        if (conflictStrategy !== 'keep_both') {
          return { success: false, reason: 'duplicate', existingId: existing.id };
        }
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
            if (
              activeSibling.id !== folder.id ||
              folder.isDeleted ||
              folder.parentId !== currentParentId
            ) {
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
            .where(and(eq(vaultFoldersTable.id, folder.id), eq(vaultFoldersTable.vaultId, vaultId)))
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

          const folderIndex = folders.findIndex((item) => item.id === folder.id);
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

      if ((await findRestoreNameCollision(restoredOriginalName)) !== null) {
        restoredOriginalName = '';

        for (let attempt = 1; attempt <= 1000; attempt += 1) {
          const candidate = buildRestoredFileName(normalizedOriginalName, attempt);

          if ((await findRestoreNameCollision(candidate)) === null) {
            restoredOriginalName = candidate;
            break;
          }
        }

        if (restoredOriginalName.length === 0) {
          throw new Error(
            `Could not resolve a restore filename for document ${deletedDocument.id}`,
          );
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

  async function getCitationConversationImpact({
    vaultId,
    documentId,
    documentVersionId,
    limit = 5,
  }: {
    vaultId: string;
    documentId: string;
    documentVersionId?: string;
    limit?: number;
  }): Promise<DeletionImpactPreview> {
    const normalizedLimit = Math.max(0, Math.min(limit, 25));
    const versionCondition =
      documentVersionId === undefined
        ? sql`TRUE`
        : sql`${chatMessageCitationsTable.documentVersionId} = ${documentVersionId}`;

    const [countRow] = await db
      .select({
        count: sql<number>`count(DISTINCT ${chatMessageCitationsTable.conversationId})::int`,
      })
      .from(chatMessageCitationsTable)
      .innerJoin(
        chatConversationsTable,
        eq(chatMessageCitationsTable.conversationId, chatConversationsTable.id),
      )
      .where(
        and(
          eq(chatMessageCitationsTable.vaultId, vaultId),
          eq(chatMessageCitationsTable.documentId, documentId),
          isNull(chatConversationsTable.deletedAt),
          versionCondition,
        ),
      );

    const rows =
      normalizedLimit === 0
        ? []
        : await db
            .select({
              id: chatConversationsTable.id,
              title: chatConversationsTable.title,
              createdAt: chatConversationsTable.createdAt,
              updatedAt: chatConversationsTable.updatedAt,
            })
            .from(chatMessageCitationsTable)
            .innerJoin(
              chatConversationsTable,
              eq(chatMessageCitationsTable.conversationId, chatConversationsTable.id),
            )
            .where(
              and(
                eq(chatMessageCitationsTable.vaultId, vaultId),
                eq(chatMessageCitationsTable.documentId, documentId),
                isNull(chatConversationsTable.deletedAt),
                versionCondition,
              ),
            )
            .groupBy(
              chatConversationsTable.id,
              chatConversationsTable.title,
              chatConversationsTable.createdAt,
              chatConversationsTable.updatedAt,
            )
            .orderBy(desc(chatConversationsTable.updatedAt), desc(chatConversationsTable.createdAt))
            .limit(normalizedLimit);

    return {
      affectedConversationCount: countRow?.count ?? 0,
      affectedConversations: rows,
      limit: normalizedLimit,
    };
  }

  async function getDocumentVersionDeletionImpact({
    vaultId,
    documentId,
    documentVersionId,
    limit,
  }: {
    vaultId: string;
    documentId: string;
    documentVersionId: string;
    limit?: number;
  }): Promise<VersionDeletionImpactResult> {
    const version = await resolveDocumentVersion({
      documentId,
      documentVersionId,
      vaultId,
    });

    if (version === null) {
      return { success: false, reason: 'not_found' };
    }

    return {
      success: true,
      impact: await getCitationConversationImpact({
        vaultId,
        documentId,
        documentVersionId,
        limit,
      }),
    };
  }

  async function getDocumentDeletionImpact({
    vaultId,
    documentId,
    limit,
    includeDeletedDocument = false,
  }: {
    vaultId: string;
    documentId: string;
    limit?: number;
    includeDeletedDocument?: boolean;
  }): Promise<DocumentDeletionImpactResult> {
    const documentConditions = [
      eq(documentsTable.id, documentId),
      eq(documentsTable.vaultId, vaultId),
    ];

    if (!includeDeletedDocument) {
      documentConditions.push(eq(documentsTable.isDeleted, false));
    }

    const [document] = await db
      .select({ id: documentsTable.id })
      .from(documentsTable)
      .where(and(...documentConditions))
      .limit(1);

    if (document === undefined) {
      return { success: false, reason: 'not_found' };
    }

    const [versionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentVersionsTable)
      .where(
        and(
          eq(documentVersionsTable.documentId, documentId),
          eq(documentVersionsTable.vaultId, vaultId),
          isNull(documentVersionsTable.deletedAt),
        ),
      );

    return {
      success: true,
      impact: {
        ...(await getCitationConversationImpact({ vaultId, documentId, limit })),
        versionCount: versionCount?.count ?? 0,
      },
    };
  }

  async function getBulkDocumentDeletionImpact({
    targets,
    includeDeletedDocument = false,
  }: {
    targets: Array<{ vaultId: string; documentId: string }>;
    includeDeletedDocument?: boolean;
  }): Promise<BulkDocumentDeletionImpactResult> {
    const uniqueTargets = [
      ...new Map(
        targets
          .map((target) => ({
            vaultId: target.vaultId.trim(),
            documentId: target.documentId.trim(),
          }))
          .filter((target) => target.vaultId.length > 0 && target.documentId.length > 0)
          .map((target) => [`${target.vaultId}:${target.documentId}`, target]),
      ).values(),
    ];

    if (uniqueTargets.length === 0) {
      return {
        success: true,
        impact: {
          documentCount: 0,
          versionCount: 0,
          affectedConversationCount: 0,
        },
      };
    }

    const targetValues = sql.join(
      uniqueTargets.map((target) => sql`(${target.vaultId}, ${target.documentId})`),
      sql`, `,
    );
    const deletedCondition = includeDeletedDocument ? sql`TRUE` : sql`d.is_deleted = false`;

    const [row] = await db
      .execute<{
        document_count: number;
        version_count: number;
        affected_conversation_count: number;
      }>(
        sql`
      WITH requested(vault_id, document_id) AS (
        VALUES ${targetValues}
      ),
      matched_documents AS (
        SELECT d.vault_id, d.id AS document_id
        FROM requested AS r
        INNER JOIN documents AS d
          ON d.vault_id = r.vault_id
          AND d.id = r.document_id
          AND ${deletedCondition}
      ),
      version_counts AS (
        SELECT count(*)::int AS version_count
        FROM document_versions AS dv
        INNER JOIN matched_documents AS md
          ON md.vault_id = dv.vault_id
          AND md.document_id = dv.document_id
        WHERE dv.deleted_at IS NULL
      ),
      conversation_counts AS (
        SELECT count(DISTINCT cmc.conversation_id)::int AS affected_conversation_count
        FROM chat_message_citations AS cmc
        INNER JOIN matched_documents AS md
          ON md.vault_id = cmc.vault_id
          AND md.document_id = cmc.document_id
        INNER JOIN chat_conversations AS cc
          ON cc.id = cmc.conversation_id
          AND cc.deleted_at IS NULL
      )
      SELECT
        (SELECT count(*)::int FROM matched_documents) AS document_count,
        (SELECT version_count FROM version_counts) AS version_count,
        (SELECT affected_conversation_count FROM conversation_counts) AS affected_conversation_count
    `,
      )
      .then((result) => result.rows);

    return {
      success: true,
      impact: {
        documentCount: Number(row?.document_count ?? 0),
        versionCount: Number(row?.version_count ?? 0),
        affectedConversationCount: Number(row?.affected_conversation_count ?? 0),
      },
    };
  }

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
        const now = new Date();

        const [version] = await tx
          .insert(documentVersionsTable)
          .values({
            id: targetDocumentVersionId,
            documentId,
            vaultId,
            versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
            uploadedBy: restoredBy,
            uploadedAt: now,
            originalName: sourceVersion.originalName,
            originalSize: sourceVersion.originalSize,
            originalStorageKey: targetSourceStorageKey,
            originalSha256Hash: sourceVersion.originalSha256Hash,
            mimeType: sourceVersion.mimeType,
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
            updatedAt: now,
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
          deletedAt: new Date(),
          deletedBy,
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
