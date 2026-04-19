export const SEARCH_SORT_VALUES = [
  'created_desc',
  'created_asc',
  'name_asc',
  'name_desc',
] as const;

export type SearchSortBy = (typeof SEARCH_SORT_VALUES)[number];

export type SearchResultTag = {
  id: string;
  name: string;
  color: string | null;
};

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
  tags: SearchResultTag[];
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
