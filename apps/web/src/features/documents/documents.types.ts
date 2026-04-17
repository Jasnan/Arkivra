export interface DocumentSummary {
  id: string;
  name: string;
  originalName: string;
  originalSize: number;
  mimeType: string;
  documentDate: string | null;
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
  createdBy: string | null;
}

export interface TagSummary {
  id: string;
  name: string;
  color: string | null;
}
