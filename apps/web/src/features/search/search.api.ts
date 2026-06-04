import { fetchJson } from '@/lib/api';
import { localDateToUtcBoundary } from '@/lib/localization';
import type { SearchMode, SearchResultPage } from './search.types';

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
  searchMode,
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
  searchMode?: SearchMode;
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
    params.set('dateFrom', localDateToUtcBoundary(dateFrom, 'start') ?? dateFrom);
  }

  if (dateTo) {
    params.set('dateTo', localDateToUtcBoundary(dateTo, 'end') ?? dateTo);
  }

  if (sortBy) {
    params.set('sortBy', sortBy);
  }

  if (searchMode === 'hybrid') {
    params.set('searchMode', searchMode);
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
  searchMode,
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
  searchMode?: SearchMode;
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
    params.set('dateFrom', localDateToUtcBoundary(dateFrom, 'start') ?? dateFrom);
  }

  if (dateTo) {
    params.set('dateTo', localDateToUtcBoundary(dateTo, 'end') ?? dateTo);
  }

  if (sortBy) {
    params.set('sortBy', sortBy);
  }

  if (searchMode === 'hybrid') {
    params.set('searchMode', searchMode);
  }

  return fetchJson<SearchResultPage>(`/api/search?${params.toString()}`);
}
