export interface DocumentLanguageMetadata {
  code: string;
  name: string;
  confidence?: number | null;
  source: 'docling' | 'heuristic' | 'user';
}

export interface DocumentSummary {
  id: string;
  name: string;
  originalName: string;
  folderId: string | null;
  originalSize: number;
  mimeType: string;
  processingStatus?:
    | 'pending'
    | 'queued'
    | 'partitioning'
    | 'chunking'
    | 'summarising'
    | 'vectorising'
    | 'completed'
    | 'failed'
    | 'processing';
  language?: DocumentLanguageMetadata | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
}

export interface DeletedDocumentSummary extends DocumentSummary {
  vaultId: string;
  vaultName: string;
}

export interface DocumentDetail extends DocumentSummary {
  originalSha256Hash: string;
  content: string;
  displayContent?: string;
  createdBy: string | null;
  language: DocumentLanguageMetadata | null;
}

export interface TagSummary {
  id: string;
  name: string;
  color: string | null;
}
