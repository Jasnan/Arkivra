export interface Tag {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
  documentsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TagDocument {
  id: string;
  vaultId: string;
  vaultName: string;
  name: string;
  originalName: string;
  folderId: string | null;
  originalSize: number;
  mimeType: string;
  processingStatus?: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
}
