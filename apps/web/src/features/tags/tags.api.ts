import { fetchJson } from '@/lib/api';
import type { Tag } from './tags.types';

interface TagsResponse {
  tags: Tag[];
}

export async function listAccessibleTags({ vaultId }: { vaultId?: string } = {}) {
  const params = new URLSearchParams();

  if (vaultId) {
    params.set('vaultId', vaultId);
  }

  const suffix = params.toString().length > 0 ? `?${params.toString()}` : '';

  return fetchJson<TagsResponse>(`/api/tags${suffix}`);
}

export async function listTags({ vaultId }: { vaultId: string }) {
  return fetchJson<TagsResponse>(`/api/vaults/${vaultId}/tags`);
}

export async function createTag({
  vaultId,
  name,
  color,
  description,
}: {
  vaultId: string;
  name: string;
  color: string | null;
  description?: string | null;
}) {
  return fetchJson<{ tag: Tag }>(`/api/vaults/${vaultId}/tags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, color, description: description ?? null }),
  });
}

export async function updateTag({
  vaultId,
  tagId,
  name,
  color,
  description,
}: {
  vaultId: string;
  tagId: string;
  name: string;
  color: string | null;
  description?: string | null;
}) {
  return fetchJson<{ tag: Tag }>(`/api/vaults/${vaultId}/tags/${tagId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, color, description: description ?? null }),
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
