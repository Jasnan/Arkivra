import type {
  Citation,
  CitationAssetType,
  CitationBoundingBox,
  CitationImageAsset,
  SearchResultItem,
  SearchResultMatchType,
  SearchResultTag,
  SearchSortBy,
  SearchVersionMode,
} from './search.types.js';
import { sql } from 'drizzle-orm';

export type SearchRow = {
  vault_id: string;
  vault_name: string;
  document_id: string;
  document_version_id: string;
  version_number: number;
  name: string;
  original_name: string;
  original_size: number;
  mime_type: string;
  created_at: Date;
  updated_at: Date;
  tags_json: string;
  matched_chunks_count: number;
  chunk_index: number | null;
  chunk_type: string | null;
  page_number: number | null;
  chunk_content: string | null;
  snippet: string | null;
  score: number | null;
  fulltext_match: boolean | null;
  substring_position: number | null;
  title_match: boolean | null;
  match_type: SearchResultMatchType | null;
  results_count?: number;
};

export type CountRow = {
  results_count: number;
};

export const HYBRID_DOCUMENT_CANDIDATE_LIMIT = 80;
export const HYBRID_DOCUMENT_EXCERPT_LENGTH = 260;
export const HYBRID_DOCUMENT_MIN_SEMANTIC_SIMILARITY = 0.45;
export const HYBRID_CITATION_DEFAULT_CANDIDATE_LIMIT = 50;
export const HYBRID_CITATION_MAX_CANDIDATE_LIMIT = 200;
export const HYBRID_CITATION_MAX_TERMS = 24;
export const HYBRID_TITLE_MATCH_BASE_SCORE = 0.03;
export const HYBRID_TITLE_MATCH_TERM_SCORE = 0.004;
export const HYBRID_TITLE_TERM_STOP_WORDS = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'can',
  'could',
  'date',
  'dates',
  'for',
  'following',
  'from',
  'give',
  'has',
  'have',
  'into',
  'its',
  'list',
  'me',
  'need',
  'person',
  'persons',
  'please',
  'show',
  'that',
  'the',
  'their',
  'these',
  'this',
  'was',
  'were',
  'what',
  'when',
  'which',
  'with',
  'you',
  'your',
]);

export type HybridSearchRow = {
  chunk_id: string;
  retrieval_representation: string | null;
  document_id: string;
  document_version_id: string;
  version_number: number;
  vault_id: string;
  vault_name: string;
  document_name: string;
  mime_type: string;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  section_path: unknown;
  source_element_ids: unknown;
  table_source_element_ids: unknown;
  snippet: string | null;
  bounding_boxes: unknown;
  citation_precision: string;
  tables_html: unknown;
  image_asset_ids: unknown;
  image_assets: unknown;
  image_provenance: unknown;
  text_locator: unknown;
  score: number | string | null;
};

export function parseTagsJson(value: string | null | undefined): SearchResultTag[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        (typeof item.color === 'string' || item.color === null)
      ) {
        return [
          {
            id: item.id,
            name: item.name,
            color: item.color,
          },
        ];
      }

      return [];
    });
  } catch {
    return [];
  }
}

