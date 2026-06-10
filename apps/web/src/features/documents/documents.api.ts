import { ApiError, fetchJson } from '@/lib/api';
import type { SearchSortBy } from '@/features/search/search.types';
import type {
  DocumentChunkSummary,
  DeletedDocumentSummary,
  DeletionImpactPreview,
  BulkDocumentDeletionImpactPreview,
  DocumentDetail,
  DocumentDeletionImpactPreview,
  DocumentLanguageMetadata,
  DocumentSummary,
  DocumentVersionDetail,
  DocumentVersionSummary,
  TagSummary,
} from './documents.types';

export type UploadConflictStrategy = 'skip' | 'keep_both' | 'new_version';

export type DocumentTranslationLanguage = 'de' | 'en';

export type DocumentTranslationSource =
  | {
      type: 'page-image';
      pageNumber: number;
      imageBase64: string;
      mimeType: 'image/png';
    }
  | {
      type: 'area-image';
      pageNumber: number;
      imageBase64: string;
      mimeType: 'image/png';
      rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }
  | {
      type: 'text';
      pageNumber?: number;
      text: string;
    };

export interface DocumentTranslation {
  targetLanguage: DocumentTranslationLanguage;
  text: string;
  provider: string;
  model: string;
  sourceType: DocumentTranslationSource['type'];
}

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

interface DocumentChunksResponse {
  chunks: DocumentChunkSummary[];
}

interface DocumentVersionsResponse {
  versions: DocumentVersionSummary[];
}

interface DocumentVersionResponse {
  version: DocumentVersionDetail;
}

interface VersionDeletionImpactResponse {
  impact: DeletionImpactPreview;
}

interface DocumentDeletionImpactResponse {
  impact: DocumentDeletionImpactPreview;
}

interface BulkDocumentDeletionImpactResponse {
  impact: BulkDocumentDeletionImpactPreview;
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

export async function getDocument({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  return fetchJson<DocumentResponse>(`/api/vaults/${vaultId}/documents/${documentId}`);
}

export async function listDocumentChunks({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  return fetchJson<DocumentChunksResponse>(`/api/vaults/${vaultId}/documents/${documentId}/chunks`);
}

export async function listDocumentVersions({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  return fetchJson<DocumentVersionsResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions`,
  );
}

export async function getDocumentVersion({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string;
  documentId: string;
  versionId: string;
}) {
  return fetchJson<DocumentVersionResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}`,
  );
}

export async function listDocumentVersionChunks({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string;
  documentId: string;
  versionId: string;
}) {
  return fetchJson<DocumentChunksResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}/chunks`,
  );
}

export async function listDeletedDocuments({ vaultId }: { vaultId?: string } = {}) {
  const params = new URLSearchParams();

  if (vaultId) {
    params.set('vaultId', vaultId);
  }

  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';

  return fetchJson<DeletedDocumentsResponse>(`/api/trash${suffix}`);
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
  conflictStrategy,
}: {
  vaultId: string;
  file: File;
  folderId?: string | null;
  relativePath?: string | null;
  conflictStrategy?: UploadConflictStrategy;
}) {
  const formData = new FormData();
  formData.append('file', file);
  if (folderId !== undefined && folderId !== null) {
    formData.append('folderId', folderId);
  }
  if (relativePath !== undefined && relativePath !== null) {
    formData.append('relativePath', relativePath);
  }
  if (conflictStrategy !== undefined) {
    formData.append('conflictStrategy', conflictStrategy);
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

export async function moveDocument({
  vaultId,
  documentId,
  folderId,
}: {
  vaultId: string;
  documentId: string;
  folderId: string | null;
}) {
  return fetchJson<{ document: { id: string; folderId: string | null; updatedAt: string } }>(
    `/api/vaults/${vaultId}/documents/${documentId}/move`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folderId }),
    },
  );
}

export async function updateDocumentLanguage({
  vaultId,
  documentId,
  language,
}: {
  vaultId: string;
  documentId: string;
  language: string | null;
}) {
  return fetchJson<{
    document: { id: string; language: DocumentLanguageMetadata | null; updatedAt: string };
  }>(`/api/vaults/${vaultId}/documents/${documentId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ language }),
  });
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
  return fetchJson<{
    document: { id: string; folderId: string | null; originalName: string };
    message: string;
  }>(`/api/vaults/${vaultId}/documents/${documentId}/restore`, {
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

export async function restoreDocumentVersion({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string;
  documentId: string;
  versionId: string;
}) {
  return fetchJson<DocumentVersionResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}/restore`,
    {
      method: 'POST',
    },
  );
}

export async function deleteDocumentVersion({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string;
  documentId: string;
  versionId: string;
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}`, {
    method: 'DELETE',
  });
}

export async function getDocumentVersionDeletionImpact({
  vaultId,
  documentId,
  versionId,
  limit,
}: {
  vaultId: string;
  documentId: string;
  versionId: string;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (limit !== undefined) {
    params.set('limit', String(limit));
  }

  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';

  return fetchJson<VersionDeletionImpactResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}/deletion-impact${suffix}`,
  );
}

export async function getDocumentDeletionImpact({
  vaultId,
  documentId,
  includeDeleted = false,
  limit,
}: {
  vaultId: string;
  documentId: string;
  includeDeleted?: boolean;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (includeDeleted) {
    params.set('includeDeleted', 'true');
  }
  if (limit !== undefined) {
    params.set('limit', String(limit));
  }

  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';

  return fetchJson<DocumentDeletionImpactResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/deletion-impact${suffix}`,
  );
}

export async function getBulkDocumentDeletionImpact({
  documents,
  includeDeleted = false,
}: {
  documents: Array<{ vaultId: string; documentId: string }>;
  includeDeleted?: boolean;
}) {
  return fetchJson<BulkDocumentDeletionImpactResponse>('/api/documents/deletion-impact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documents, includeDeleted }),
  });
}

export function getDocumentDownloadUrl({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  return `/api/vaults/${vaultId}/documents/${documentId}/download`;
}

export function getDocumentVersionDownloadUrl({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string;
  documentId: string;
  versionId: string;
}) {
  return `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}/download`;
}

export function getDocumentInlineFileUrl({
  vaultId,
  documentId,
  includeDeleted = false,
}: {
  vaultId: string;
  documentId: string;
  includeDeleted?: boolean;
}) {
  const suffix = includeDeleted ? '?includeDeleted=true' : '';
  return `/api/vaults/${vaultId}/documents/${documentId}/file${suffix}`;
}

export async function getDocumentFileText({
  vaultId,
  documentId,
  includeDeleted = false,
}: {
  vaultId: string;
  documentId: string;
  includeDeleted?: boolean;
}) {
  const response = await fetch(getDocumentInlineFileUrl({ vaultId, documentId, includeDeleted }), {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  return response.text();
}

export async function translateDocument({
  vaultId,
  documentId,
  targetLanguage,
  source,
  signal,
}: {
  vaultId: string;
  documentId: string;
  targetLanguage: DocumentTranslationLanguage;
  source: DocumentTranslationSource;
  signal?: AbortSignal;
}) {
  return fetchJson<{ translation: DocumentTranslation }>(
    `/api/vaults/${vaultId}/documents/${documentId}/translations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetLanguage, source }),
      signal,
    },
  );
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
