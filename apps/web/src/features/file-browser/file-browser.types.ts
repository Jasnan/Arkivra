import type { DocumentSummary } from '@/features/documents/documents.types';

export interface FolderSummary {
  id: string;
  vaultId: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FolderBreadcrumb {
  id: string;
  parentId: string | null;
  name: string;
}

export interface FolderTreeEntry extends FolderBreadcrumb {
  path: string;
  depth: number;
}

export type FileBrowserItem =
  | { type: 'folder'; folder: FolderSummary }
  | { type: 'document'; document: DocumentSummary };

export interface FolderItemsResponse {
  folder: FolderSummary | null;
  breadcrumbs: FolderBreadcrumb[];
  folders: FolderSummary[];
  documents: DocumentSummary[];
  items: FileBrowserItem[];
}

export interface FolderTreeResponse {
  folders: FolderTreeEntry[];
}
