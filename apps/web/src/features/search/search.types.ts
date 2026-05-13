export interface SearchFilters {
  vaultId: string | null;
  tagId: string | null;
  tagIds: string[];
  dateFrom: string | null;
  dateTo: string | null;
  sortBy: SearchSortBy;
}

export type SearchSortBy =
  | 'created_desc'
  | 'created_asc'
  | 'name_asc'
  | 'name_desc';

export type SearchMode = 'keyword' | 'hybrid';

export type SearchResultMatchType = 'keyword' | 'semantic' | 'title';

export interface SearchResultTag {
  id: string;
  name: string;
  color: string | null;
}

export interface SearchResultItem {
  vaultId: string;
  vaultName: string;
  documentId: string;
  name: string;
  originalName: string;
  originalSize: number;
  mimeType: string;
  documentDate: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: SearchResultTag[];
  matchedChunksCount: number;
  bestChunk: {
    chunkIndex: number;
    chunkType: string | null;
    pageNumber: number | null;
    content: string;
    snippet: string;
    score: number;
    matchType: SearchResultMatchType;
  } | null;
}

export interface SearchResultPage {
  results: SearchResultItem[];
  resultsCount: number;
  pageIndex: number;
  pageSize: number;
  query: string;
  filters: SearchFilters;
}
