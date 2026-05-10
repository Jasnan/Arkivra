import { fetchJson } from '@/lib/api';
import type { FolderItemsResponse, FolderSummary } from './file-browser.types';

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
