import type { SearchMode, SearchSortBy } from '@/features/search/search.types';

export interface EmailVerificationSearch {
  email?: string;
}

export interface ChatRouteSearch {
  vaultId?: string;
  documentId?: string;
  documentName?: string;
}

export interface SearchRouteSearch {
  q?: string;
  vaultId?: string;
  vaultIds?: string;
  tagId?: string;
  tagIds?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: SearchSortBy;
  searchMode?: SearchMode;
  source?: 'search';
}

export interface VaultWorkspaceSearch extends SearchRouteSearch {
  folderId?: string;
}

export interface TransfersRouteSearch {
  vaultId?: string;
  folderId?: string;
  locked?: 'true';
}

export interface TrashRouteSearch {
  vaultId?: string | string[];
}

export function readOptionalSearchString(search: Record<string, unknown>, key: string) {
  const value = search[key];

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalSearchStringArray(search: Record<string, unknown>, key: string) {
  const value = search[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return strings.length > 0 ? strings : undefined;
}

function readOptionalDateSearchString(search: Record<string, unknown>, key: string) {
  const value = readOptionalSearchString(search, key);

  if (value === undefined) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : value;
}

export function isSearchSortBy(value: string | undefined): value is SearchSortBy {
  return (
    value === 'created_desc' ||
    value === 'created_asc' ||
    value === 'name_asc' ||
    value === 'name_desc'
  );
}

export function isSearchMode(value: string | undefined): value is SearchMode {
  return value === 'keyword' || value === 'hybrid';
}

function assignOptionalString<T extends object, K extends string>(
  target: T,
  key: K,
  value: string | undefined,
) {
  if (value !== undefined) {
    Object.assign(target, { [key]: value });
  }
}

export function validateEmailVerificationSearch(
  search: Record<string, unknown>,
): EmailVerificationSearch {
  const params: EmailVerificationSearch = {};
  assignOptionalString(params, 'email', readOptionalSearchString(search, 'email'));
  return params;
}

export function validateChatSearch(search: Record<string, unknown>): ChatRouteSearch {
  const params: ChatRouteSearch = {};
  assignOptionalString(params, 'vaultId', readOptionalSearchString(search, 'vaultId'));
  assignOptionalString(params, 'documentId', readOptionalSearchString(search, 'documentId'));
  assignOptionalString(params, 'documentName', readOptionalSearchString(search, 'documentName'));
  return params;
}

export function validateSearchRouteSearch(search: Record<string, unknown>): SearchRouteSearch {
  const params: SearchRouteSearch = {};
  const sortBy = readOptionalSearchString(search, 'sortBy');
  const searchMode = readOptionalSearchString(search, 'searchMode');

  assignOptionalString(params, 'q', readOptionalSearchString(search, 'q'));
  assignOptionalString(params, 'vaultId', readOptionalSearchString(search, 'vaultId'));
  assignOptionalString(params, 'vaultIds', readOptionalSearchString(search, 'vaultIds'));
  assignOptionalString(params, 'tagId', readOptionalSearchString(search, 'tagId'));
  assignOptionalString(params, 'tagIds', readOptionalSearchString(search, 'tagIds'));
  assignOptionalString(params, 'dateFrom', readOptionalDateSearchString(search, 'dateFrom'));
  assignOptionalString(params, 'dateTo', readOptionalDateSearchString(search, 'dateTo'));

  if (isSearchSortBy(sortBy)) {
    params.sortBy = sortBy;
  }

  if (isSearchMode(searchMode)) {
    params.searchMode = searchMode;
  }

  if (readOptionalSearchString(search, 'source') === 'search') {
    params.source = 'search';
  }

  return params;
}

export function validateVaultWorkspaceSearch(
  search: Record<string, unknown>,
): VaultWorkspaceSearch {
  const params: VaultWorkspaceSearch = validateSearchRouteSearch(search);
  assignOptionalString(params, 'folderId', readOptionalSearchString(search, 'folderId'));
  return params;
}

export function validateTransfersSearch(search: Record<string, unknown>): TransfersRouteSearch {
  const params: TransfersRouteSearch = {};
  assignOptionalString(params, 'vaultId', readOptionalSearchString(search, 'vaultId'));
  assignOptionalString(params, 'folderId', readOptionalSearchString(search, 'folderId'));

  if (readOptionalSearchString(search, 'locked') === 'true') {
    params.locked = 'true';
  }

  return params;
}

export function validateTrashSearch(search: Record<string, unknown>): TrashRouteSearch {
  const params: TrashRouteSearch = {};
  const vaultId = readOptionalSearchString(search, 'vaultId');
  const vaultIds = readOptionalSearchStringArray(search, 'vaultId');

  if (vaultIds !== undefined) {
    params.vaultId = vaultIds;
  } else if (vaultId !== undefined) {
    params.vaultId = vaultId;
  }

  return params;
}
