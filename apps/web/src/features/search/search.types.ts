export interface SearchFilters {
  vaultId: string | null;
  tagId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface SearchResultItem {
  vaultId: string;
  vaultName: string;
  documentId: string;
  name: string;
  originalName: string;
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
  };
}

export interface SearchResultPage {
  results: SearchResultItem[];
  resultsCount: number;
  pageIndex: number;
  pageSize: number;
  query: string;
  filters: SearchFilters;
}
