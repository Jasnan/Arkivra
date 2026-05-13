import { useQuery } from '@tanstack/react-query';
import { searchAllDocuments, searchVaultDocuments } from './search.api';
import type { SearchMode, SearchSortBy } from './search.types';

export const searchQueryKeys = {
  all: ['search'] as const,
  results: (vaultKey: string, params: {
    query: string;
    pageIndex: number;
    pageSize: number;
    tagId?: string;
    tagIds?: string[];
    dateFrom?: string;
    dateTo?: string;
    sortBy?: SearchSortBy;
    searchMode?: SearchMode;
  }) => [
    ...searchQueryKeys.all,
    vaultKey,
    params.query,
    params.pageIndex,
    params.pageSize,
    params.tagId ?? '',
    (params.tagIds ?? []).join(','),
    params.dateFrom ?? '',
    params.dateTo ?? '',
    params.sortBy ?? 'created_desc',
    params.searchMode ?? 'keyword',
  ] as const,
};

export function useVaultSearchDocumentsQuery({
  vaultId,
  query,
  pageIndex,
  pageSize,
  tagId,
  tagIds,
  dateFrom,
  dateTo,
  sortBy,
  searchMode,
  enabled = true,
}: {
  vaultId: string;
  query: string;
  pageIndex: number;
  pageSize: number;
  tagId?: string;
  tagIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: SearchSortBy;
  searchMode?: SearchMode;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: searchQueryKeys.results(vaultId, { query, pageIndex, pageSize, tagId, tagIds, dateFrom, dateTo, sortBy, searchMode }),
    queryFn: () => searchVaultDocuments({ vaultId, query, pageIndex, pageSize, tagId, tagIds, dateFrom, dateTo, sortBy, searchMode }),
    enabled: enabled && vaultId.length > 0,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  });
}

export function useGlobalSearchDocumentsQuery({
  query,
  pageIndex,
  pageSize,
  vaultId,
  vaultIds,
  tagId,
  tagIds,
  dateFrom,
  dateTo,
  sortBy,
  searchMode,
  enabled = true,
}: {
  query: string;
  pageIndex: number;
  pageSize: number;
  vaultId?: string;
  vaultIds?: string[];
  tagId?: string;
  tagIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: SearchSortBy;
  searchMode?: SearchMode;
  enabled?: boolean;
}) {
  const vaultKey = vaultIds && vaultIds.length > 0 ? vaultIds.join(',') : vaultId ?? 'all-vaults';

  return useQuery({
    queryKey: searchQueryKeys.results(vaultKey, { query, pageIndex, pageSize, tagId, tagIds, dateFrom, dateTo, sortBy, searchMode }),
    queryFn: () => searchAllDocuments({ query, pageIndex, pageSize, vaultId, vaultIds, tagId, tagIds, dateFrom, dateTo, sortBy, searchMode }),
    enabled,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  });
}
