export interface SearchFilters {
  vaultId: string | null;
  tagId: string | null;
  tagIds: string[];
  dateFrom: string | null;
  dateTo: string | null;
  sortBy: SearchSortBy;
}

export type SearchSortBy =
  | 'document_date_desc'
  | 'document_date_asc'
  | 'updated_desc'
  | 'updated_asc'
  | 'name_asc'
  | 'name_desc';

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
  matchedChunksCount: number;
  bestChunk: {
    chunkIndex: number;
    chunkType: string | null;
    pageNumber: number | null;
    content: string;
    snippet: string;
    score: number;
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
