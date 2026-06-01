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

export interface DocumentChunkSummary {
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
  createdAt: string;
}

export interface TagSummary {
  id: string;
  name: string;
  color: string | null;
}
