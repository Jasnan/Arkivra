export type TransferItemStatus =
  | 'queued'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface UploadSessionSummary {
  id: string;
  vaultId: string;
  userId: string;
  documentId: string | null;
  folderId: string | null;
  relativePath: string | null;
  fileName: string;
  mimeType: string;
  totalSize: number;
  partSize: number;
  partCount: number;
  bytesReceived: number;
  uploadedParts: number[];
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransferItem {
  id: string;
  vaultId: string;
  folderId: string | null;
  relativePath: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  status: TransferItemStatus;
  progress: number;
  bytesUploaded: number;
  uploadedParts: number[];
  partSize: number | null;
  partCount: number | null;
  retries: number;
  error: string | null;
  uploadId: string | null;
  documentId: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface UploadFileInput {
  file: File;
  relativePath?: string | null;
}

export interface TransferState {
  items: TransferItem[];
  activeCount: number;
  queuedCount: number;
  failedCount: number;
  completedCount: number;
  isPaused: boolean;
  hydratedFromStorage: boolean;
}
