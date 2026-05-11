import { fetchJson } from '@/lib/api';
import type { FolderItemsResponse, FolderSummary, FolderTreeResponse } from './file-browser.types';

interface FolderResponse {
  folder: FolderSummary;
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

  return fetchJson<FolderItemsResponse>(`/api/vaults/${vaultId}/folders/items?${params.toString()}`);
}

export async function listFolderTree({ vaultId }: { vaultId: string }) {
  return fetchJson<FolderTreeResponse>(`/api/vaults/${vaultId}/folders/tree`);
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
