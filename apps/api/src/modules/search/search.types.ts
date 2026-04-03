export type SearchResultItem = {
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
};

export type DocumentSearchServices = {
  name: string;
  searchDocuments: (args: {
    vaultId: string;
    query: string;
    pageIndex: number;
    pageSize: number;
  }) => Promise<SearchResultPage>;
};