export function toIsoString(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toSqlDateBoundary(value: Date | null | undefined, boundary: 'start' | 'end') {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = new Date(value);

  if (boundary === 'start') {
    normalized.setHours(0, 0, 0, 0);
  } else {
    normalized.setHours(23, 59, 59, 999);
  }

  return normalized;
}

export function normalizeTagIds(tagId: string | undefined, tagIds: string[] | undefined) {
  return [
    ...new Set(
      [...(tagIds ?? []).map((item) => item.trim()), ...(tagId ? [tagId.trim()] : [])].filter(
        Boolean,
      ),
    ),
  ];
}

export function getBrowseOrderSql(sortBy: SearchSortBy) {
  switch (sortBy) {
    case 'created_asc':
      return sql`d.created_at ASC, d.name ASC`;
    case 'created_desc':
      return sql`d.created_at DESC, d.name ASC`;
    case 'name_asc':
      return sql`LOWER(d.name) ASC, d.created_at DESC`;
    case 'name_desc':
      return sql`LOWER(d.name) DESC, d.created_at DESC`;
    default:
      return sql`d.created_at DESC, d.name ASC`;
  }
}

export function getSearchOrderSql(sortBy: SearchSortBy) {
  switch (sortBy) {
    case 'created_asc':
      return sql`title_match DESC NULLS LAST, created_at ASC, updated_at DESC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, name ASC`;
    case 'created_desc':
      return sql`title_match DESC NULLS LAST, created_at DESC, updated_at DESC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, name ASC`;
    case 'name_asc':
      return sql`title_match DESC NULLS LAST, LOWER(name) ASC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, created_at DESC`;
    case 'name_desc':
      return sql`title_match DESC NULLS LAST, LOWER(name) DESC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, created_at DESC`;
    default:
      return sql`title_match DESC NULLS LAST, created_at DESC, updated_at DESC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, name ASC`;
  }
}

export function getHybridSearchOrderSql(sortBy: SearchSortBy) {
  switch (sortBy) {
    case 'created_asc':
      return sql`title_match DESC NULLS LAST, score DESC NULLS LAST, fulltext_match DESC NULLS LAST, created_at ASC, updated_at DESC, substring_position ASC NULLS LAST, name ASC`;
    case 'created_desc':
      return sql`title_match DESC NULLS LAST, score DESC NULLS LAST, fulltext_match DESC NULLS LAST, created_at DESC, updated_at DESC, substring_position ASC NULLS LAST, name ASC`;
    case 'name_asc':
      return sql`title_match DESC NULLS LAST, score DESC NULLS LAST, fulltext_match DESC NULLS LAST, LOWER(name) ASC, substring_position ASC NULLS LAST, created_at DESC`;
    case 'name_desc':
      return sql`title_match DESC NULLS LAST, score DESC NULLS LAST, fulltext_match DESC NULLS LAST, LOWER(name) DESC, substring_position ASC NULLS LAST, created_at DESC`;
    default:
      return sql`title_match DESC NULLS LAST, score DESC NULLS LAST, fulltext_match DESC NULLS LAST, created_at DESC, updated_at DESC, substring_position ASC NULLS LAST, name ASC`;
  }
}

export function parseSearchResultMatchType(
  value: SearchResultMatchType | string | null | undefined,
): SearchResultMatchType {
  return value === 'semantic' || value === 'title' || value === 'keyword' ? value : 'keyword';
}

export function mapSearchRow(row: SearchRow): SearchResultItem {
  return {
    vaultId: row.vault_id,
    vaultName: row.vault_name,
    documentId: row.document_id,
    documentVersionId: row.document_version_id,
    versionNumber: row.version_number,
    name: row.name,
    originalName: row.original_name,
    originalSize: row.original_size,
    mimeType: row.mime_type,
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
    tags: parseTagsJson(row.tags_json),
    matchedChunksCount: row.matched_chunks_count,
    bestChunk:
      row.chunk_index === null ||
      row.chunk_content === null ||
      row.snippet === null ||
      row.score === null
        ? null
        : {
            chunkIndex: row.chunk_index,
            chunkType: row.chunk_type,
            pageNumber: row.page_number,
            content: row.chunk_content,
            snippet: row.snippet,
            score: row.score,
            matchType: parseSearchResultMatchType(row.match_type),
          },
  };
}

export function createEmptyResponse({
  query,
  pageIndex,
  pageSize,
  vaultId,
  tagIds,
  dateFrom,
  dateTo,
  sortBy,
  includeVersions,
}: {
  query: string;
  pageIndex: number;
  pageSize: number;
  vaultId?: string;
  tagIds: string[];
  dateFrom?: Date | null;
  dateTo?: Date | null;
  sortBy: SearchSortBy;
  includeVersions: SearchVersionMode;
}) {
  return {
    query,
    pageIndex,
    pageSize,
    results: [],
    resultsCount: 0,
    filters: {
      vaultId: vaultId ?? null,
      tagId: tagIds[0] ?? null,
      tagIds,
      dateFrom: toIsoString(toSqlDateBoundary(dateFrom ?? null, 'start')),
      dateTo: toIsoString(toSqlDateBoundary(dateTo ?? null, 'end')),
      sortBy,
      includeVersions,
    },
  };
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => (typeof item === 'string' ? [item] : []));
}

export function parseBoundingBoxes(value: unknown): CitationBoundingBox[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { pageNumber?: unknown }).pageNumber !== 'number' ||
      typeof (item as { x0?: unknown }).x0 !== 'number' ||
      typeof (item as { y0?: unknown }).y0 !== 'number' ||
      typeof (item as { x1?: unknown }).x1 !== 'number' ||
      typeof (item as { y1?: unknown }).y1 !== 'number' ||
      typeof (item as { layoutWidth?: unknown }).layoutWidth !== 'number' ||
      typeof (item as { layoutHeight?: unknown }).layoutHeight !== 'number' ||
      typeof (item as { system?: unknown }).system !== 'string'
    ) {
      return [];
    }

    return [item as CitationBoundingBox];
  });
}

