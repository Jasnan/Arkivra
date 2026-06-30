import { fetchJson } from "@/lib/api"

interface PermissionRequest {
  id: string
}

interface PermissionRequestResponse {
  request: PermissionRequest
}

export type VaultRole = "owner" | "editor" | "viewer"
export type AiAccessLevel = "none" | "full"

export interface VaultSummary {
  id: string
  name: string
  description: string | null
  fileCount: number
  totalSize: number
  createdAt: string
  updatedAt?: string
  role: VaultRole | null
  aiAccessLevel: AiAccessLevel
  isAdmin: boolean
  isMember: boolean
  accessMode: "member" | "admin"
}

export interface VaultDetail {
  id: string
  name: string
  description: string | null
  fileCount?: number
  totalSize?: number
  createdAt?: string
  role?: VaultRole | null
  aiAccessLevel?: AiAccessLevel
  isAdmin?: boolean
  isMember?: boolean
  accessMode?: "member" | "admin"
}

interface VaultsListResponse {
  vaults: VaultSummary[]
}

interface VaultDetailResponse {
  vault: VaultDetail
}

interface MeResponse {
  canCreateVault: boolean
  aiFeaturesEnabled?: boolean
}

export interface DocumentSummary {
  id: string
  name: string
  originalName: string
  folderId: string | null
  originalSize: number
  mimeType: string
  processingStatus?:
    | "pending"
    | "queued"
    | "partitioning"
    | "chunking"
    | "summarising"
    | "completed"
    | "failed"
    | "processing"
  processingErrorCode?: string | null
  processingErrorMessage?: string | null
  processingFailedAt?: string | null
  hasPreviewPdf?: boolean
  derivedPreviewStatus?: "pending" | "ready" | "unavailable" | "failed"
  derivedPreviewErrorCode?: string | null
  derivedPreviewErrorMessage?: string | null
  derivedPreviewFailedAt?: string | null
  language?: DocumentLanguageMetadata | null
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  deletedAt: string | null
}

export interface DocumentLanguageMetadata {
  code: string
  name: string
  confidence?: number | null
  source: "docling" | "heuristic" | "user"
}

export type DocumentSemanticIndexStatus =
  | "pending"
  | "indexing"
  | "ready"
  | "failed"
  | "stale"
  | "skipped"

export interface DocumentSemanticIndexSummary {
  documentStatus: DocumentSemanticIndexStatus | null
  expectedChunkCount: number
  embeddedChunkCount: number
  indexedAt: string | null
  updatedAt: string | null
}

export interface DocumentDetail extends DocumentSummary {
  originalSha256Hash: string
  content: string
  displayContent?: string
  createdBy: string | null
  language: DocumentLanguageMetadata | null
  semanticIndex: DocumentSemanticIndexSummary | null
}

export interface DocumentVersionSummary {
  id: string
  documentId: string
  vaultId: string
  versionNumber: number
  isCurrent: boolean
  uploadedBy: string | null
  uploadedAt: string
  originalName: string
  originalSize: number
  originalSha256Hash: string
  mimeType: string
  language: DocumentLanguageMetadata | null
  parserEngine: string | null
  parserEngineVersion: string | null
  parserWarnings: string[] | null
  processingStatus: DocumentSummary["processingStatus"]
  processingErrorCode?: string | null
  processingErrorMessage?: string | null
  processingFailedAt?: string | null
  hasPreviewPdf?: boolean
  derivedPreviewStatus?: "pending" | "ready" | "unavailable" | "failed"
  derivedPreviewErrorCode?: string | null
  derivedPreviewErrorMessage?: string | null
  derivedPreviewFailedAt?: string | null
  restoredFromVersionId: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentVersionDetail extends DocumentVersionSummary {
  content: string
  rawText: string
  rawMarkdown: string
  parserStructuredOutput: Record<string, unknown> | null
}

export interface DocumentChunkSummary {
  id: string
  chunkIndex: number
  content: string
  originalText: string | null
  section: string | null
  sectionPath: string[] | null
  pageNumber: number | null
  pageStart: number | null
  pageEnd: number | null
  chunkType: string | null
  tokenCount: number | null
  parserEngine: string | null
  citationPrecision: string
  sourceElementIds: string[] | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface FolderSummary {
  id: string
  vaultId: string
  parentId: string | null
  name: string
  createdBy: string | null
  isDeleted: boolean
  deletedAt: string | null
  deletedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface FolderBreadcrumb {
  id: string
  parentId: string | null
  name: string
}

export interface FolderTreeEntry extends FolderBreadcrumb {
  path: string
  depth: number
}

export interface FolderTreeDocumentEntry extends DocumentSummary {
  path: string
  depth: number
}

export type FileBrowserItem =
  | { type: "folder"; folder: FolderSummary }
  | { type: "document"; document: DocumentSummary }

interface FolderItemsResponse {
  folder: FolderSummary | null
  breadcrumbs: FolderBreadcrumb[]
  folders: FolderSummary[]
  documents: DocumentSummary[]
  items: FileBrowserItem[]
}

interface FolderTreeResponse {
  folders: FolderTreeEntry[]
  documents: FolderTreeDocumentEntry[]
}

interface FolderResponse {
  folder: FolderSummary
}

interface DocumentResponse {
  document: DocumentDetail
}

interface DocumentChunksResponse {
  chunks: DocumentChunkSummary[]
}

interface DocumentVersionsResponse {
  versions: DocumentVersionSummary[]
}

interface DocumentVersionResponse {
  version: DocumentVersionDetail
}

interface VersionDeletionImpactResponse {
  impact: DeletionImpactPreview
}

export interface DeletionImpactConversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface DeletionImpactPreview {
  affectedConversationCount: number
  affectedConversations: DeletionImpactConversation[]
  limit: number
}

export function isPermissionRequestResponse(
  value: unknown
): value is PermissionRequestResponse {
  return typeof value === "object" && value !== null && "request" in value
}

export async function getMe() {
  return fetchJson<MeResponse>("/api/me")
}

export async function listVaults() {
  return fetchJson<VaultsListResponse>("/api/vaults")
}

export async function getVault({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultDetailResponse>(`/api/vaults/${vaultId}`)
}

export async function listFolderItems({
  vaultId,
  folderId,
}: {
  vaultId: string
  folderId: string | null
}) {
  const params = new URLSearchParams()
  params.set("folderId", folderId ?? "root")

  return fetchJson<FolderItemsResponse>(
    `/api/vaults/${vaultId}/folders/items?${params.toString()}`
  )
}

export async function listFolderTree({ vaultId }: { vaultId: string }) {
  return fetchJson<FolderTreeResponse>(`/api/vaults/${vaultId}/folders/tree`)
}

export async function createVault({
  name,
  description,
}: {
  name: string
  description: string | null
}) {
  return fetchJson<VaultDetailResponse | PermissionRequestResponse>("/api/vaults", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, description }),
  })
}

export async function createFolder({
  vaultId,
  parentId,
  name,
}: {
  vaultId: string
  parentId: string | null
  name: string
}) {
  return fetchJson<FolderResponse>(`/api/vaults/${vaultId}/folders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parentId, name }),
  })
}

export async function moveDocument({
  vaultId,
  documentId,
  folderId,
}: {
  vaultId: string
  documentId: string
  folderId: string | null
}) {
  return fetchJson<{ document: { id: string; folderId: string | null; updatedAt: string } }>(
    `/api/vaults/${vaultId}/documents/${documentId}/move`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId }),
    }
  )
}

export async function renameDocument({
  vaultId,
  documentId,
  name,
}: {
  vaultId: string
  documentId: string
  name: string
}) {
  return fetchJson<{ document: { id: string; name: string; updatedAt: string } }>(
    `/api/vaults/${vaultId}/documents/${documentId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }
  )
}

export async function updateDocumentLanguage({
  vaultId,
  documentId,
  language,
}: {
  vaultId: string
  documentId: string
  language: string | null
}) {
  return fetchJson<{
    document: { id: string; language: DocumentLanguageMetadata | null; updatedAt: string }
  }>(`/api/vaults/${vaultId}/documents/${documentId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ language }),
  })
}

export async function moveFolder({
  vaultId,
  folderId,
  parentId,
}: {
  vaultId: string
  folderId: string
  parentId: string | null
}) {
  return fetchJson<FolderResponse>(`/api/vaults/${vaultId}/folders/${folderId}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parentId }),
  })
}

