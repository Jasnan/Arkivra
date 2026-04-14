import type { Database } from '../database/database.js';
import type { DocumentSearchServices, SearchResultItem } from './search.types.js';
import { sql } from 'drizzle-orm';

type SearchRow = {
  vault_id: string;
  vault_name: string;
  document_id: string;
  name: string;
  original_name: string;
  mime_type: string;
  document_date: Date | null;
  created_at: Date;
  updated_at: Date;
  matched_chunks_count: number;
  chunk_index: number;
  chunk_type: string | null;
  page_number: number | null;
  chunk_content: string;
  snippet: string;
  score: number;
  fulltext_match: boolean;
  substring_position: number | null;
};

type CountRow = {
  results_count: number;
};

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

export function createDocumentSearchServices({ db }: { db: Database }): DocumentSearchServices {
  async function searchDocuments({
    vaultId,
    vaultIds,
    query,
    pageIndex,
    pageSize,
    tagId,
    dateFrom,
    dateTo,
  }: {
    vaultId?: string;
    vaultIds?: string[];
    query: string;
    pageIndex: number;
    pageSize: number;
    tagId?: string;
    dateFrom?: Date | null;
    dateTo?: Date | null;
  }) {
    const trimmedQuery = query.trim();
    const effectiveVaultIds = vaultIds?.length > 0 ? vaultIds : vaultId ? [vaultId] : [];
    const normalizedTagId = tagId?.trim() || null;
    const normalizedDateFrom = toSqlDateBoundary(dateFrom ?? null, 'start');
    const normalizedDateTo = toSqlDateBoundary(dateTo ?? null, 'end');
    const ilikePattern = `%${trimmedQuery}%`;
    const vaultIdListSql = sql.join(effectiveVaultIds.map(id => sql`${id}`), sql`, `);

    if (trimmedQuery.length === 0 || effectiveVaultIds.length === 0) {
      return {
        query: trimmedQuery,
        pageIndex,
        pageSize,
        results: [],
        resultsCount: 0,
        filters: {
          vaultId: vaultId ?? null,
          tagId: normalizedTagId,
          dateFrom: toIsoString(normalizedDateFrom),
          dateTo: toIsoString(normalizedDateTo),
        },
      };
    }

    const offset = pageIndex * pageSize;
    const headlineOptions =
      'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=5';

    const countResult = await db.execute<CountRow>(sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
      ),
      matched_documents AS (
        SELECT DISTINCT dc.document_id
        FROM document_chunks AS dc
        CROSS JOIN search_query
        INNER JOIN documents AS d ON d.id = dc.document_id
        WHERE dc.vault_id IN (${vaultIdListSql})
          AND d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND (${normalizedTagId}::text IS NULL OR EXISTS (
            SELECT 1
            FROM document_tags AS dt
            WHERE dt.document_id = d.id
              AND dt.tag_id = ${normalizedTagId}
          ))
          AND (${normalizedDateFrom}::timestamptz IS NULL OR d.document_date >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR d.document_date <= ${normalizedDateTo})
          AND (
            dc.tsv @@ search_query.query
            OR dc.content ILIKE ${ilikePattern}
          )
      )
      SELECT count(*)::int AS results_count
      FROM matched_documents
    `);

    const resultsCount = countResult.rows[0]?.results_count ?? 0;

    if (resultsCount === 0) {
      return {
        query: trimmedQuery,
        pageIndex,
        pageSize,
        results: [],
        resultsCount: 0,
        filters: {
          vaultId: vaultId ?? null,
          tagId: normalizedTagId,
          dateFrom: toIsoString(normalizedDateFrom),
          dateTo: toIsoString(normalizedDateTo),
        },
      };
    }

    const searchResult = await db.execute<SearchRow>(sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
      ),
      matched_chunks AS (
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
      ),
      ranked_results AS (
        SELECT
          d.vault_id,
          v.name AS vault_name,
          d.id AS document_id,
          d.name,
          d.original_name,
          d.mime_type,
          d.document_date,
          d.created_at,
          d.updated_at,
          count(*) OVER (PARTITION BY d.id)::int AS matched_chunks_count,
          mc.chunk_index,
          mc.chunk_type,
          mc.page_number,
          mc.chunk_content,
          mc.snippet,
          mc.score,
          mc.fulltext_match,
          mc.substring_position,
          row_number() OVER (
            PARTITION BY d.id
            ORDER BY mc.fulltext_match DESC, mc.score DESC, mc.substring_position ASC NULLS LAST, mc.chunk_index ASC
          )::int AS rank_in_document
        FROM matched_chunks AS mc
        INNER JOIN documents AS d ON d.id = mc.document_id
        INNER JOIN vaults AS v ON v.id = d.vault_id
        WHERE d.vault_id IN (${vaultIdListSql})
          AND d.is_deleted = false
          AND (${normalizedTagId}::text IS NULL OR EXISTS (
            SELECT 1
            FROM document_tags AS dt
            WHERE dt.document_id = d.id
              AND dt.tag_id = ${normalizedTagId}
          ))
          AND (${normalizedDateFrom}::timestamptz IS NULL OR d.document_date >= ${normalizedDateFrom})
          AND (${normalizedDateTo}::timestamptz IS NULL OR d.document_date <= ${normalizedDateTo})
      )
      SELECT
        vault_id,
        vault_name,
        document_id,
        name,
        original_name,
        mime_type,
        document_date,
        created_at,
        updated_at,
        matched_chunks_count,
        chunk_index,
        chunk_type,
        page_number,
        chunk_content,
        snippet,
        score,
        fulltext_match,
        substring_position
      FROM ranked_results
      WHERE rank_in_document = 1
      ORDER BY fulltext_match DESC, score DESC, substring_position ASC NULLS LAST, updated_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);

    const results: SearchResultItem[] = searchResult.rows.map((row) => ({
      vaultId: row.vault_id,
      vaultName: row.vault_name,
      documentId: row.document_id,
      name: row.name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      documentDate: toIsoString(row.document_date),
      createdAt: toIsoString(row.created_at)!,
      updatedAt: toIsoString(row.updated_at)!,
      matchedChunksCount: row.matched_chunks_count,
      bestChunk: {
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
        tagId: normalizedTagId,
        dateFrom: toIsoString(normalizedDateFrom),
        dateTo: toIsoString(normalizedDateTo),
      },
    };
  }

  return {
    name: 'database-pg-tsvector',
    searchDocuments,
  };
}
