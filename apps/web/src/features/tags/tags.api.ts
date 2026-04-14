import { fetchJson } from '@/lib/api';
import type { Tag } from './tags.types';

interface TagsResponse {
  tags: Tag[];
}

export async function listTags({ vaultId }: { vaultId: string }) {
  return fetchJson<TagsResponse>(`/api/vaults/${vaultId}/tags`);
}

export async function createTag({
  vaultId,
  name,
  color,
}: {
  vaultId: string;
  name: string;
  color: string | null;
}) {
  return fetchJson<{ tag: Tag }>(`/api/vaults/${vaultId}/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export async function updateTag({
  vaultId,
  tagId,
  name,
  color,
}: {
  vaultId: string;
  tagId: string;
  name: string;
  color: string | null;
}) {
  return fetchJson<{ tag: Tag }>(`/api/vaults/${vaultId}/tags/${tagId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
}

export async function deleteTag({ vaultId, tagId }: { vaultId: string; tagId: string }) {
  return fetchJson<void>(`/api/vaults/${vaultId}/tags/${tagId}`, {
    method: 'DELETE',
  });
}

export async function assignTagToDocument({
  vaultId,
  documentId,
  tagId,
}: {
  vaultId: string;
  documentId: string;
  tagId: string;
}) {
  return fetchJson<{ tag: Tag }>(`/api/vaults/${vaultId}/documents/${documentId}/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tagId }),
  });
}

export async function removeTagFromDocument({
  vaultId,
  documentId,
  tagId,
}: {
  vaultId: string;
  documentId: string;
  tagId: string;
}) {
  return fetchJson<void>(`/api/vaults/${vaultId}/documents/${documentId}/tags/${tagId}`, {
    method: 'DELETE',
  });
}
