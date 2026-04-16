export const SEARCH_SORT_VALUES = [
  'document_date_desc',
  'document_date_asc',
  'updated_desc',
  'updated_asc',
  'name_asc',
  'name_desc',
] as const;

export type SearchSortBy = (typeof SEARCH_SORT_VALUES)[number];

export type SearchResultItem = {
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
};

export type SearchResultPage = {
  results: SearchResultItem[];
  resultsCount: number;
  pageIndex: number;
  pageSize: number;
  query: string;
  filters: {
    vaultId: string | null;
    tagId: string | null;
    tagIds: string[];
    dateFrom: string | null;
    dateTo: string | null;
    sortBy: SearchSortBy;
  };
};

export type DocumentSearchServices = {
  name: string;
  searchDocuments: (args: {
    vaultId?: string;
    vaultIds?: string[];
    query: string;
    pageIndex: number;
    pageSize: number;
    tagId?: string;
    tagIds?: string[];
    dateFrom?: Date | null;
    dateTo?: Date | null;
    sortBy?: SearchSortBy;
  }) => Promise<SearchResultPage>;
};
