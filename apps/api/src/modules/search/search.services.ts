import type { Database } from '../database/database.js';
import type { EmbeddingProvider } from '../ai/providers/types.js';
import type { ActiveEmbeddingIndex } from '../ai/indexing/index.js';
import type {
  Citation,
  CitationAssetType,
  CitationImageAsset,
  CitationBoundingBox,
  DocumentSearchMode,
  DocumentSearchServices,
  HybridSearchMode,
  SearchResultItem,
  SearchResultMatchType,
  SearchResultTag,
  SearchSortBy,
  SearchVersionMode,
} from './search.types.js';
import { sql } from 'drizzle-orm';

type SearchRow = {
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

type CountRow = {
  results_count: number;
};

const HYBRID_DOCUMENT_CANDIDATE_LIMIT = 80;
const HYBRID_DOCUMENT_EXCERPT_LENGTH = 260;
const HYBRID_DOCUMENT_MIN_SEMANTIC_SIMILARITY = 0.45;
const HYBRID_CITATION_DEFAULT_CANDIDATE_LIMIT = 50;
const HYBRID_CITATION_MAX_CANDIDATE_LIMIT = 200;
const HYBRID_CITATION_MAX_TERMS = 24;
const HYBRID_TITLE_MATCH_BASE_SCORE = 0.03;
const HYBRID_TITLE_MATCH_TERM_SCORE = 0.004;
const HYBRID_TITLE_TERM_STOP_WORDS = new Set([
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

type HybridSearchRow = {
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

function parseTagsJson(value: string | null | undefined): SearchResultTag[] {
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

function toIsoString(value: Date | string | null) {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toSqlDateBoundary(value: Date | null | undefined, boundary: 'start' | 'end') {
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

function normalizeTagIds(tagId: string | undefined, tagIds: string[] | undefined) {
  return [
    ...new Set(
      [...(tagIds ?? []).map((item) => item.trim()), ...(tagId ? [tagId.trim()] : [])].filter(
        Boolean,
      ),
    ),
  ];
}

function getBrowseOrderSql(sortBy: SearchSortBy) {
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

function getSearchOrderSql(sortBy: SearchSortBy) {
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

function getHybridSearchOrderSql(sortBy: SearchSortBy) {
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

function parseSearchResultMatchType(
  value: SearchResultMatchType | string | null | undefined,
): SearchResultMatchType {
  return value === 'semantic' || value === 'title' || value === 'keyword' ? value : 'keyword';
}

function mapSearchRow(row: SearchRow): SearchResultItem {
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

function createEmptyResponse({
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

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => (typeof item === 'string' ? [item] : []));
}

function parseBoundingBoxes(value: unknown): CitationBoundingBox[] {
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

function parseTextLocator(value: unknown): Citation['textLocator'] | undefined {
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

function parseImageAssets(value: unknown): CitationImageAsset[] {
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

type CitationImageProvenance = {
  sourceElementId: string | null;
  caption: string | null;
  pageNumber: number | null;
};

function parseImageProvenance(value: unknown): CitationImageProvenance[] {
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

function parseAssetSourceElementIds(value: unknown): string[] {
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

function parseCitationPrecision(value: string): Citation['citationPrecision'] {
  return value === 'box' || value === 'page' || value === 'document' ? value : 'document';
}

function buildVectorLiteral(vector: number[]) {
  return `[${vector.join(',')}]`;
}

function extractHybridTitleTerms(query: string) {
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

function mergeHybridSearchRows(
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

function getRowScore(row: Pick<HybridSearchRow, 'score'>) {
  return typeof row.score === 'number' ? row.score : Number(row.score ?? 0);
}

function getRepresentationBonus(
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

function getRowRankingScore(row: HybridSearchRow) {
  return getRowScore(row) + getRepresentationBonus(row);
}

function getDiversificationKey(row: HybridSearchRow) {
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

function diversifyHybridSearchRows(rows: HybridSearchRow[], limit: number) {
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

function inferAssetType({
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

function mergeImageAssetsWithProvenance({
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

export function createDocumentSearchServices({
  db,
  embeddingProvider,
  resolveActiveEmbeddingIndex,
}: {
  db: Database;
  embeddingProvider?: EmbeddingProvider;
  resolveActiveEmbeddingIndex?: () => Promise<ActiveEmbeddingIndex | null>;
}): DocumentSearchServices {
  async function embedQuery(trimmedQuery: string) {
    if (embeddingProvider === undefined) {
      return null;
    }

    try {
      const config =
        resolveActiveEmbeddingIndex !== undefined ? await resolveActiveEmbeddingIndex() : null;
      if (config === null) {
        return null;
      }

      const vectors = await embeddingProvider.embed({
        texts: [trimmedQuery],
        config,
      });
      const vector = vectors[0] ?? null;

      return vector === null ? null : { vector, index: config };
    } catch {
      return null;
    }
  }

  async function searchDocuments({
    vaultId,
    vaultIds,
    query,
    pageIndex,
    pageSize,
    tagId,
    tagIds,
    dateFrom,
    dateTo,
    sortBy = 'created_desc',
    searchMode = 'keyword',
    includeVersions = 'latest',
  }: {
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
  }) {
    const trimmedQuery = query.trim();
    const effectiveVaultIds: string[] =
      vaultIds && vaultIds.length > 0 ? vaultIds : vaultId ? [vaultId] : [];
    const normalizedTagIds = normalizeTagIds(tagId, tagIds);
    const normalizedDateFrom = toSqlDateBoundary(dateFrom ?? null, 'start');
    const normalizedDateTo = toSqlDateBoundary(dateTo ?? null, 'end');

    if (effectiveVaultIds.length === 0) {
      return createEmptyResponse({
        query: trimmedQuery,
        pageIndex,
        pageSize,
        vaultId,
        tagIds: normalizedTagIds,
        dateFrom,
        dateTo,
        sortBy,
        includeVersions,
      });
    }

    const offset = pageIndex * pageSize;
    const vaultIdListSql = sql.join(
      effectiveVaultIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const tagIdListSql =
      normalizedTagIds.length > 0
        ? sql.join(
            normalizedTagIds.map((id) => sql`${id}`),
            sql`, `,
          )
        : null;
    const tagFilterSql =
      normalizedTagIds.length > 0
        ? sql`EXISTS (
            SELECT 1
            FROM document_tags AS dt
            WHERE dt.document_id = d.id
              AND dt.tag_id IN (${tagIdListSql})
          )`
        : sql`TRUE`;
    const effectiveCreatedAtSql = sql.raw('d.created_at');
    const versionScopeFilterSql =
      includeVersions === 'historical' ? sql`TRUE` : sql`dv.id = d.current_version_id`;

    if (trimmedQuery.length === 0) {
      const countResult = await db.execute<CountRow>(sql`
        SELECT count(*)::int AS results_count
        FROM documents AS d
        INNER JOIN document_versions AS dv
          ON dv.document_id = d.id
          AND dv.vault_id = d.vault_id
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND dv.deleted_at IS NULL
          AND dv.processing_status = 'completed'
          AND ${versionScopeFilterSql}
          AND ${tagFilterSql}
          AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveCreatedAtSql} >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveCreatedAtSql} <= ${normalizedDateTo})
      `);

      const resultsCount = countResult.rows[0]?.results_count ?? 0;

      if (resultsCount === 0) {
        return createEmptyResponse({
          query: trimmedQuery,
          pageIndex,
          pageSize,
          vaultId,
          tagIds: normalizedTagIds,
          dateFrom,
          dateTo,
          sortBy,
          includeVersions,
        });
      }

      const browseResult = await db.execute<SearchRow>(sql`
        SELECT
          d.vault_id,
          v.name AS vault_name,
          d.id AS document_id,
          dv.id AS document_version_id,
          dv.version_number,
          d.name,
          dv.original_name,
          dv.original_size,
          dv.mime_type,
          d.created_at,
          d.updated_at,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', t.id,
                  'name', t.name,
                  'color', t.color
                )
                ORDER BY t.name ASC
              ),
              '[]'::json
            )::text
            FROM document_tags AS dt_all
            INNER JOIN tags AS t ON t.id = dt_all.tag_id
            WHERE dt_all.document_id = d.id
          ) AS tags_json,
          0::int AS matched_chunks_count,
          NULL::int AS chunk_index,
          NULL::text AS chunk_type,
          NULL::int AS page_number,
          NULL::text AS chunk_content,
          NULL::text AS snippet,
          NULL::float8 AS score,
          NULL::boolean AS fulltext_match,
          NULL::int AS substring_position,
          NULL::boolean AS title_match,
          NULL::text AS match_type
        FROM documents AS d
        INNER JOIN vaults AS v ON v.id = d.vault_id
        INNER JOIN document_versions AS dv
          ON dv.document_id = d.id
          AND dv.vault_id = d.vault_id
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND dv.deleted_at IS NULL
          AND dv.processing_status = 'completed'
          AND ${versionScopeFilterSql}
          AND ${tagFilterSql}
          AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveCreatedAtSql} >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveCreatedAtSql} <= ${normalizedDateTo})
        ORDER BY ${getBrowseOrderSql(sortBy)}, dv.version_number DESC
        LIMIT ${pageSize}
        OFFSET ${offset}
      `);

      const results = browseResult.rows.map(mapSearchRow);

      return {
        query: trimmedQuery,
        pageIndex,
        pageSize,
        results,
        resultsCount,
        filters: {
          vaultId: vaultId ?? null,
          tagId: normalizedTagIds[0] ?? null,
          tagIds: normalizedTagIds,
          dateFrom: toIsoString(normalizedDateFrom),
          dateTo: toIsoString(normalizedDateTo),
          sortBy,
          includeVersions,
        },
      };
    }

    if (searchMode === 'hybrid') {
      const hybridResult = await searchDocumentsWithHybrid({
        vaultId,
        effectiveVaultIds,
        trimmedQuery,
        pageIndex,
        pageSize,
        normalizedTagIds,
        normalizedDateFrom,
        normalizedDateTo,
        sortBy,
        includeVersions,
      });

      if (hybridResult !== null) {
        return hybridResult;
      }
    }

    const ilikePattern = `%${trimmedQuery}%`;
    const headlineOptions =
      'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=5';

    const countResult = await db.execute<CountRow>(sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
      ),
      matched_documents AS (
        SELECT DISTINCT document_id, document_version_id
        FROM (
          SELECT dc.document_id, dc.document_version_id
          FROM document_chunks AS dc
          CROSS JOIN search_query
          INNER JOIN documents AS d ON d.id = dc.document_id
          INNER JOIN document_versions AS dv
            ON dv.id = dc.document_version_id
            AND dv.document_id = d.id
            AND dv.vault_id = d.vault_id
          WHERE dc.vault_id IN (${vaultIdListSql})
            AND d.vault_id IN (${vaultIdListSql})
            AND d.is_deleted = false
            AND dv.deleted_at IS NULL
            AND dv.processing_status = 'completed'
            AND ${versionScopeFilterSql}
            AND ${tagFilterSql}
            AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveCreatedAtSql} >= ${normalizedDateFrom})
            AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveCreatedAtSql} <= ${normalizedDateTo})
            AND (
              dc.tsv @@ search_query.query
              OR dc.content ILIKE ${ilikePattern}
            )

          UNION

          SELECT d.id AS document_id, dv.id AS document_version_id
          FROM documents AS d
          CROSS JOIN search_query
          INNER JOIN document_versions AS dv
            ON dv.document_id = d.id
            AND dv.vault_id = d.vault_id
          WHERE d.vault_id IN (${vaultIdListSql})
            AND d.is_deleted = false
            AND dv.deleted_at IS NULL
            AND dv.processing_status = 'completed'
            AND ${versionScopeFilterSql}
            AND ${tagFilterSql}
            AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveCreatedAtSql} >= ${normalizedDateFrom})
            AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveCreatedAtSql} <= ${normalizedDateTo})
            AND (
              d.name ILIKE ${ilikePattern}
              OR dv.original_name ILIKE ${ilikePattern}
            )
        ) AS matched_sources
      )
      SELECT count(*)::int AS results_count
      FROM matched_documents
    `);

    const resultsCount = countResult.rows[0]?.results_count ?? 0;

    if (resultsCount === 0) {
      return createEmptyResponse({
        query: trimmedQuery,
        pageIndex,
        pageSize,
        vaultId,
        tagIds: normalizedTagIds,
        dateFrom,
        dateTo,
        sortBy,
        includeVersions,
      });
    }

    const searchResult = await db.execute<SearchRow>(sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
      ),
      matched_sources AS (
        SELECT
          dc.vault_id,
          dc.document_id,
          dc.document_version_id,
          dc.chunk_index,
          dc.chunk_type,
          dc.page_number,
          dc.content AS chunk_content,
          dc.tsv @@ search_query.query AS fulltext_match,
          nullif(position(lower(${trimmedQuery}) in lower(dc.content)), 0)::int AS substring_position,
          CASE
            WHEN dc.tsv @@ search_query.query THEN ts_headline('english', dc.content, search_query.query, ${headlineOptions})
            ELSE
              concat(
                CASE
                  WHEN nullif(position(lower(${trimmedQuery}) in lower(dc.content)), 0)::int > 36 THEN '…'
                  ELSE ''
                END,
                replace(
                  substring(
                    dc.content
                    FROM greatest(nullif(position(lower(${trimmedQuery}) in lower(dc.content)), 0)::int - 35, 1)
                    FOR char_length(${trimmedQuery}) + 70
                  ),
                  substring(
                    dc.content
                    FROM nullif(position(lower(${trimmedQuery}) in lower(dc.content)), 0)::int
                    FOR char_length(${trimmedQuery})
                  ),
                  concat(
                    '<mark>',
                    substring(
                      dc.content
                      FROM nullif(position(lower(${trimmedQuery}) in lower(dc.content)), 0)::int
                      FOR char_length(${trimmedQuery})
                    ),
                    '</mark>'
                  )
                ),
                CASE
                  WHEN nullif(position(lower(${trimmedQuery}) in lower(dc.content)), 0)::int + char_length(${trimmedQuery}) + 35 < char_length(dc.content) THEN '…'
                  ELSE ''
                END
              )
          END AS snippet,
          CASE
            WHEN dc.tsv @@ search_query.query THEN ts_rank_cd(dc.tsv, search_query.query)::float8
            ELSE 0.05
          END AS score,
          'keyword'::text AS match_type
        FROM document_chunks AS dc
        CROSS JOIN search_query
        INNER JOIN documents AS d ON d.id = dc.document_id
        INNER JOIN document_versions AS dv
          ON dv.id = dc.document_version_id
          AND dv.document_id = d.id
          AND dv.vault_id = d.vault_id
        WHERE dc.vault_id IN (${vaultIdListSql})
          AND d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND dv.deleted_at IS NULL
          AND dv.processing_status = 'completed'
          AND ${versionScopeFilterSql}
          AND (
            dc.tsv @@ search_query.query
            OR dc.content ILIKE ${ilikePattern}
          )

        UNION ALL

        SELECT
          d.vault_id,
          d.id AS document_id,
          dv.id AS document_version_id,
          NULL::int AS chunk_index,
          'title'::text AS chunk_type,
          NULL::int AS page_number,
          d.name AS chunk_content,
          FALSE AS fulltext_match,
          nullif(position(lower(${trimmedQuery}) in lower(d.name)), 0)::int AS substring_position,
          CASE
            WHEN d.name ILIKE ${ilikePattern}
              THEN replace(
                d.name,
                substring(
                  d.name
                  FROM nullif(position(lower(${trimmedQuery}) in lower(d.name)), 0)::int
                  FOR char_length(${trimmedQuery})
                ),
                concat(
                  '<mark>',
                  substring(
                    d.name
                    FROM nullif(position(lower(${trimmedQuery}) in lower(d.name)), 0)::int
                    FOR char_length(${trimmedQuery})
                  ),
                  '</mark>'
                )
              )
            ELSE replace(
              dv.original_name,
              substring(
                dv.original_name
                FROM nullif(position(lower(${trimmedQuery}) in lower(dv.original_name)), 0)::int
                FOR char_length(${trimmedQuery})
              ),
              concat(
                '<mark>',
                substring(
                  dv.original_name
                  FROM nullif(position(lower(${trimmedQuery}) in lower(dv.original_name)), 0)::int
                  FOR char_length(${trimmedQuery})
                ),
                '</mark>'
              )
            )
          END AS snippet,
          1.2::float8 AS score,
          'title'::text AS match_type
        FROM documents AS d
        INNER JOIN document_versions AS dv
          ON dv.document_id = d.id
          AND dv.vault_id = d.vault_id
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND dv.deleted_at IS NULL
          AND dv.processing_status = 'completed'
          AND ${versionScopeFilterSql}
          AND (
            d.name ILIKE ${ilikePattern}
            OR dv.original_name ILIKE ${ilikePattern}
          )
      ),
      ranked_results AS (
        SELECT
          d.vault_id,
          v.name AS vault_name,
          d.id AS document_id,
          dv.id AS document_version_id,
          dv.version_number,
          d.name,
          dv.original_name,
          dv.original_size,
          dv.mime_type,
          d.created_at,
          d.updated_at,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', t.id,
                  'name', t.name,
                  'color', t.color
                )
                ORDER BY t.name ASC
              ),
              '[]'::json
            )::text
            FROM document_tags AS dt_all
            INNER JOIN tags AS t ON t.id = dt_all.tag_id
            WHERE dt_all.document_id = d.id
          ) AS tags_json,
          count(*) OVER (PARTITION BY d.id, dv.id)::int AS matched_chunks_count,
          mc.chunk_index,
          mc.chunk_type,
          mc.page_number,
          mc.chunk_content,
          mc.snippet,
          mc.score,
          mc.fulltext_match,
          mc.substring_position,
          mc.match_type,
          mc.chunk_type = 'title' AS title_match,
          row_number() OVER (
            PARTITION BY d.id, dv.id
            ORDER BY (mc.chunk_type = 'title') DESC, mc.fulltext_match DESC, mc.score DESC, mc.substring_position ASC NULLS LAST, mc.chunk_index ASC NULLS LAST
          )::int AS rank_in_document
        FROM matched_sources AS mc
        INNER JOIN documents AS d ON d.id = mc.document_id
        INNER JOIN document_versions AS dv
          ON dv.id = mc.document_version_id
          AND dv.document_id = d.id
          AND dv.vault_id = d.vault_id
        INNER JOIN vaults AS v ON v.id = d.vault_id
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND dv.deleted_at IS NULL
          AND dv.processing_status = 'completed'
          AND ${versionScopeFilterSql}
          AND ${tagFilterSql}
          AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveCreatedAtSql} >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveCreatedAtSql} <= ${normalizedDateTo})
      )
      SELECT
        vault_id,
        vault_name,
        document_id,
        document_version_id,
        version_number,
        name,
        original_name,
        original_size,
        mime_type,
        created_at,
        updated_at,
        tags_json,
        matched_chunks_count,
        chunk_index,
        chunk_type,
        page_number,
        chunk_content,
        snippet,
        score,
        fulltext_match,
        substring_position,
        title_match,
        match_type
      FROM ranked_results
      WHERE rank_in_document = 1
      ORDER BY ${getSearchOrderSql(sortBy)}
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);

    const results = searchResult.rows.map(mapSearchRow);

    return {
      query: trimmedQuery,
      pageIndex,
      pageSize,
      results,
      resultsCount,
      filters: {
        vaultId: vaultId ?? null,
        tagId: normalizedTagIds[0] ?? null,
        tagIds: normalizedTagIds,
        dateFrom: toIsoString(normalizedDateFrom),
        dateTo: toIsoString(normalizedDateTo),
        sortBy,
        includeVersions,
      },
    };
  }

  async function searchDocumentsWithHybrid({
    vaultId,
    effectiveVaultIds,
    trimmedQuery,
    pageIndex,
    pageSize,
    normalizedTagIds,
    normalizedDateFrom,
    normalizedDateTo,
    sortBy,
    includeVersions,
  }: {
    vaultId?: string;
    effectiveVaultIds: string[];
    trimmedQuery: string;
    pageIndex: number;
    pageSize: number;
    normalizedTagIds: string[];
    normalizedDateFrom: Date | null;
    normalizedDateTo: Date | null;
    sortBy: SearchSortBy;
    includeVersions: SearchVersionMode;
  }) {
    const queryEmbedding = await embedQuery(trimmedQuery);

    if (queryEmbedding === null) {
      return null;
    }

    const offset = pageIndex * pageSize;
    const ilikePattern = `%${trimmedQuery}%`;
    const headlineOptions =
      'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=5';
    const vaultIdListSql = sql.join(
      effectiveVaultIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const tagIdListSql =
      normalizedTagIds.length > 0
        ? sql.join(
            normalizedTagIds.map((id) => sql`${id}`),
            sql`, `,
          )
        : null;
    const tagFilterSql =
      normalizedTagIds.length > 0
        ? sql`EXISTS (
            SELECT 1
            FROM document_tags AS dt
            WHERE dt.document_id = d.id
              AND dt.tag_id IN (${tagIdListSql})
          )`
        : sql`TRUE`;
    const effectiveCreatedAtSql = sql.raw('d.created_at');
    const versionScopeFilterSql =
      includeVersions === 'historical' ? sql`TRUE` : sql`dv.id = d.current_version_id`;

    const searchResult = await db.execute<SearchRow>(sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
      ),
      scoped_document_versions AS (
        SELECT
          d.vault_id,
          v.name AS vault_name,
          d.id AS document_id,
          dv.id AS document_version_id,
          dv.version_number,
          d.name,
          dv.original_name,
          dv.original_size,
          dv.mime_type,
          d.created_at,
          d.updated_at
        FROM documents AS d
        INNER JOIN vaults AS v ON v.id = d.vault_id
        INNER JOIN document_versions AS dv
          ON dv.document_id = d.id
          AND dv.vault_id = d.vault_id
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND dv.deleted_at IS NULL
          AND dv.processing_status = 'completed'
          AND ${versionScopeFilterSql}
          AND ${tagFilterSql}
          AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveCreatedAtSql} >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveCreatedAtSql} <= ${normalizedDateTo})
      ),
      keyword_candidates AS (
        SELECT
          dc.id,
          dc.tsv @@ search_query.query AS fulltext_match,
          nullif(position(lower(${trimmedQuery}) in lower(dc.content)), 0)::int AS substring_position,
          CASE
            WHEN dc.tsv @@ search_query.query THEN ts_rank_cd(dc.tsv, search_query.query)::float8
            ELSE 0.05
          END AS keyword_score,
          dc.chunk_index
        FROM document_chunks AS dc
        CROSS JOIN search_query
        INNER JOIN scoped_document_versions AS sd ON sd.document_version_id = dc.document_version_id
        WHERE dc.vault_id IN (${vaultIdListSql})
          AND (
            dc.tsv @@ search_query.query
            OR dc.content ILIKE ${ilikePattern}
          )
        ORDER BY fulltext_match DESC, keyword_score DESC, substring_position ASC NULLS LAST, dc.chunk_index ASC, dc.id ASC
        LIMIT ${HYBRID_DOCUMENT_CANDIDATE_LIMIT}
      ),
      keyword_ranked AS (
        SELECT
          id,
          fulltext_match,
          substring_position,
          row_number() OVER (
            ORDER BY fulltext_match DESC, keyword_score DESC, substring_position ASC NULLS LAST, chunk_index ASC, id ASC
          )::int AS keyword_rank
        FROM keyword_candidates
      ),
      vec_candidates AS (
        SELECT
          dc.id,
          1 - (dce.embedding <=> ${buildVectorLiteral(queryEmbedding.vector)}::vector) AS similarity,
          dc.chunk_index
        FROM document_chunk_embeddings AS dce
        INNER JOIN document_chunks AS dc ON dc.id = dce.chunk_id
        INNER JOIN scoped_document_versions AS sd ON sd.document_version_id = dc.document_version_id
        WHERE dce.embedding_index_id = ${queryEmbedding.index.id}
          AND dce.vault_id IN (${vaultIdListSql})
          AND dce.document_version_id = sd.document_version_id
        ORDER BY dce.embedding <=> ${buildVectorLiteral(queryEmbedding.vector)}::vector ASC, dc.chunk_index ASC, dc.id ASC
        LIMIT ${HYBRID_DOCUMENT_CANDIDATE_LIMIT}
      ),
      vec_ranked AS (
        SELECT
          id,
          similarity,
          row_number() OVER (ORDER BY similarity DESC, chunk_index ASC, id ASC)::int AS vec_rank
        FROM vec_candidates
      ),
      ranked_chunks AS (
        SELECT
          COALESCE(keyword_ranked.id, vec_ranked.id) AS id,
          COALESCE(keyword_ranked.fulltext_match, false) AS fulltext_match,
          keyword_ranked.substring_position,
          (
            COALESCE(1.0 / (60 + keyword_ranked.keyword_rank), 0)
            + COALESCE(1.0 / (60 + vec_ranked.vec_rank), 0)
          )::float8 AS score
        FROM keyword_ranked
        FULL OUTER JOIN vec_ranked ON vec_ranked.id = keyword_ranked.id
        WHERE keyword_ranked.id IS NOT NULL
          OR (
            vec_ranked.id IS NOT NULL
            AND vec_ranked.similarity >= ${HYBRID_DOCUMENT_MIN_SEMANTIC_SIMILARITY}
          )
      ),
      chunk_sources AS (
        SELECT
          dc.vault_id,
          dc.document_id,
          dc.document_version_id,
          dc.chunk_index,
          dc.chunk_type,
          COALESCE(dc.page_number, dc.page_start) AS page_number,
          dc.content AS chunk_content,
          ranked_chunks.fulltext_match,
          ranked_chunks.substring_position,
          CASE
            WHEN ranked_chunks.fulltext_match THEN ts_headline('english', dc.content, search_query.query, ${headlineOptions})
            WHEN ranked_chunks.substring_position IS NOT NULL THEN
              concat(
                CASE
                  WHEN ranked_chunks.substring_position > 36 THEN '…'
                  ELSE ''
                END,
                replace(
                  substring(
                    dc.content
                    FROM greatest(ranked_chunks.substring_position - 35, 1)
                    FOR char_length(${trimmedQuery}) + 70
                  ),
                  substring(
                    dc.content
                    FROM ranked_chunks.substring_position
                    FOR char_length(${trimmedQuery})
                  ),
                  concat(
                    '<mark>',
                    substring(
                      dc.content
                      FROM ranked_chunks.substring_position
                      FOR char_length(${trimmedQuery})
                    ),
                    '</mark>'
                  )
                ),
                CASE
                  WHEN ranked_chunks.substring_position + char_length(${trimmedQuery}) + 35 < char_length(dc.content) THEN '…'
                  ELSE ''
                END
              )
            ELSE
              CASE
                WHEN char_length(regexp_replace(COALESCE(NULLIF(dc.original_text, ''), dc.content), '[[:space:]]+', ' ', 'g')) > ${HYBRID_DOCUMENT_EXCERPT_LENGTH}
                  THEN concat(
                    substring(
                      regexp_replace(COALESCE(NULLIF(dc.original_text, ''), dc.content), '[[:space:]]+', ' ', 'g')
                      FROM 1
                      FOR ${HYBRID_DOCUMENT_EXCERPT_LENGTH}
                    ),
                    '…'
                  )
                ELSE regexp_replace(COALESCE(NULLIF(dc.original_text, ''), dc.content), '[[:space:]]+', ' ', 'g')
              END
          END AS snippet,
          ranked_chunks.score,
          CASE
            WHEN ranked_chunks.fulltext_match OR ranked_chunks.substring_position IS NOT NULL THEN 'keyword'
            ELSE 'semantic'
          END::text AS match_type,
          false AS title_match
        FROM ranked_chunks
        INNER JOIN document_chunks AS dc ON dc.id = ranked_chunks.id
        CROSS JOIN search_query
      ),
      title_sources AS (
        SELECT
          sd.vault_id,
          sd.document_id,
          sd.document_version_id,
          NULL::int AS chunk_index,
          'title'::text AS chunk_type,
          NULL::int AS page_number,
          sd.name AS chunk_content,
          FALSE AS fulltext_match,
          nullif(position(lower(${trimmedQuery}) in lower(sd.name)), 0)::int AS substring_position,
          CASE
            WHEN sd.name ILIKE ${ilikePattern}
              THEN replace(
                sd.name,
                substring(
                  sd.name
                  FROM nullif(position(lower(${trimmedQuery}) in lower(sd.name)), 0)::int
                  FOR char_length(${trimmedQuery})
                ),
                concat(
                  '<mark>',
                  substring(
                    sd.name
                    FROM nullif(position(lower(${trimmedQuery}) in lower(sd.name)), 0)::int
                    FOR char_length(${trimmedQuery})
                  ),
                  '</mark>'
                )
              )
            ELSE replace(
              sd.original_name,
              substring(
                sd.original_name
                FROM nullif(position(lower(${trimmedQuery}) in lower(sd.original_name)), 0)::int
                FOR char_length(${trimmedQuery})
              ),
              concat(
                '<mark>',
                substring(
                  sd.original_name
                  FROM nullif(position(lower(${trimmedQuery}) in lower(sd.original_name)), 0)::int
                  FOR char_length(${trimmedQuery})
                ),
                '</mark>'
              )
            )
          END AS snippet,
          1.2::float8 AS score,
          'title'::text AS match_type,
          true AS title_match
        FROM scoped_document_versions AS sd
        WHERE sd.name ILIKE ${ilikePattern}
          OR sd.original_name ILIKE ${ilikePattern}
      ),
      matched_sources AS (
        SELECT * FROM chunk_sources
        UNION ALL
        SELECT * FROM title_sources
      ),
      ranked_results AS (
        SELECT
          sd.vault_id,
          sd.vault_name,
          sd.document_id,
          sd.document_version_id,
          sd.version_number,
          sd.name,
          sd.original_name,
          sd.original_size,
          sd.mime_type,
          sd.created_at,
          sd.updated_at,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', t.id,
                  'name', t.name,
                  'color', t.color
                )
                ORDER BY t.name ASC
              ),
              '[]'::json
            )::text
            FROM document_tags AS dt_all
            INNER JOIN tags AS t ON t.id = dt_all.tag_id
            WHERE dt_all.document_id = sd.document_id
          ) AS tags_json,
          count(*) OVER (PARTITION BY sd.document_id, sd.document_version_id)::int AS matched_chunks_count,
          matched_sources.chunk_index,
          matched_sources.chunk_type,
          matched_sources.page_number,
          matched_sources.chunk_content,
          matched_sources.snippet,
          matched_sources.score,
          matched_sources.fulltext_match,
          matched_sources.substring_position,
          matched_sources.title_match,
          matched_sources.match_type,
          row_number() OVER (
            PARTITION BY sd.document_id, sd.document_version_id
            ORDER BY
              matched_sources.title_match DESC,
              (matched_sources.match_type = 'keyword') DESC,
              matched_sources.score DESC,
              matched_sources.fulltext_match DESC,
              matched_sources.substring_position ASC NULLS LAST,
              matched_sources.chunk_index ASC NULLS LAST
          )::int AS rank_in_document
        FROM matched_sources
        INNER JOIN scoped_document_versions AS sd
          ON sd.document_id = matched_sources.document_id
          AND sd.document_version_id = matched_sources.document_version_id
      ),
      document_results AS (
        SELECT
          *,
          count(*) OVER ()::int AS results_count
        FROM ranked_results
        WHERE rank_in_document = 1
      )
      SELECT
        vault_id,
        vault_name,
        document_id,
        document_version_id,
        version_number,
        name,
        original_name,
        original_size,
        mime_type,
        created_at,
        updated_at,
        tags_json,
        matched_chunks_count,
        chunk_index,
        chunk_type,
        page_number,
        chunk_content,
        snippet,
        score,
        fulltext_match,
        substring_position,
        title_match,
        match_type,
        results_count
      FROM document_results
      ORDER BY ${getHybridSearchOrderSql(sortBy)}
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);

    const resultsCount = searchResult.rows[0]?.results_count ?? 0;

    if (resultsCount === 0) {
      return createEmptyResponse({
        query: trimmedQuery,
        pageIndex,
        pageSize,
        vaultId,
        tagIds: normalizedTagIds,
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        sortBy,
        includeVersions,
      });
    }

    return {
      query: trimmedQuery,
      pageIndex,
      pageSize,
      results: searchResult.rows.map(mapSearchRow),
      resultsCount,
      filters: {
        vaultId: vaultId ?? null,
        tagId: normalizedTagIds[0] ?? null,
        tagIds: normalizedTagIds,
        dateFrom: toIsoString(normalizedDateFrom),
        dateTo: toIsoString(normalizedDateTo),
        sortBy,
        includeVersions,
      },
    };
  }

  async function searchHybrid({
    vaultId,
    vaultIds,
    documentId,
    documentVersionIds,
    query,
    limit,
    candidateLimit,
    mode = 'hybrid',
  }: {
    vaultId?: string;
    vaultIds?: string[];
    documentId?: string;
    documentVersionIds?: string[];
    query: string;
    limit: number;
    candidateLimit?: number;
    mode?: HybridSearchMode;
  }) {
    const trimmedQuery = query.trim();
    const normalizedLimit = Math.min(Math.max(limit, 1), 50);
    const normalizedCandidateLimit = Math.min(
      Math.max(candidateLimit ?? HYBRID_CITATION_DEFAULT_CANDIDATE_LIMIT, normalizedLimit, 1),
      HYBRID_CITATION_MAX_CANDIDATE_LIMIT,
    );
    const scopedVaultIds = [
      ...new Set(
        [...(vaultId ? [vaultId] : []), ...(vaultIds ?? [])]
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    const scopedDocumentVersionIds = [
      ...new Set((documentVersionIds ?? []).map((item) => item.trim()).filter(Boolean)),
    ];
    const scopedVaultIdList = sql.join(
      scopedVaultIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const scopedDocumentVersionIdList =
      scopedDocumentVersionIds.length > 0
        ? sql.join(
            scopedDocumentVersionIds.map((id) => sql`${id}`),
            sql`, `,
          )
        : null;
    const hybridVersionScopeSql =
      scopedDocumentVersionIds.length > 0
        ? sql`dc.document_version_id IN (${scopedDocumentVersionIdList})`
        : sql`dc.document_version_id = d.current_version_id`;

    if (trimmedQuery.length === 0 || scopedVaultIds.length === 0) {
      return {
        query: trimmedQuery,
        limit: normalizedLimit,
        mode,
        citations: [],
      };
    }

    let queryEmbedding: Awaited<ReturnType<typeof embedQuery>> = null;
    let effectiveMode: HybridSearchMode = mode;

    if (mode !== 'fts') {
      queryEmbedding = await embedQuery(trimmedQuery);
    }

    if (queryEmbedding === null) {
      effectiveMode = 'fts';
    }

    const result =
      queryEmbedding === null
        ? await db.execute<HybridSearchRow>(sql`
            WITH search_query AS (
              SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
            ),
            lexical_terms AS (
              SELECT term
              FROM (
                SELECT DISTINCT lower(term) AS term
                FROM regexp_split_to_table(${trimmedQuery}, '[^[:alnum:]]+') AS split(term)
                WHERE char_length(term) >= 3
              ) AS terms
              ORDER BY term ASC
              LIMIT ${HYBRID_CITATION_MAX_TERMS}
            ),
            lexical_query AS (
              SELECT websearch_to_tsquery(
                'english',
                COALESCE(string_agg(term, ' OR ' ORDER BY term ASC), '')
              ) AS query
              FROM lexical_terms
            ),
            fts_ranked AS (
              SELECT
                dc.id,
                row_number() OVER (
                  ORDER BY
                    GREATEST(
                      ts_rank_cd(dc.tsv, search_query.query),
                      ts_rank_cd(dc.tsv, lexical_query.query) * 0.35
                    ) DESC,
                    (dc.tsv @@ search_query.query) DESC,
                    dc.chunk_index ASC,
                    dc.id ASC
                )::int AS fts_rank
              FROM document_chunks AS dc
              CROSS JOIN search_query
              CROSS JOIN lexical_query
              INNER JOIN documents AS d ON d.id = dc.document_id
              INNER JOIN document_versions AS dv
                ON dv.id = dc.document_version_id
                AND dv.document_id = d.id
                AND dv.vault_id = d.vault_id
              WHERE dc.vault_id IN (${scopedVaultIdList})
                AND d.vault_id IN (${scopedVaultIdList})
                AND d.is_deleted = false
                AND dv.deleted_at IS NULL
                AND dv.processing_status = 'completed'
                AND ${hybridVersionScopeSql}
                AND (${documentId ?? null}::text IS NULL OR d.id = ${documentId ?? null})
                AND (
                  dc.tsv @@ search_query.query
                  OR dc.tsv @@ lexical_query.query
                )
              ORDER BY
                GREATEST(
                  ts_rank_cd(dc.tsv, search_query.query),
                  ts_rank_cd(dc.tsv, lexical_query.query) * 0.35
                ) DESC,
                (dc.tsv @@ search_query.query) DESC,
                dc.chunk_index ASC,
                dc.id ASC
              LIMIT ${normalizedCandidateLimit}
            )
            SELECT
              dc.id AS chunk_id,
              dc.metadata->>'retrievalRepresentation' AS retrieval_representation,
              dc.document_id,
              dc.document_version_id,
              dv.version_number,
              dc.vault_id,
              v.name AS vault_name,
              d.name AS document_name,
              dv.mime_type,
              dc.page_start,
              dc.page_end,
              dc.section,
              COALESCE(dc.section_path, '[]'::jsonb) AS section_path,
              COALESCE(dc.source_element_ids, '[]'::jsonb) AS source_element_ids,
              COALESCE(dc.metadata->'tableProvenance', '[]'::jsonb) AS table_source_element_ids,
              COALESCE(NULLIF(dc.original_text, ''), dc.content) AS snippet,
              CASE
                WHEN jsonb_array_length(COALESCE(provenance.bounding_boxes, '[]'::jsonb)) > 0
                  THEN provenance.bounding_boxes
                ELSE COALESCE(dc.bounding_boxes, '[]'::jsonb)
              END AS bounding_boxes,
              CASE
                WHEN jsonb_array_length(COALESCE(provenance.bounding_boxes, '[]'::jsonb)) > 0
                  THEN 'box'
                ELSE dc.citation_precision
              END AS citation_precision,
              COALESCE(dc.tables_html, '[]'::jsonb) AS tables_html,
              COALESCE(assets.image_asset_ids, '[]'::json) AS image_asset_ids,
              COALESCE(assets.image_assets, '[]'::json) AS image_assets,
              COALESCE(dc.metadata->'imageProvenance', '[]'::jsonb) AS image_provenance,
              dc.metadata->'textLocator' AS text_locator,
              (1.0 / (60 + fts_ranked.fts_rank))::float8 AS score
            FROM fts_ranked
            INNER JOIN document_chunks AS dc ON dc.id = fts_ranked.id
            INNER JOIN documents AS d ON d.id = dc.document_id
            INNER JOIN document_versions AS dv
              ON dv.id = dc.document_version_id
              AND dv.document_id = d.id
              AND dv.vault_id = d.vault_id
            INNER JOIN vaults AS v ON v.id = dc.vault_id
            LEFT JOIN LATERAL (
              SELECT COALESCE(
                json_agg(dca.id ORDER BY dca.created_at ASC) FILTER (WHERE dca.asset_type = 'image'),
                '[]'::json
              ) AS image_asset_ids,
              COALESCE(
                json_agg(
                  json_build_object(
                    'assetId', dca.id,
                    'sourceElementId', dca.source_element_id
                  )
                  ORDER BY dca.created_at ASC
                ) FILTER (WHERE dca.asset_type = 'image'),
                '[]'::json
              ) AS image_assets
              FROM document_chunk_assets AS dca
              WHERE dca.chunk_id = dc.id
                AND dca.vault_id = dc.vault_id
                AND dca.document_version_id = dc.document_version_id
            ) AS assets ON true
            LEFT JOIN LATERAL (
              SELECT COALESCE(
                jsonb_agg(dep.bbox ORDER BY dep.sort_index) FILTER (WHERE dep.bbox IS NOT NULL),
                '[]'::jsonb
              ) AS bounding_boxes
              FROM document_element_provenance AS dep
              WHERE dep.document_version_id = dc.document_version_id
                AND dep.element_id IN (
                  SELECT source_element_id
                  FROM jsonb_array_elements_text(COALESCE(dc.source_element_ids, '[]'::jsonb))
                    AS source(source_element_id)
                )
            ) AS provenance ON true
            ORDER BY score DESC, dc.chunk_index ASC, dc.id ASC
            LIMIT ${normalizedCandidateLimit}
          `)
        : await db.execute<HybridSearchRow>(sql`
            WITH search_query AS (
              SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
            ),
            lexical_terms AS (
              SELECT term
              FROM (
                SELECT DISTINCT lower(term) AS term
                FROM regexp_split_to_table(${trimmedQuery}, '[^[:alnum:]]+') AS split(term)
                WHERE char_length(term) >= 3
              ) AS terms
              ORDER BY term ASC
              LIMIT ${HYBRID_CITATION_MAX_TERMS}
            ),
            lexical_query AS (
              SELECT websearch_to_tsquery(
                'english',
                COALESCE(string_agg(term, ' OR ' ORDER BY term ASC), '')
              ) AS query
              FROM lexical_terms
            ),
            fts_candidates AS (
              SELECT
                dc.id,
                GREATEST(
                  ts_rank_cd(dc.tsv, search_query.query),
                  ts_rank_cd(dc.tsv, lexical_query.query) * 0.35
                ) AS rank,
                dc.tsv @@ search_query.query AS strict_match,
                dc.chunk_index
              FROM document_chunks AS dc
              CROSS JOIN search_query
              CROSS JOIN lexical_query
              INNER JOIN documents AS d ON d.id = dc.document_id
              INNER JOIN document_versions AS dv
                ON dv.id = dc.document_version_id
                AND dv.document_id = d.id
                AND dv.vault_id = d.vault_id
              WHERE dc.vault_id IN (${scopedVaultIdList})
                AND d.vault_id IN (${scopedVaultIdList})
                AND d.is_deleted = false
                AND dv.deleted_at IS NULL
                AND dv.processing_status = 'completed'
                AND ${hybridVersionScopeSql}
                AND (${documentId ?? null}::text IS NULL OR d.id = ${documentId ?? null})
                AND (
                  dc.tsv @@ search_query.query
                  OR dc.tsv @@ lexical_query.query
                )
              ORDER BY rank DESC, strict_match DESC, dc.chunk_index ASC, dc.id ASC
              LIMIT ${normalizedCandidateLimit}
            ),
            fts_ranked AS (
              SELECT
                id,
                row_number() OVER (
                  ORDER BY rank DESC, strict_match DESC, chunk_index ASC, id ASC
                )::int AS fts_rank
              FROM fts_candidates
            ),
            vec_candidates AS (
              SELECT
                dc.id,
                1 - (dce.embedding <=> ${buildVectorLiteral(queryEmbedding.vector)}::vector) AS similarity
              FROM document_chunk_embeddings AS dce
              INNER JOIN document_chunks AS dc ON dc.id = dce.chunk_id
              INNER JOIN documents AS d ON d.id = dc.document_id
              INNER JOIN document_versions AS dv
                ON dv.id = dc.document_version_id
                AND dv.document_id = d.id
                AND dv.vault_id = d.vault_id
              WHERE dce.embedding_index_id = ${queryEmbedding.index.id}
                AND dce.vault_id IN (${scopedVaultIdList})
                AND dce.document_version_id = dc.document_version_id
                AND d.vault_id IN (${scopedVaultIdList})
                AND d.is_deleted = false
                AND dv.deleted_at IS NULL
                AND dv.processing_status = 'completed'
                AND ${hybridVersionScopeSql}
                AND (${documentId ?? null}::text IS NULL OR d.id = ${documentId ?? null})
              ORDER BY dce.embedding <=> ${buildVectorLiteral(queryEmbedding.vector)}::vector ASC, dc.chunk_index ASC, dc.id ASC
              LIMIT ${normalizedCandidateLimit}
            ),
            vec_ranked AS (
              SELECT
                id,
                row_number() OVER (ORDER BY similarity DESC, id ASC)::int AS vec_rank
              FROM vec_candidates
            ),
            ranked AS (
              SELECT
                COALESCE(fts_ranked.id, vec_ranked.id) AS id,
                COALESCE(1.0 / (60 + fts_ranked.fts_rank), 0)
                + COALESCE(1.0 / (60 + vec_ranked.vec_rank), 0) AS score
              FROM fts_ranked
              FULL OUTER JOIN vec_ranked ON vec_ranked.id = fts_ranked.id
            )
            SELECT
              dc.id AS chunk_id,
              dc.metadata->>'retrievalRepresentation' AS retrieval_representation,
              dc.document_id,
              dc.document_version_id,
              dv.version_number,
              dc.vault_id,
              v.name AS vault_name,
              d.name AS document_name,
              dv.mime_type,
              dc.page_start,
              dc.page_end,
              dc.section,
              COALESCE(dc.section_path, '[]'::jsonb) AS section_path,
              COALESCE(dc.source_element_ids, '[]'::jsonb) AS source_element_ids,
              COALESCE(dc.metadata->'tableProvenance', '[]'::jsonb) AS table_source_element_ids,
              COALESCE(NULLIF(dc.original_text, ''), dc.content) AS snippet,
              CASE
                WHEN jsonb_array_length(COALESCE(provenance.bounding_boxes, '[]'::jsonb)) > 0
                  THEN provenance.bounding_boxes
                ELSE COALESCE(dc.bounding_boxes, '[]'::jsonb)
              END AS bounding_boxes,
              CASE
                WHEN jsonb_array_length(COALESCE(provenance.bounding_boxes, '[]'::jsonb)) > 0
                  THEN 'box'
                ELSE dc.citation_precision
              END AS citation_precision,
              COALESCE(dc.tables_html, '[]'::jsonb) AS tables_html,
              COALESCE(assets.image_asset_ids, '[]'::json) AS image_asset_ids,
              COALESCE(assets.image_assets, '[]'::json) AS image_assets,
              COALESCE(dc.metadata->'imageProvenance', '[]'::jsonb) AS image_provenance,
              dc.metadata->'textLocator' AS text_locator,
              ranked.score::float8 AS score
            FROM ranked
            INNER JOIN document_chunks AS dc ON dc.id = ranked.id
            INNER JOIN documents AS d ON d.id = dc.document_id
            INNER JOIN document_versions AS dv
              ON dv.id = dc.document_version_id
              AND dv.document_id = d.id
              AND dv.vault_id = d.vault_id
            INNER JOIN vaults AS v ON v.id = dc.vault_id
            LEFT JOIN LATERAL (
              SELECT COALESCE(
                json_agg(dca.id ORDER BY dca.created_at ASC) FILTER (WHERE dca.asset_type = 'image'),
                '[]'::json
              ) AS image_asset_ids,
              COALESCE(
                json_agg(
                  json_build_object(
                    'assetId', dca.id,
                    'sourceElementId', dca.source_element_id
                  )
                  ORDER BY dca.created_at ASC
                ) FILTER (WHERE dca.asset_type = 'image'),
                '[]'::json
              ) AS image_assets
              FROM document_chunk_assets AS dca
              WHERE dca.chunk_id = dc.id
                AND dca.vault_id = dc.vault_id
                AND dca.document_version_id = dc.document_version_id
            ) AS assets ON true
            LEFT JOIN LATERAL (
              SELECT COALESCE(
                jsonb_agg(dep.bbox ORDER BY dep.sort_index) FILTER (WHERE dep.bbox IS NOT NULL),
                '[]'::jsonb
              ) AS bounding_boxes
              FROM document_element_provenance AS dep
              WHERE dep.document_version_id = dc.document_version_id
                AND dep.element_id IN (
                  SELECT source_element_id
                  FROM jsonb_array_elements_text(COALESCE(dc.source_element_ids, '[]'::jsonb))
                    AS source(source_element_id)
                )
            ) AS provenance ON true
            ORDER BY ranked.score DESC, dc.chunk_index ASC, dc.id ASC
            LIMIT ${normalizedCandidateLimit}
          `);

    const titleTerms = extractHybridTitleTerms(trimmedQuery);
    const titleMatchCountSql = () =>
      sql.join(
        titleTerms.map(
          (term) =>
            sql`CASE WHEN lower(concat_ws(' ', d.name, dv.original_name)) LIKE ${`%${term}%`} THEN 1 ELSE 0 END`,
        ),
        sql` + `,
      );
    const titleRows =
      titleTerms.length === 0
        ? []
        : (
            await db.execute<HybridSearchRow>(sql`
              WITH title_scored AS (
                SELECT
                  dc.id AS chunk_id,
                  dc.document_id,
                  dc.document_version_id,
                  dc.vault_id,
                  dc.chunk_index,
                  (${titleMatchCountSql()})::int AS title_match_count
                FROM document_chunks AS dc
                INNER JOIN documents AS d ON d.id = dc.document_id
                INNER JOIN document_versions AS dv
                  ON dv.id = dc.document_version_id
                  AND dv.document_id = d.id
                  AND dv.vault_id = d.vault_id
                WHERE dc.vault_id IN (${scopedVaultIdList})
                  AND d.vault_id IN (${scopedVaultIdList})
                  AND d.is_deleted = false
                  AND dv.deleted_at IS NULL
                  AND dv.processing_status = 'completed'
                  AND ${hybridVersionScopeSql}
                  AND (${documentId ?? null}::text IS NULL OR d.id = ${documentId ?? null})
                  AND (${titleMatchCountSql()}) > 0
              ),
              title_first_chunks AS (
                SELECT DISTINCT ON (document_id, document_version_id)
                  chunk_id,
                  title_match_count
                FROM title_scored
                ORDER BY
                  document_id,
                  document_version_id,
                  title_match_count DESC,
                  chunk_index ASC,
                  chunk_id ASC
              )
              SELECT
                dc.id AS chunk_id,
                dc.metadata->>'retrievalRepresentation' AS retrieval_representation,
                dc.document_id,
                dc.document_version_id,
                dv.version_number,
                dc.vault_id,
                v.name AS vault_name,
                d.name AS document_name,
                dv.mime_type,
                dc.page_start,
                dc.page_end,
                dc.section,
                COALESCE(dc.section_path, '[]'::jsonb) AS section_path,
                COALESCE(dc.source_element_ids, '[]'::jsonb) AS source_element_ids,
                COALESCE(dc.metadata->'tableProvenance', '[]'::jsonb) AS table_source_element_ids,
                COALESCE(NULLIF(dc.original_text, ''), dc.content) AS snippet,
                CASE
                  WHEN jsonb_array_length(COALESCE(provenance.bounding_boxes, '[]'::jsonb)) > 0
                    THEN provenance.bounding_boxes
                  ELSE COALESCE(dc.bounding_boxes, '[]'::jsonb)
                END AS bounding_boxes,
                CASE
                  WHEN jsonb_array_length(COALESCE(provenance.bounding_boxes, '[]'::jsonb)) > 0
                    THEN 'box'
                  ELSE dc.citation_precision
                END AS citation_precision,
                COALESCE(dc.tables_html, '[]'::jsonb) AS tables_html,
                COALESCE(assets.image_asset_ids, '[]'::json) AS image_asset_ids,
                COALESCE(assets.image_assets, '[]'::json) AS image_assets,
                COALESCE(dc.metadata->'imageProvenance', '[]'::jsonb) AS image_provenance,
                dc.metadata->'textLocator' AS text_locator,
                (
                  ${HYBRID_TITLE_MATCH_BASE_SCORE}::float8
                  + title_first_chunks.title_match_count::float8
                    * ${HYBRID_TITLE_MATCH_TERM_SCORE}::float8
                )::float8 AS score
              FROM title_first_chunks
              INNER JOIN document_chunks AS dc ON dc.id = title_first_chunks.chunk_id
              INNER JOIN documents AS d ON d.id = dc.document_id
              INNER JOIN document_versions AS dv
                ON dv.id = dc.document_version_id
                AND dv.document_id = d.id
                AND dv.vault_id = d.vault_id
              INNER JOIN vaults AS v ON v.id = dc.vault_id
              LEFT JOIN LATERAL (
                SELECT COALESCE(
                  json_agg(dca.id ORDER BY dca.created_at ASC) FILTER (WHERE dca.asset_type = 'image'),
                  '[]'::json
                ) AS image_asset_ids,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'assetId', dca.id,
                      'sourceElementId', dca.source_element_id
                    )
                    ORDER BY dca.created_at ASC
                  ) FILTER (WHERE dca.asset_type = 'image'),
                  '[]'::json
                ) AS image_assets
                FROM document_chunk_assets AS dca
                WHERE dca.chunk_id = dc.id
                  AND dca.vault_id = dc.vault_id
                  AND dca.document_version_id = dc.document_version_id
              ) AS assets ON true
              LEFT JOIN LATERAL (
                SELECT COALESCE(
                  jsonb_agg(dep.bbox ORDER BY dep.sort_index) FILTER (WHERE dep.bbox IS NOT NULL),
                  '[]'::jsonb
                ) AS bounding_boxes
                FROM document_element_provenance AS dep
                WHERE dep.document_version_id = dc.document_version_id
                  AND dep.element_id IN (
                    SELECT source_element_id
                    FROM jsonb_array_elements_text(COALESCE(dc.source_element_ids, '[]'::jsonb))
                      AS source(source_element_id)
                  )
              ) AS provenance ON true
              ORDER BY score DESC, dc.chunk_index ASC, dc.id ASC
              LIMIT ${normalizedCandidateLimit}
            `)
          ).rows;

    const mergedRows = diversifyHybridSearchRows(
      mergeHybridSearchRows(result.rows, titleRows, normalizedCandidateLimit),
      normalizedLimit,
    );

    const citations: Citation[] = mergedRows.map((row) => {
      const tablesHtml = parseStringArray(row.tables_html);
      const parsedImageAssets = parseImageAssets(row.image_assets);
      const imageAssetIds =
        parsedImageAssets.length > 0
          ? parsedImageAssets.map((asset) => asset.assetId)
          : parseStringArray(row.image_asset_ids);
      const imageAssets = mergeImageAssetsWithProvenance({
        imageAssets: parsedImageAssets,
        imageAssetIds,
        imageProvenance: parseImageProvenance(row.image_provenance),
      });

      return {
        chunkId: row.chunk_id,
        retrievalRepresentation: row.retrieval_representation,
        documentId: row.document_id,
        documentVersionId: row.document_version_id,
        versionNumber: row.version_number,
        vaultId: row.vault_id,
        vaultName: row.vault_name,
        documentName: row.document_name,
        mimeType: row.mime_type,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        section: row.section,
        sectionPath: parseStringArray(row.section_path),
        sourceElementIds: parseStringArray(row.source_element_ids),
        tableSourceElementIds: parseAssetSourceElementIds(row.table_source_element_ids),
        snippet: row.snippet ?? '',
        boundingBoxes:
          parseCitationPrecision(row.citation_precision) === 'box'
            ? parseBoundingBoxes(row.bounding_boxes)
            : [],
        citationPrecision: parseCitationPrecision(row.citation_precision),
        assetType: inferAssetType({ tablesHtml, imageAssetIds }),
        tablesHtml,
        imageAssetIds,
        imageAssets,
        textLocator: parseTextLocator(row.text_locator),
        score: typeof row.score === 'number' ? row.score : Number(row.score ?? 0),
      };
    });

    return {
      query: trimmedQuery,
      limit: normalizedLimit,
      mode: effectiveMode,
      citations,
    };
  }

  return {
    name: 'database-pg-tsvector',
    searchDocuments,
    searchHybrid,
  };
}
