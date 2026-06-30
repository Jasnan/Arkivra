import { ApiError, fetchJson } from "@/lib/api"

type UploadSessionStatus =
  | "initialized"
  | "uploading"
  | "paused"
  | "completed"
  | "failed"
  | "aborted"

interface ApiErrorResponse {
  error?: {
    code?: unknown
    message?: unknown
  }
}

export interface UploadSessionSummary {
  id: string
  vaultId: string
  userId: string
  documentId: string | null
  documentVersionId: string | null
  folderId: string | null
  relativePath: string | null
  fileName: string
  mimeType: string
  totalSize: number
  partSize: number
  partCount: number
  bytesReceived: number
  uploadedParts: number[]
  status: UploadSessionStatus
  errorCode: string | null
  errorMessage: string | null
  expiresAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

interface UploadResponse {
  upload: UploadSessionSummary
}

export async function initUploadSession({
  vaultId,
  folderId,
  relativePath,
  fileName,
  mimeType,
  totalSize,
}: {
  vaultId: string
  folderId?: string | null
  relativePath?: string | null
  fileName: string
  mimeType: string
  totalSize: number
}) {
  return fetchJson<UploadResponse>(`/api/vaults/${vaultId}/uploads/init`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName, mimeType, totalSize, folderId, relativePath }),
  })
}

export async function uploadPart({
  vaultId,
  uploadId,
  partNumber,
  chunk,
}: {
  vaultId: string
  uploadId: string
  partNumber: number
  chunk: Blob
}) {
  const response = await fetch(`/api/vaults/${vaultId}/uploads/${uploadId}/parts/${partNumber}`, {
    method: "PUT",
    credentials: "include",
    body: chunk,
  })

  if (!response.ok) {
    let message = `Part upload failed with status ${response.status}`
    let code: string | undefined

    try {
      const json = (await response.json()) as ApiErrorResponse
      if (typeof json.error?.message === "string") {
        message = json.error.message
      }
      if (typeof json.error?.code === "string") {
        code = json.error.code
      }
    } catch {
      // Preserve the status-derived fallback message when the body is not JSON.
    }

    throw new ApiError(message, response.status, code)
  }

  return response.json() as Promise<UploadResponse>
}

export async function completeUploadSession({
  vaultId,
  uploadId,
}: {
  vaultId: string
  uploadId: string
}) {
  return fetchJson<UploadResponse>(`/api/vaults/${vaultId}/uploads/${uploadId}/complete`, {
    method: "POST",
  })
}
