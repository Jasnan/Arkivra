import { fetchJson } from '@/lib/api';
import type { SearchResultPage } from './search.types';

export async function searchVaultDocuments({
  vaultId,
  query = '',
  pageIndex = 0,
  pageSize = 10,
  tagId,
  tagIds,
  dateFrom,
  dateTo,
  sortBy,
}: {
  vaultId: string;
  query?: string;
  pageIndex?: number;
  pageSize?: number;
  tagId?: string;
  tagIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
}) {
  const params = new URLSearchParams({
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
  });

  if (query.trim().length > 0) {
    params.set('q', query);
  }

  if (tagId) {
    params.set('tagId', tagId);
  }

  if (tagIds && tagIds.length > 0) {
    params.set('tagIds', tagIds.join(','));
  }

  if (dateFrom) {
    params.set('dateFrom', dateFrom);
  }

  if (dateTo) {
    params.set('dateTo', dateTo);
  }

  if (sortBy) {
    params.set('sortBy', sortBy);
  }

  return fetchJson<SearchResultPage>(`/api/vaults/${vaultId}/search?${params.toString()}`);
}

export async function searchAllDocuments({
  query = '',
  pageIndex = 0,
  pageSize = 10,
  vaultId,
  vaultIds,
  tagId,
  tagIds,
  dateFrom,
  dateTo,
  sortBy,
}: {
  query?: string;
  pageIndex?: number;
  pageSize?: number;
  vaultId?: string;
  vaultIds?: string[];
  tagId?: string;
  tagIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
}) {
  const params = new URLSearchParams({
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
  });

  if (query.trim().length > 0) {
    params.set('q', query);
  }

  if (vaultId) {
    params.set('vaultId', vaultId);
  }

  if (vaultIds && vaultIds.length > 0) {
    params.set('vaultIds', vaultIds.join(','));
  }

  if (tagId) {
    params.set('tagId', tagId);
  }

  if (tagIds && tagIds.length > 0) {
    params.set('tagIds', tagIds.join(','));
  }

  if (dateFrom) {
    params.set('dateFrom', dateFrom);
  }

  if (dateTo) {
    params.set('dateTo', dateTo);
  }

  if (sortBy) {
    params.set('sortBy', sortBy);
  }

  return fetchJson<SearchResultPage>(`/api/search?${params.toString()}`);
}
