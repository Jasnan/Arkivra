import { fetchJson } from '@/lib/api';
import type { UploadSessionSummary } from './uploads.types';

interface UploadResponse {
  upload: UploadSessionSummary;
}

interface UploadListResponse {
  uploads: UploadSessionSummary[];
}

export async function initUploadSession({
  vaultId,
  fileName,
  mimeType,
  totalSize,
}: {
  vaultId: string;
  fileName: string;
  mimeType: string;
  totalSize: number;
}) {
  return fetchJson<UploadResponse>(`/api/vaults/${vaultId}/uploads/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fileName, mimeType, totalSize }),
  });
}

export async function completeUploadSession({
  vaultId,
  uploadId,
}: {
  vaultId: string;
  uploadId: string;
}) {
  return fetchJson<UploadResponse>(`/api/vaults/${vaultId}/uploads/${uploadId}/complete`, {
    method: 'POST',
  });
}

export async function getUploadSession({
  vaultId,
  uploadId,
}: {
  vaultId: string;
  uploadId: string;
}) {
  return fetchJson<UploadResponse>(`/api/vaults/${vaultId}/uploads/${uploadId}`);
}

export async function listUploadSessions({
  vaultId,
  activeOnly = false,
}: {
  vaultId: string;
  activeOnly?: boolean;
}) {
  const suffix = activeOnly ? '?active=true' : '';
  return fetchJson<UploadListResponse>(`/api/vaults/${vaultId}/uploads${suffix}`);
}

export async function abortUploadSession({
  vaultId,
  uploadId,
}: {
  vaultId: string;
  uploadId: string;
}) {
  return fetchJson<UploadResponse>(`/api/vaults/${vaultId}/uploads/${uploadId}/abort`, {
    method: 'POST',
  });
}
