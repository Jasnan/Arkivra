import { ApiError, fetchJson } from '@/lib/api';

export type VaultRole = 'owner' | 'editor' | 'viewer';
export type PermissionRequestType =
  | 'vault.create'
  | 'vault.delete'
  | 'vault.owner_promote'
  | 'vault.external_invite';
export type PermissionRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type EmailInvitationType = 'admin_account' | 'vault_member';
export type EmailInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

interface PermissionRequest {
  id: string;
  type?: PermissionRequestType;
  status?: PermissionRequestStatus;
  requestedBy?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  vaultId?: string | null;
  targetUserId?: string | null;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

interface PermissionRequestResponse {
  request: PermissionRequest;
}

export type UploadConflictStrategy = 'skip' | 'keep_both' | 'new_version';

export interface DocumentDuplicateConflict {
  message: string;
  existingId: string | null;
  conflictType: string;
  availableStrategies: UploadConflictStrategy[];
}

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

export interface VaultSummary {
  id: string;
  name: string;
  description: string | null;
  fileCount: number;
  totalSize: number;
  createdAt: string;
  updatedAt?: string;
  role: VaultRole | null;
  isAdmin: boolean;
  isMember: boolean;
  accessMode?: 'member' | 'admin';
}

export interface VaultDetail {
  id: string;
  name: string;
  description: string | null;
  fileCount?: number;
  totalSize?: number;
  createdAt?: string;
  role?: VaultRole | null;
  isAdmin?: boolean;
  isMember?: boolean;
  accessMode?: 'member' | 'admin';
}

export interface VaultMember {
  userId: string;
  role: VaultRole;
  email: string;
  name: string | null;
}

export interface VaultPendingInvitation {
  id: string;
  source: 'email_invitation' | 'permission_request';
  status: 'pending' | 'approval_pending';
  requestType?: PermissionRequestType;
  email: string;
  name?: string | null;
  targetUserId?: string | null;
  role: VaultRole;
  requestedBy: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailInvitation {
  id: string;
  type: EmailInvitationType;
  status: EmailInvitationStatus;
  email: string;
  invitedBy: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  vaultId: string | null;
  vaultMemberId: string | null;
  vaultRole: VaultRole | null;
  systemRole: 'admin' | 'member' | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface VaultsListResponse {
  vaults: VaultSummary[];
}

interface VaultDetailResponse {
  vault: VaultDetail;
}

interface VaultMembersResponse {
  members: VaultMember[];
}

interface VaultPendingInvitationsResponse {
  invitations: VaultPendingInvitation[];
}

interface MeResponse {
  userId?: string;
  canCreateVault: boolean;
  canUseAI?: boolean;
  aiFeaturesEnabled?: boolean;
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
  processingErrorCode?: string | null;
  processingErrorMessage?: string | null;
  processingFailedAt?: string | null;
  hasPreviewPdf?: boolean;
  derivedPreviewStatus?: 'pending' | 'ready' | 'unavailable' | 'failed';
  derivedPreviewErrorCode?: string | null;
  derivedPreviewErrorMessage?: string | null;
  derivedPreviewFailedAt?: string | null;
  language?: DocumentLanguageMetadata | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
  tags?: DocumentTagSummary[];
}

export interface DeletedDocumentSummary extends DocumentSummary {
  vaultId: string;
  vaultName: string;
}

export interface DocumentLanguageMetadata {
  code: string;
  name: string;
  confidence?: number | null;
  source: 'docling' | 'heuristic' | 'user';
}

export interface DocumentTagSummary {
  id: string;
  name: string;
  color: string | null;
}

export type DocumentSemanticIndexStatus =
  | 'pending'
  | 'indexing'
  | 'ready'
  | 'failed'
  | 'stale'
  | 'skipped';

export interface DocumentSemanticIndexSummary {
  documentStatus: DocumentSemanticIndexStatus | null;
  expectedChunkCount: number;
  embeddedChunkCount: number;
  indexedAt: string | null;
  updatedAt: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  originalSha256Hash: string;
  content: string;
  displayContent?: string;
  createdBy: string | null;
  language: DocumentLanguageMetadata | null;
  semanticIndex: DocumentSemanticIndexSummary | null;
}

export interface DocumentVersionSummary {
  id: string;
  documentId: string;
  vaultId: string;
  versionNumber: number;
  isCurrent: boolean;
  uploadedBy: string | null;
  uploadedAt: string;
  originalName: string;
  originalSize: number;
  originalSha256Hash: string;
  mimeType: string;
  language: DocumentLanguageMetadata | null;
  parserEngine: string | null;
  parserEngineVersion: string | null;
  parserWarnings: string[] | null;
  processingStatus: DocumentSummary['processingStatus'];
  processingErrorCode?: string | null;
  processingErrorMessage?: string | null;
  processingFailedAt?: string | null;
  hasPreviewPdf?: boolean;
  derivedPreviewStatus?: 'pending' | 'ready' | 'unavailable' | 'failed';
  derivedPreviewErrorCode?: string | null;
  derivedPreviewErrorMessage?: string | null;
  derivedPreviewFailedAt?: string | null;
  restoredFromVersionId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersionDetail extends DocumentVersionSummary {
  content: string;
  rawText: string;
  rawMarkdown: string;
  parserStructuredOutput: Record<string, unknown> | null;
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

export interface FolderTreeDocumentEntry extends DocumentSummary {
  path: string;
  depth: number;
}

export type FileBrowserItem =
  | { type: 'folder'; folder: FolderSummary }
  | { type: 'document'; document: DocumentSummary };

interface FolderItemsResponse {
  folder: FolderSummary | null;
  breadcrumbs: FolderBreadcrumb[];
  folders: FolderSummary[];
  documents: DocumentSummary[];
  items: FileBrowserItem[];
}

interface FolderTreeResponse {
  folders: FolderTreeEntry[];
  documents: FolderTreeDocumentEntry[];
}

interface FolderResponse {
  folder: FolderSummary;
}

interface DocumentResponse {
  document: DocumentDetail;
}

interface DeletedDocumentsResponse {
  documents: DeletedDocumentSummary[];
  retentionDays: number;
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

export interface DeletionImpactConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeletionImpactPreview {
  affectedConversationCount: number;
  affectedConversations: DeletionImpactConversation[];
  limit: number;
}

export interface DocumentDeletionImpactPreview extends DeletionImpactPreview {
  versionCount: number;
}

export interface BulkDocumentDeletionImpactPreview {
  documentCount: number;
  versionCount: number;
  affectedConversationCount: number;
}

export interface ActivityFeedItem {
  id: string;
  occurredAt: string;
  activityType: string;
  entityType: string;
  entityId: string;
  actorDisplayName: string;
  summary: string;
  metadata: Record<string, unknown>;
  resource?: {
    vaultName?: string | null;
    documentName?: string | null;
    documentPath?: string | null;
    targetName?: string | null;
  };
}

interface PaginatedActivityResponse {
  activity: ActivityFeedItem[];
  nextCursor: string | null;
}

export function isPermissionRequestResponse(value: unknown): value is PermissionRequestResponse {
  return typeof value === 'object' && value !== null && 'request' in value;
}

export async function getMe() {
  return fetchJson<MeResponse>('/api/me');
}

export async function listVaults() {
  return fetchJson<VaultsListResponse>('/api/vaults');
}

export async function getVault({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultDetailResponse>(`/api/vaults/${vaultId}`);
}

export async function renameVault({
  vaultId,
  name,
  description,
}: {
  vaultId: string;
  name: string;
  description: string | null;
}) {
  return fetchJson<VaultDetailResponse>(`/api/vaults/${vaultId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteVault({ vaultId }: { vaultId: string }) {
  return fetchJson<void | PermissionRequestResponse>(`/api/vaults/${vaultId}`, {
    method: 'DELETE',
  });
}

export async function listVaultMembers({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultMembersResponse>(`/api/vaults/${vaultId}/members`);
}

export async function listVaultPendingInvitations({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultPendingInvitationsResponse>(`/api/vaults/${vaultId}/invitations`);
}

export async function addVaultMember({
  vaultId,
  userId,
  role,
}: {
  vaultId: string;
  userId: string;
  role: VaultRole;
}) {
  return fetchJson<{ member: VaultMember } | PermissionRequestResponse>(
    `/api/vaults/${vaultId}/members`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    },
  );
}

export async function updateVaultMember({
  vaultId,
  memberUserId,
  role,
}: {
  vaultId: string;
  memberUserId: string;
  role: VaultRole;
}) {
  return fetchJson<{ member: VaultMember } | PermissionRequestResponse>(
    `/api/vaults/${vaultId}/members/${memberUserId}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
}

export async function removeVaultMember({
  vaultId,
  memberUserId,
}: {
  vaultId: string;
  memberUserId: string;
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/members/${memberUserId}`, {
    method: 'DELETE',
  });
}

export async function createVaultEmailInvitation({
  vaultId,
  email,
  role,
  expiresAt,
}: {
  vaultId: string;
  email: string;
  role: VaultRole;
  expiresAt?: string | null;
}) {
  return fetchJson<{ invitation: EmailInvitation } | PermissionRequestResponse>(
    `/api/vaults/${vaultId}/email-invitations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role, expiresAt: expiresAt ?? null }),
    },
  );
}

export async function getVaultActivity({
  vaultId,
  cursor,
  limit = 50,
}: {
  vaultId: string;
  cursor?: string | null;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit !== undefined) params.set('limit', String(limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';

  return fetchJson<PaginatedActivityResponse>(`/api/vaults/${vaultId}/activity${suffix}`);
}

export async function listFolderItems({
  vaultId,
  folderId,
}: {
  vaultId: string;
  folderId: string | null;
}) {
  const params = new URLSearchParams();
  params.set('folderId', folderId ?? 'root');

  return fetchJson<FolderItemsResponse>(
    `/api/vaults/${vaultId}/folders/items?${params.toString()}`,
  );
}

export async function listFolderTree({ vaultId }: { vaultId: string }) {
  return fetchJson<FolderTreeResponse>(`/api/vaults/${vaultId}/folders/tree`);
}

export async function createVault({
  name,
  description,
}: {
  name: string;
  description: string | null;
}) {
  return fetchJson<VaultDetailResponse | PermissionRequestResponse>('/api/vaults', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function createFolder({
  vaultId,
  parentId,
  name,
}: {
  vaultId: string;
  parentId: string | null;
  name: string;
}) {
  return fetchJson<FolderResponse>(`/api/vaults/${vaultId}/folders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentId, name }),
  });
}

export async function renameFolder({
  vaultId,
  folderId,
  name,
}: {
  vaultId: string;
  folderId: string;
  name: string;
}) {
  return fetchJson<FolderResponse>(`/api/vaults/${vaultId}/folders/${folderId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
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

export async function moveFolder({
  vaultId,
  folderId,
  parentId,
}: {
  vaultId: string;
  folderId: string;
  parentId: string | null;
}) {
  return fetchJson<FolderResponse>(`/api/vaults/${vaultId}/folders/${folderId}/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentId }),
  });
}

export async function softDeleteFolder({
  vaultId,
  folderId,
}: {
  vaultId: string;
  folderId: string;
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/folders/${folderId}`, {
    method: 'DELETE',
  });
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

export async function listDeletedDocuments({ vaultId }: { vaultId?: string } = {}) {
  const params = new URLSearchParams();

  if (vaultId) {
    params.set('vaultId', vaultId);
  }

  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';

  return fetchJson<DeletedDocumentsResponse>(`/api/trash${suffix}`);
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
  conflictStrategy,
}: {
  vaultId: string;
  documentId: string;
  conflictStrategy?: UploadConflictStrategy;
}) {
  return fetchJson<{
    document: { id: string; folderId: string | null; originalName: string } | null;
    message?: string;
    skipped?: boolean;
    existingId?: string | null;
    conflictType?: string;
  }>(`/api/vaults/${vaultId}/documents/${documentId}/restore`, {
    method: 'POST',
    ...(conflictStrategy === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ conflictStrategy }),
        }),
  });
}

function isUploadConflictStrategy(value: unknown): value is UploadConflictStrategy {
  return value === 'skip' || value === 'keep_both' || value === 'new_version';
}

export function getDocumentDuplicateConflict(error: unknown): DocumentDuplicateConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null;
  }

  if (error.code !== 'document.duplicate' && error.code !== 'document.name_conflict') {
    return null;
  }

  const details = error.details ?? {};
  const availableStrategies = Array.isArray(details.availableStrategies)
    ? details.availableStrategies.filter(isUploadConflictStrategy)
    : [];

  return {
    message: error.message,
    existingId: typeof details.existingId === 'string' ? details.existingId : null,
    conflictType: typeof details.conflictType === 'string' ? details.conflictType : 'hash',
    availableStrategies,
  };
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
  includeDeleted = false,
}: {
  vaultId: string;
  documentId: string;
  includeDeleted?: boolean;
}) {
  const suffix = includeDeleted ? '?includeDeleted=true' : '';
  return `/api/vaults/${vaultId}/documents/${documentId}/download${suffix}`;
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