export async function softDeleteFolder({
  vaultId,
  folderId,
}: {
  vaultId: string
  folderId: string
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/folders/${folderId}`, {
    method: "DELETE",
  })
}

export async function getDocument({
  vaultId,
  documentId,
}: {
  vaultId: string
  documentId: string
}) {
  return fetchJson<DocumentResponse>(`/api/vaults/${vaultId}/documents/${documentId}`)
}

export async function listDocumentChunks({
  vaultId,
  documentId,
}: {
  vaultId: string
  documentId: string
}) {
  return fetchJson<DocumentChunksResponse>(`/api/vaults/${vaultId}/documents/${documentId}/chunks`)
}

export async function listDocumentVersions({
  vaultId,
  documentId,
}: {
  vaultId: string
  documentId: string
}) {
  return fetchJson<DocumentVersionsResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions`
  )
}

export async function getDocumentVersion({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string
  documentId: string
  versionId: string
}) {
  return fetchJson<DocumentVersionResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}`
  )
}

export async function listDocumentVersionChunks({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string
  documentId: string
  versionId: string
}) {
  return fetchJson<DocumentChunksResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}/chunks`
  )
}

export async function softDeleteDocument({
  vaultId,
  documentId,
}: {
  vaultId: string
  documentId: string
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/documents/${documentId}`, {
    method: "DELETE",
  })
}

export async function restoreDocumentVersion({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string
  documentId: string
  versionId: string
}) {
  return fetchJson<DocumentVersionResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}/restore`,
    {
      method: "POST",
    }
  )
}

export async function deleteDocumentVersion({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string
  documentId: string
  versionId: string
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}`, {
    method: "DELETE",
  })
}

export async function getDocumentVersionDeletionImpact({
  vaultId,
  documentId,
  versionId,
  limit,
}: {
  vaultId: string
  documentId: string
  versionId: string
  limit?: number
}) {
  const params = new URLSearchParams()

  if (limit !== undefined) {
    params.set("limit", String(limit))
  }

  const suffix = params.toString().length > 0 ? `?${params.toString()}` : ""

  return fetchJson<VersionDeletionImpactResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}/deletion-impact${suffix}`
  )
}

export function getDocumentDownloadUrl({
  vaultId,
  documentId,
}: {
  vaultId: string
  documentId: string
}) {
  return `/api/vaults/${vaultId}/documents/${documentId}/download`
}

export function getDocumentVersionDownloadUrl({
  vaultId,
  documentId,
  versionId,
}: {
  vaultId: string
  documentId: string
  versionId: string
}) {
  return `/api/vaults/${vaultId}/documents/${documentId}/versions/${versionId}/download`
}

export function getDocumentInlineFileUrl({
  vaultId,
  documentId,
}: {
  vaultId: string
  documentId: string
}) {
  return `/api/vaults/${vaultId}/documents/${documentId}/file`
}
