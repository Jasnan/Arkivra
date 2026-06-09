export const SEARCH_SORT_VALUES = [
  'created_desc',
  'created_asc',
  'name_asc',
  'name_desc',
] as const;

export type SearchSortBy = (typeof SEARCH_SORT_VALUES)[number];

export type DocumentSearchMode = 'keyword' | 'hybrid';

export type SearchVersionMode = 'latest' | 'historical';

export type SearchResultMatchType = 'keyword' | 'semantic' | 'title';

export type SearchResultTag = {
  id: string;
  name: string;
  color: string | null;
};

export type SearchResultItem = {
  vaultId: string;
  vaultName: string;
  documentId: string;
  documentVersionId: string;
  versionNumber: number;
  name: string;
  originalName: string;
  originalSize: number;
  mimeType: string;
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
    matchType: SearchResultMatchType;
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
    includeVersions: SearchVersionMode;
  };
};

export type CitationBoundingBox = {
  pageNumber: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layoutWidth: number;
  layoutHeight: number;
  system: string;
};

export type CitationAssetType = 'text' | 'table' | 'image';

export type CitationImageAsset = {
  assetId: string;
  sourceElementId: string | null;
  caption?: string | null;
  pageNumber?: number | null;
};

export type Citation = {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  versionNumber: number;
  vaultId: string;
  vaultName: string;
  documentName: string;
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
  sectionPath?: string[];
  sourceElementIds?: string[];
  tableSourceElementIds?: string[];
  snippet: string;
  boundingBoxes: CitationBoundingBox[];
  citationPrecision: 'box' | 'page' | 'document';
  assetType: CitationAssetType;
  tablesHtml: string[];
  imageAssetIds: string[];
  imageAssets?: CitationImageAsset[];
  score: number;
};

export type HybridSearchMode = 'hybrid' | 'fts';

export type HybridSearchResult = {
  query: string;
  limit: number;
  mode: HybridSearchMode;
  citations: Citation[];
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
    searchMode?: DocumentSearchMode;
    includeVersions?: SearchVersionMode;
  }) => Promise<SearchResultPage>;
  searchHybrid: (args: {
    vaultId?: string;
    vaultIds?: string[];
    documentId?: string;
    documentVersionIds?: string[];
    query: string;
    limit: number;
    mode?: HybridSearchMode;
  }) => Promise<HybridSearchResult>;
};
