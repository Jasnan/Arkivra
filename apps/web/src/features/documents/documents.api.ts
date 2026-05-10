import { fetchJson } from '@/lib/api';
import type { SearchSortBy } from '@/features/search/search.types';
import type { DeletedDocumentSummary, DocumentDetail, DocumentSummary, TagSummary } from './documents.types';

interface DocumentsResponse {
  documents: DocumentSummary[];
  retentionDays: number;
}

interface DocumentResponse {
  document: DocumentDetail;
}

interface DeletedDocumentsResponse {
  documents: DeletedDocumentSummary[];
  retentionDays: number;
}

interface DocumentTagsResponse {
  tags: TagSummary[];
}

export async function listDocuments({
  vaultId,
  includeDeleted = false,
  tagId,
  sortBy,
  folderId,
}: {
  vaultId: string;
  includeDeleted?: boolean;
  tagId?: string;
  sortBy?: SearchSortBy;
  folderId?: string | null;
}) {
  const params = new URLSearchParams();

  if (includeDeleted) {
    params.set('includeDeleted', 'true');
  }

  if (tagId) {
    params.set('tagId', tagId);
  }

  if (sortBy) {
    params.set('sortBy', sortBy);
  }

  if (folderId !== undefined) {
    params.set('folderId', folderId ?? 'root');
  }

  const query = params.toString();
  const suffix = query ? `?${query}` : '';

  return fetchJson<DocumentsResponse>(`/api/vaults/${vaultId}/documents${suffix}`);
}

export async function getDocument({ vaultId, documentId }: { vaultId: string; documentId: string }) {
  return fetchJson<DocumentResponse>(`/api/vaults/${vaultId}/documents/${documentId}`);
}

export async function listDeletedDocuments() {
  return fetchJson<DeletedDocumentsResponse>('/api/documents/trash');
}

export async function listDocumentTags({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  return fetchJson<DocumentTagsResponse>(`/api/vaults/${vaultId}/documents/${documentId}/tags`);
}

export async function uploadDocument({
  vaultId,
  file,
  folderId,
  relativePath,
}: {
  vaultId: string;
  file: File;
  folderId?: string | null;
  relativePath?: string | null;
}) {
  const formData = new FormData();
  formData.append('file', file);
  if (folderId !== undefined && folderId !== null) {
    formData.append('folderId', folderId);
  }
  if (relativePath !== undefined && relativePath !== null) {
    formData.append('relativePath', relativePath);
  }

  return fetchJson<DocumentResponse>(`/api/vaults/${vaultId}/documents`, {
    method: 'POST',
    body: formData,
  });
}

export async function renameDocument({
  vaultId,
  documentId,
  name,
}: {
  vaultId: string;
  documentId: string;
  name: string;
}) {
  return fetchJson<{ document: { id: string; name: string; updatedAt: string } }>(
    `/api/vaults/${vaultId}/documents/${documentId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
}

export async function updateDocumentDate({
  vaultId,
  documentId,
  documentDate,
}: {
  vaultId: string;
  documentId: string;
  documentDate: string | null;
}) {
  return fetchJson<{ document: { id: string; documentDate: string | null; updatedAt: string } }>(
    `/api/vaults/${vaultId}/documents/${documentId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documentDate }),
    },
  );
}

export async function softDeleteDocument({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/documents/${documentId}`, {
    method: 'DELETE',
  });
}

export async function restoreDocument({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  return fetchJson<{ document: { id: string } }>(`/api/vaults/${vaultId}/documents/${documentId}/restore`, {
    method: 'POST',
  });
}

export async function permanentlyDeleteDocument({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/documents/${documentId}/permanent`, {
    method: 'DELETE',
  });
}

export function getDocumentDownloadUrl({ vaultId, documentId }: { vaultId: string; documentId: string }) {
  return `/api/vaults/${vaultId}/documents/${documentId}/download`;
}

export function getDocumentInlineFileUrl({ vaultId, documentId }: { vaultId: string; documentId: string }) {
  return `/api/vaults/${vaultId}/documents/${documentId}/file`;
}

export function getDocumentPagePreviewUrl({
  vaultId,
  documentId,
  pageNumber,
}: {
  vaultId: string;
  documentId: string;
  pageNumber: number;
}) {
  return `/api/vaults/${vaultId}/documents/${documentId}/page/${pageNumber}`;
}
