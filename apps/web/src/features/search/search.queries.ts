import { useQuery } from '@tanstack/react-query';
import { searchAllDocuments, searchVaultDocuments } from './search.api';
import type { SearchSortBy } from './search.types';

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
    params.sortBy ?? 'document_date_desc',
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
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: searchQueryKeys.results(vaultId, { query, pageIndex, pageSize, tagId, tagIds, dateFrom, dateTo, sortBy }),
    queryFn: () => searchVaultDocuments({ vaultId, query, pageIndex, pageSize, tagId, tagIds, dateFrom, dateTo, sortBy }),
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
  enabled?: boolean;
}) {
  const vaultKey = vaultIds && vaultIds.length > 0 ? vaultIds.join(',') : vaultId ?? 'all-vaults';

  return useQuery({
    queryKey: searchQueryKeys.results(vaultKey, { query, pageIndex, pageSize, tagId, tagIds, dateFrom, dateTo, sortBy }),
    queryFn: () => searchAllDocuments({ query, pageIndex, pageSize, vaultId, vaultIds, tagId, tagIds, dateFrom, dateTo, sortBy }),
    enabled,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  });
}
