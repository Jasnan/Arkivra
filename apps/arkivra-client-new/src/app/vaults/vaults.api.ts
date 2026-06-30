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
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  deletedAt: string | null
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