export function parseTextLocator(value: unknown): Citation['textLocator'] | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const locator = value as Record<string, unknown>;
  if (
    (locator.sourceType !== 'rawMarkdown' && locator.sourceType !== 'rawText') ||
    typeof locator.startOffset !== 'number' ||
    typeof locator.endOffset !== 'number' ||
    !Number.isInteger(locator.startOffset) ||
    !Number.isInteger(locator.endOffset) ||
    locator.startOffset < 0 ||
    locator.endOffset <= locator.startOffset
  ) {
    return undefined;
  }

  return {
    sourceType: locator.sourceType,
    startOffset: locator.startOffset,
    endOffset: locator.endOffset,
  };
}

export function parseImageAssets(value: unknown): CitationImageAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { assetId?: unknown }).assetId !== 'string' ||
      ((item as { sourceElementId?: unknown }).sourceElementId !== null &&
        typeof (item as { sourceElementId?: unknown }).sourceElementId !== 'string')
    ) {
      return [];
    }

    return [
      {
        assetId: (item as { assetId: string }).assetId,
        sourceElementId: (item as { sourceElementId: string | null }).sourceElementId,
        caption: null,
        pageNumber: null,
      },
    ];
  });
}

export type CitationImageProvenance = {
  sourceElementId: string | null;
  caption: string | null;
  pageNumber: number | null;
};

export function parseImageProvenance(value: unknown): CitationImageProvenance[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }

    const sourceElementId = (item as { elementId?: unknown }).elementId;
    const caption = (item as { caption?: unknown }).caption;
    const pageNumber = (item as { pageNumber?: unknown }).pageNumber;

    if (
      (sourceElementId !== null &&
        sourceElementId !== undefined &&
        typeof sourceElementId !== 'string') ||
      (caption !== null && caption !== undefined && typeof caption !== 'string') ||
      (pageNumber !== null && pageNumber !== undefined && typeof pageNumber !== 'number')
    ) {
      return [];
    }

    return [
      {
        sourceElementId: typeof sourceElementId === 'string' ? sourceElementId : null,
        caption: typeof caption === 'string' && caption.trim().length > 0 ? caption.trim() : null,
        pageNumber: typeof pageNumber === 'number' ? pageNumber : null,
      },
    ];
  });
}

export function parseAssetSourceElementIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { elementId?: unknown }).elementId === 'string'
    ) {
      return [(item as { elementId: string }).elementId];
    }

    return [];
  });
}

export function parseCitationPrecision(value: string): Citation['citationPrecision'] {
  return value === 'box' || value === 'page' || value === 'document' ? value : 'document';
}

export function buildVectorLiteral(vector: number[]) {
  return `[${vector.join(',')}]`;
}

export function extractHybridTitleTerms(query: string) {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3)
        .filter((term) => !HYBRID_TITLE_TERM_STOP_WORDS.has(term))
        .slice(0, HYBRID_CITATION_MAX_TERMS),
    ),
  ];
}

export function mergeHybridSearchRows(
  rows: HybridSearchRow[],
  titleRows: HybridSearchRow[],
  limit: number,
) {
  const rowsByChunkId = new Map<string, HybridSearchRow>();

  for (const row of [...rows, ...titleRows]) {
    const existing = rowsByChunkId.get(row.chunk_id);
    const existingScore =
      typeof existing?.score === 'number' ? existing.score : Number(existing?.score ?? 0);
    const rowScore = typeof row.score === 'number' ? row.score : Number(row.score ?? 0);

    if (existing === undefined || rowScore > existingScore) {
      rowsByChunkId.set(row.chunk_id, row);
    }
  }

  return [...rowsByChunkId.values()]
    .sort((left, right) => {
      const leftScore = typeof left.score === 'number' ? left.score : Number(left.score ?? 0);
      const rightScore = typeof right.score === 'number' ? right.score : Number(right.score ?? 0);

      return rightScore - leftScore || left.chunk_id.localeCompare(right.chunk_id);
    })
    .slice(0, limit);
}

export function getRowScore(row: Pick<HybridSearchRow, 'score'>) {
  return typeof row.score === 'number' ? row.score : Number(row.score ?? 0);
}

