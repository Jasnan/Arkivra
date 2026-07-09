import { fetchJson } from "@/lib/api"

export interface BackupListItem {
  id: string
  fileName: string
  size: number
  createdAt: string
  format: "legacy_tar_gz" | "encrypted_multipart"
  partCount: number
  restorable: boolean
  corruptReason: string | null
}

export interface BackupArchiveManifest {
  id: string
  archive: {
    parts: Array<{ fileName: string; index: number; size: number; sha256: string }>
  }
}

export async function listBackups() {
  return fetchJson<{ backups: BackupListItem[] }>("/api/admin/backups")
}

export async function createBackup() {
  return fetchJson<{ jobId: string }>("/api/admin/backups", {
    method: "POST",
  })
}

export async function restoreBackup({ backupId }: { backupId: string }) {
  return fetchJson<{ jobId: string }>("/api/admin/backups/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ backupId }),
  })
}

export function getBackupDownloadUrl({ backupId }: { backupId: string }) {
  return `/api/admin/backups/${encodeURIComponent(backupId)}/download`
}

export function getBackupPartDownloadUrl({
  backupId,
  partFileName,
}: {
  backupId: string
  partFileName: string
}) {
  return `/api/admin/backups/${encodeURIComponent(backupId)}/parts/${encodeURIComponent(partFileName)}/download`
}

export async function importBackupManifest({ manifest }: { manifest: BackupArchiveManifest }) {
  return fetchJson<{ backupId: string; partCount: number }>("/api/admin/backups/imports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manifest }),
  })
}

export async function uploadBackupPart({
  backupId,
  file,
}: {
  backupId: string
  file: File
}) {
  return fetchJson<{ uploaded: true }>(
    `/api/admin/backups/imports/${encodeURIComponent(backupId)}/parts/${encodeURIComponent(file.name)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: file,
    }
  )
}
