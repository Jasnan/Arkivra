import type { Database } from '../database/database.js';
import type { DocumentSearchServices, SearchResultItem, SearchResultTag, SearchSortBy } from './search.types.js';
import { sql } from 'drizzle-orm';

type SearchRow = {
  vault_id: string;
  vault_name: string;
  document_id: string;
  name: string;
  original_name: string;
  original_size: number;
  mime_type: string;
  document_date: Date | null;
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
};

type CountRow = {
  results_count: number;
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
        typeof item === 'object'
        && item !== null
        && typeof item.id === 'string'
        && typeof item.name === 'string'
        && (typeof item.color === 'string' || item.color === null)
      ) {
        return [{
          id: item.id,
          name: item.name,
          color: item.color,
        }];
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
  return [...new Set([
    ...(tagIds ?? []).map(item => item.trim()),
    ...(tagId ? [tagId.trim()] : []),
  ].filter(Boolean))];
}

function getEffectiveDocumentDateSql(alias: string) {
  return sql.raw(`COALESCE(${alias}.document_date, ${alias}.created_at)`);
}

function getBrowseOrderSql(sortBy: SearchSortBy) {
  switch (sortBy) {
    case 'document_date_asc':
      return sql`d.document_date ASC NULLS LAST, d.updated_at DESC, d.name ASC`;
    case 'updated_desc':
      return sql`d.updated_at DESC, d.document_date DESC NULLS LAST, d.name ASC`;
    case 'updated_asc':
      return sql`d.updated_at ASC, d.document_date ASC NULLS LAST, d.name ASC`;
    case 'name_asc':
      return sql`d.name ASC, d.updated_at DESC`;
    case 'name_desc':
      return sql`d.name DESC, d.updated_at DESC`;
    case 'document_date_desc':
    default:
      return sql`d.document_date DESC NULLS LAST, d.updated_at DESC, d.name ASC`;
  }
}

function getSearchOrderSql(sortBy: SearchSortBy) {
  switch (sortBy) {
    case 'document_date_asc':
      return sql`title_match DESC NULLS LAST, document_date ASC NULLS LAST, updated_at DESC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, name ASC`;
    case 'updated_desc':
      return sql`title_match DESC NULLS LAST, updated_at DESC, document_date DESC NULLS LAST, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, name ASC`;
    case 'updated_asc':
      return sql`title_match DESC NULLS LAST, updated_at ASC, document_date ASC NULLS LAST, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, name ASC`;
    case 'name_asc':
      return sql`title_match DESC NULLS LAST, name ASC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, updated_at DESC`;
    case 'name_desc':
      return sql`title_match DESC NULLS LAST, name DESC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, updated_at DESC`;
    case 'document_date_desc':
    default:
      return sql`title_match DESC NULLS LAST, document_date DESC NULLS LAST, updated_at DESC, fulltext_match DESC NULLS LAST, score DESC NULLS LAST, substring_position ASC NULLS LAST, name ASC`;
  }
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
}: {
  query: string;
  pageIndex: number;
  pageSize: number;
  vaultId?: string;
  tagIds: string[];
  dateFrom?: Date | null;
  dateTo?: Date | null;
  sortBy: SearchSortBy;
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
    },
  };
}

