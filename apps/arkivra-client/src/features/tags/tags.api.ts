import { fetchJson } from '@/lib/api';
import type { Tag, TagDocument } from './tags.types';

interface TagsResponse {
  tags: Tag[];
}

interface TagDocumentsResponse {
  documents: TagDocument[];
}

export async function listTags() {
  return fetchJson<TagsResponse>('/api/tags');
}

export async function listTagDocuments({ tagId }: { tagId: string }) {
  return fetchJson<TagDocumentsResponse>(`/api/tags/${tagId}/documents`);
}

export async function createTag({
  name,
  color,
  description,
}: {
  name: string;
  color: string | null;
  description?: string | null;
}) {
  return fetchJson<{ tag: Tag }>('/api/tags', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, color, description: description ?? null }),
  });
}

export async function updateTag({
  tagId,
  name,
  color,
  description,
}: {
  tagId: string;
  name: string;
  color: string | null;
  description?: string | null;
}) {
  return fetchJson<{ tag: Tag }>(`/api/tags/${tagId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, color, description: description ?? null }),
  });
}

export async function deleteTag({ tagId }: { tagId: string }) {
  return fetchJson<void>(`/api/tags/${tagId}`, {
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
