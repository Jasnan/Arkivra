import { useQuery } from '@tanstack/react-query';
import { searchAllDocuments, searchVaultDocuments } from './search.api';

export const searchQueryKeys = {
  all: ['search'] as const,
  results: (vaultId: string, params: {
    query: string;
    pageIndex: number;
    pageSize: number;
    tagId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => [
    ...searchQueryKeys.all,
    vaultId,
    params.query,
    params.pageIndex,
    params.pageSize,
    params.tagId ?? '',
    params.dateFrom ?? '',
    params.dateTo ?? '',
  ] as const,
};

export function useVaultSearchDocumentsQuery({
  vaultId,
  query,
  pageIndex,
  pageSize,
  tagId,
  dateFrom,
  dateTo,
}: {
  vaultId: string;
  query: string;
  pageIndex: number;
  pageSize: number;
  tagId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: searchQueryKeys.results(vaultId, { query, pageIndex, pageSize, tagId, dateFrom, dateTo }),
    queryFn: () => searchVaultDocuments({ vaultId, query, pageIndex, pageSize, tagId, dateFrom, dateTo }),
    enabled: vaultId.length > 0 && query.trim().length > 0,
    staleTime: 15_000,
  });
}

export function useGlobalSearchDocumentsQuery({
  query,
  pageIndex,
  pageSize,
  vaultId,
  tagId,
  dateFrom,
  dateTo,
}: {
  query: string;
  pageIndex: number;
  pageSize: number;
  vaultId?: string;
  tagId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: searchQueryKeys.results(vaultId ?? 'all-vaults', { query, pageIndex, pageSize, tagId, dateFrom, dateTo }),
    queryFn: () => searchAllDocuments({ query, pageIndex, pageSize, vaultId, tagId, dateFrom, dateTo }),
    enabled: query.trim().length > 0,
    staleTime: 15_000,
  });
}
