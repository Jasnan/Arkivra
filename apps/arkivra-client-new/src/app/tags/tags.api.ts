import { fetchJson } from "@/lib/api"

export interface Tag {
  id: string
  name: string
  color: string | null
  description?: string | null
  documentsCount?: number
  createdAt?: string
  updatedAt?: string
}

export interface TagDocument {
  id: string
  vaultId: string
  vaultName: string
  name: string
  originalName: string
  folderId: string | null
  originalSize: number
  mimeType: string
  processingStatus?: string | null
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  deletedAt: string | null
}

export async function listTags() {
  return fetchJson<{ tags: Tag[] }>("/api/tags")
}

export async function listTagDocuments({ tagId }: { tagId: string }) {
  return fetchJson<{ documents: TagDocument[] }>(`/api/tags/${tagId}/documents`)
}

export async function listDocumentTags({
  vaultId,
  documentId,
}: {
  vaultId: string
  documentId: string
}) {
  return fetchJson<{ tags: Tag[] }>(`/api/vaults/${vaultId}/documents/${documentId}/tags`)
}

export async function createTag({
  name,
  color,
  description,
}: {
  name: string
  color: string | null
  description?: string | null
}) {
  return fetchJson<{ tag: Tag }>("/api/tags", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, color, description: description ?? null }),
  })
}

export async function updateTag({
  tagId,
  name,
  color,
  description,
}: {
  tagId: string
  name: string
  color: string | null
  description?: string | null
}) {
  return fetchJson<{ tag: Tag }>(`/api/tags/${tagId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, color, description: description ?? null }),
  })
}

export async function deleteTag({ tagId }: { tagId: string }) {
  return fetchJson<void>(`/api/tags/${tagId}`, {
    method: "DELETE",
  })
}

export async function assignTagToDocument({
  vaultId,
  documentId,
  tagId,
}: {
  vaultId: string
  documentId: string
  tagId: string
}) {
  return fetchJson<{ tag: Tag }>(`/api/vaults/${vaultId}/documents/${documentId}/tags`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tagId }),
  })
}

export async function removeTagFromDocument({
  vaultId,
  documentId,
  tagId,
}: {
  vaultId: string
  documentId: string
  tagId: string
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/documents/${documentId}/tags/${tagId}`, {
    method: "DELETE",
  })
}
