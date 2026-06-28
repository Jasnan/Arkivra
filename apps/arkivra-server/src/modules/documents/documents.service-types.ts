import type { documentsTable } from '../database/schema/index.js';

export type DocumentProcessingStatus =
  | 'pending'
  | 'queued'
  | 'partitioning'
  | 'chunking'
  | 'summarising'
  | 'completed'
  | 'failed';

export type DerivedPreviewStatus = 'pending' | 'ready' | 'unavailable' | 'failed';

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
  previewPdfStorageKey: string | null;
  previewPdfSize: number | null;
  previewPdfSha256Hash: string | null;
  previewPdfConverter: string | null;
  previewPdfConverterVersion: string | null;
  previewPdfCreatedAt: Date | null;
  previewPdfEncryptionKeyWrapped: string | null;
  previewPdfEncryptionKekVersion: string | null;
  previewPdfEncryptionAlgorithm: string | null;
  derivedPreviewStatus: DerivedPreviewStatus;
  derivedPreviewErrorCode: string | null;
  derivedPreviewErrorMessage: string | null;
  derivedPreviewFailedAt: Date | null;
  content: string;
  rawText: string;
  rawMarkdown: string;
  parserStructuredOutput: Record<string, unknown> | null;
  language: DocumentLanguageMetadata;
  parserEngine: string | null;
  parserEngineVersion: string | null;
  parserWarnings: string[] | null;
  processingStatus: DocumentProcessingStatus;
  processingErrorCode: string | null;
  processingErrorMessage: string | null;
  processingFailedAt: Date | null;
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
  derivedPreviewStatus?: DerivedPreviewStatus;
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

export type ActiveDocumentRecord = {
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

export type ChunkAssetRecord = {
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

export type FolderRestoreNode = {
  id: string;
  parentId: string | null;
  name: string;
  isDeleted: boolean;
};
