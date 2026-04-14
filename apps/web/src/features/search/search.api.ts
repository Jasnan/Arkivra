import { fetchJson } from '@/lib/api';
import type { SearchResultPage } from './search.types';

export async function searchVaultDocuments({
  vaultId,
  query,
  pageIndex = 0,
  pageSize = 10,
  tagId,
  dateFrom,
  dateTo,
}: {
  vaultId: string;
  query: string;
  pageIndex?: number;
  pageSize?: number;
  tagId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const params = new URLSearchParams({
    q: query,
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
  });

  if (tagId) {
    params.set('tagId', tagId);
  }

  if (dateFrom) {
    params.set('dateFrom', dateFrom);
  }

  if (dateTo) {
    params.set('dateTo', dateTo);
  }

  return fetchJson<SearchResultPage>(`/api/vaults/${vaultId}/search?${params.toString()}`);
}

export async function searchAllDocuments({
  query,
  pageIndex = 0,
  pageSize = 10,
  vaultId,
  tagId,
  dateFrom,
  dateTo,
}: {
  query: string;
  pageIndex?: number;
  pageSize?: number;
  vaultId?: string;
  tagId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const params = new URLSearchParams({
    q: query,
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
  });

  if (vaultId) {
    params.set('vaultId', vaultId);
  }

  if (tagId) {
    params.set('tagId', tagId);
  }

  if (dateFrom) {
    params.set('dateFrom', dateFrom);
  }

  if (dateTo) {
    params.set('dateTo', dateTo);
  }

  return fetchJson<SearchResultPage>(`/api/search?${params.toString()}`);
}
