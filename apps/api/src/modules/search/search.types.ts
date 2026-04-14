export type SearchResultItem = {
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
    dateFrom: string | null;
    dateTo: string | null;
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
    dateFrom?: Date | null;
    dateTo?: Date | null;
  }) => Promise<SearchResultPage>;
};