export function getRepresentationBonus(
  row: Pick<HybridSearchRow, 'retrieval_representation' | 'tables_html' | 'citation_precision'>,
) {
  const representation = row.retrieval_representation;
  if (representation === 'docling_element_pair') {
    return 0.00008;
  }
  if (representation === 'docling_element') {
    return 0.00007;
  }
  if (representation === 'page') {
    return 0.00005;
  }
  if (representation === 'docling_hybrid') {
    return 0.00003;
  }
  if (representation === 'contextual') {
    return 0.00002;
  }
  if (representation === 'table' || parseStringArray(row.tables_html).length > 0) {
    return 0.00001;
  }
  return 0;
}

export function getRowRankingScore(row: HybridSearchRow) {
  return getRowScore(row) + getRepresentationBonus(row);
}

export function getDiversificationKey(row: HybridSearchRow) {
  const sourceElementIds = parseStringArray(row.source_element_ids).sort();
  const tableSourceElementIds = parseAssetSourceElementIds(row.table_source_element_ids).sort();
  const sourceKey = [...new Set([...sourceElementIds, ...tableSourceElementIds])].join('|');
  if (sourceKey.length > 0) {
    return `${row.document_version_id}:source:${sourceKey}`;
  }

  if (row.page_start === null && row.page_end === null) {
    return `${row.document_version_id}:chunk:${row.chunk_id}`;
  }

  const pageStart = row.page_start ?? 'document';
  const pageEnd = row.page_end ?? pageStart;
  return `${row.document_version_id}:page:${pageStart}-${pageEnd}`;
}

export function diversifyHybridSearchRows(rows: HybridSearchRow[], limit: number) {
  const rowsByRegion = new Map<string, HybridSearchRow>();
  const overflowRows: HybridSearchRow[] = [];

  for (const row of rows) {
    const key = getDiversificationKey(row);
    const existing = rowsByRegion.get(key);

    if (existing === undefined) {
      rowsByRegion.set(key, row);
      continue;
    }

    const existingRankingScore = getRowRankingScore(existing);
    const rowRankingScore = getRowRankingScore(row);

    if (rowRankingScore > existingRankingScore) {
      overflowRows.push(existing);
      rowsByRegion.set(key, row);
    } else {
      overflowRows.push(row);
    }
  }

  const diversified = [...rowsByRegion.values()];
  const seenChunkIds = new Set(diversified.map((row) => row.chunk_id));
  for (const row of overflowRows) {
    if (diversified.length >= limit) {
      break;
    }
    if (seenChunkIds.has(row.chunk_id)) {
      continue;
    }
    seenChunkIds.add(row.chunk_id);
    diversified.push(row);
  }

  return diversified
    .sort((left, right) => {
      const leftScore = typeof left.score === 'number' ? left.score : Number(left.score ?? 0);
      const rightScore = typeof right.score === 'number' ? right.score : Number(right.score ?? 0);

      return rightScore - leftScore || left.chunk_id.localeCompare(right.chunk_id);
    })
    .slice(0, limit);
}

export function inferAssetType({
  tablesHtml,
  imageAssetIds,
}: {
  tablesHtml: string[];
  imageAssetIds: string[];
}): CitationAssetType {
  if (imageAssetIds.length > 0) {
    return 'image';
  }

  if (tablesHtml.length > 0) {
    return 'table';
  }

  return 'text';
}

export function mergeImageAssetsWithProvenance({
  imageAssets,
  imageAssetIds,
  imageProvenance,
}: {
  imageAssets: CitationImageAsset[];
  imageAssetIds: string[];
  imageProvenance: CitationImageProvenance[];
}) {
  const assets =
    imageAssets.length > 0
      ? imageAssets
      : imageAssetIds.map((assetId) => ({
          assetId,
          sourceElementId: null,
          caption: null,
          pageNumber: null,
        }));

  return assets.map((asset, index) => {
    const provenance = asset.sourceElementId
      ? (imageProvenance.find((entry) => entry.sourceElementId === asset.sourceElementId) ??
        imageProvenance[index])
      : imageProvenance[index];

    return {
      assetId: asset.assetId,
      sourceElementId: asset.sourceElementId ?? provenance?.sourceElementId ?? null,
      caption: provenance?.caption ?? asset.caption ?? null,
      pageNumber: provenance?.pageNumber ?? asset.pageNumber ?? null,
    };
  });
}