export function createDocumentSearchServices({ db }: { db: Database }): DocumentSearchServices {
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
    sortBy = 'document_date_desc',
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
  }) {
    const trimmedQuery = query.trim();
    const effectiveVaultIds: string[] = vaultIds && vaultIds.length > 0 ? vaultIds : vaultId ? [vaultId] : [];
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
      });
    }

    const offset = pageIndex * pageSize;
    const vaultIdListSql = sql.join(effectiveVaultIds.map(id => sql`${id}`), sql`, `);
    const tagIdListSql =
      normalizedTagIds.length > 0
        ? sql.join(normalizedTagIds.map(id => sql`${id}`), sql`, `)
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
    const effectiveDocumentDateSql = getEffectiveDocumentDateSql('d');

    if (trimmedQuery.length === 0) {
      const countResult = await db.execute<CountRow>(sql`
        SELECT count(*)::int AS results_count
        FROM documents AS d
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND ${tagFilterSql}
          AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveDocumentDateSql} >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveDocumentDateSql} <= ${normalizedDateTo})
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
        });
      }

      const browseResult = await db.execute<SearchRow>(sql`
        SELECT
          d.vault_id,
          v.name AS vault_name,
          d.id AS document_id,
          d.name,
          d.original_name,
          d.original_size,
          d.mime_type,
          d.document_date,
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
          NULL::int AS substring_position
        FROM documents AS d
        INNER JOIN vaults AS v ON v.id = d.vault_id
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND ${tagFilterSql}
          AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveDocumentDateSql} >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveDocumentDateSql} <= ${normalizedDateTo})
        ORDER BY ${getBrowseOrderSql(sortBy)}
        LIMIT ${pageSize}
        OFFSET ${offset}
      `);

      const results: SearchResultItem[] = browseResult.rows.map(row => ({
        vaultId: row.vault_id,
        vaultName: row.vault_name,
        documentId: row.document_id,
        name: row.name,
        originalName: row.original_name,
        originalSize: row.original_size,
        mimeType: row.mime_type,
        documentDate: toIsoString(row.document_date),
        createdAt: toIsoString(row.created_at)!,
        updatedAt: toIsoString(row.updated_at)!,
        tags: parseTagsJson(row.tags_json),
        matchedChunksCount: 0,
        bestChunk: null,
      }));

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
        },
      };
    }

    const ilikePattern = `%${trimmedQuery}%`;
    const headlineOptions =
      'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=5';

    const countResult = await db.execute<CountRow>(sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
      ),
      matched_documents AS (
        SELECT DISTINCT document_id
        FROM (
          SELECT dc.document_id
          FROM document_chunks AS dc
          CROSS JOIN search_query
          INNER JOIN documents AS d ON d.id = dc.document_id
          WHERE dc.vault_id IN (${vaultIdListSql})
            AND d.vault_id IN (${vaultIdListSql})
            AND d.is_deleted = false
            AND ${tagFilterSql}
            AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveDocumentDateSql} >= ${normalizedDateFrom})
            AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveDocumentDateSql} <= ${normalizedDateTo})
            AND (
              dc.tsv @@ search_query.query
              OR dc.content ILIKE ${ilikePattern}
            )

          UNION

          SELECT d.id AS document_id
          FROM documents AS d
          CROSS JOIN search_query
          WHERE d.vault_id IN (${vaultIdListSql})
            AND d.is_deleted = false
            AND ${tagFilterSql}
            AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveDocumentDateSql} >= ${normalizedDateFrom})
            AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveDocumentDateSql} <= ${normalizedDateTo})
            AND (
              d.name ILIKE ${ilikePattern}
              OR d.original_name ILIKE ${ilikePattern}
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
          END AS score
        FROM document_chunks AS dc
        CROSS JOIN search_query
        WHERE dc.vault_id IN (${vaultIdListSql})
          AND (
            dc.tsv @@ search_query.query
            OR dc.content ILIKE ${ilikePattern}
          )

        UNION ALL

        SELECT
          d.vault_id,
          d.id AS document_id,
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
              d.original_name,
              substring(
                d.original_name
                FROM nullif(position(lower(${trimmedQuery}) in lower(d.original_name)), 0)::int
                FOR char_length(${trimmedQuery})
              ),
              concat(
                '<mark>',
                substring(
                  d.original_name
                  FROM nullif(position(lower(${trimmedQuery}) in lower(d.original_name)), 0)::int
                  FOR char_length(${trimmedQuery})
                ),
                '</mark>'
              )
            )
          END AS snippet,
          1.2::float8 AS score
        FROM documents AS d
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND (
            d.name ILIKE ${ilikePattern}
            OR d.original_name ILIKE ${ilikePattern}
          )
      ),
      ranked_results AS (
        SELECT
          d.vault_id,
          v.name AS vault_name,
          d.id AS document_id,
          d.name,
          d.original_name,
          d.original_size,
          d.mime_type,
          d.document_date,
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
          count(*) OVER (PARTITION BY d.id)::int AS matched_chunks_count,
          mc.chunk_index,
          mc.chunk_type,
          mc.page_number,
          mc.chunk_content,
          mc.snippet,
          mc.score,
          mc.fulltext_match,
          mc.substring_position,
          mc.chunk_type = 'title' AS title_match,
          row_number() OVER (
            PARTITION BY d.id
            ORDER BY (mc.chunk_type = 'title') DESC, mc.fulltext_match DESC, mc.score DESC, mc.substring_position ASC NULLS LAST, mc.chunk_index ASC NULLS LAST
          )::int AS rank_in_document
        FROM matched_sources AS mc
        INNER JOIN documents AS d ON d.id = mc.document_id
        INNER JOIN vaults AS v ON v.id = d.vault_id
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND ${tagFilterSql}
          AND (${normalizedDateFrom}::timestamptz IS NULL OR ${effectiveDocumentDateSql} >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR ${effectiveDocumentDateSql} <= ${normalizedDateTo})
      )
      SELECT
        vault_id,
        vault_name,
        document_id,
        name,
        original_name,
        original_size,
        mime_type,
        document_date,
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
        title_match
      FROM ranked_results
      WHERE rank_in_document = 1
      ORDER BY ${getSearchOrderSql(sortBy)}
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);

    const results: SearchResultItem[] = searchResult.rows.map((row) => ({
      vaultId: row.vault_id,
      vaultName: row.vault_name,
      documentId: row.document_id,
      name: row.name,
      originalName: row.original_name,
      originalSize: row.original_size,
      mimeType: row.mime_type,
      documentDate: toIsoString(row.document_date),
      createdAt: toIsoString(row.created_at)!,
      updatedAt: toIsoString(row.updated_at)!,
      tags: parseTagsJson(row.tags_json),
      matchedChunksCount: row.matched_chunks_count,
      bestChunk:
        row.chunk_index === null || row.chunk_content === null || row.snippet === null || row.score === null
          ? null
          : {
              chunkIndex: row.chunk_index,
              chunkType: row.chunk_type,
              pageNumber: row.page_number,
              content: row.chunk_content,
              snippet: row.snippet,
              score: row.score,
            },
    }));

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
      },
    };
  }

  return {
    name: 'database-pg-tsvector',
    searchDocuments,
  };
}
