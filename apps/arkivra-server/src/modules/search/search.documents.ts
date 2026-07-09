import type { Database } from '../database/database.js';
import { sql } from 'drizzle-orm';
import type { DocumentSearchMode, SearchSortBy, SearchVersionMode } from './search.types.js';
import { createSearchDocumentsWithHybrid } from './search.documents-hybrid.js';
import {
  createEmptyResponse,
  FUZZY_METADATA_MIN_SIMILARITY,
  FUZZY_METADATA_TITLE_SCORE,
  getBrowseOrderSql,
  getSearchOrderSql,
  mapSearchRow,
  normalizeTagIds,
  toIsoString,
  toSqlDateBoundary
  
  
} from './search.service-helpers.js';
import type {CountRow, SearchRow} from './search.service-helpers.js';

type QueryEmbedding = { vector: number[]; index: { id: string } };

export function createSearchDocuments({
  db,
  embedQuery,
}: {
  db: Database;
  embedQuery: (trimmedQuery: string) => Promise<QueryEmbedding | null>;
}) {
  const searchDocumentsWithHybrid = createSearchDocumentsWithHybrid({ db, embedQuery });

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
        SELECT websearch_to_tsquery('simple', ${trimmedQuery}) AS query
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
              OR GREATEST(
                similarity(lower(d.name), lower(${trimmedQuery})),
                similarity(lower(dv.original_name), lower(${trimmedQuery}))
              ) >= ${FUZZY_METADATA_MIN_SIMILARITY}
              AND (
                lower(d.name) % lower(${trimmedQuery})
                OR lower(dv.original_name) % lower(${trimmedQuery})
              )
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
        SELECT websearch_to_tsquery('simple', ${trimmedQuery}) AS query
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
            WHEN dc.tsv @@ search_query.query THEN ts_headline('simple', dc.content, search_query.query, ${headlineOptions})
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
            WHEN dv.original_name ILIKE ${ilikePattern}
              THEN replace(
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
            ELSE d.name
          END AS snippet,
          CASE
            WHEN d.name ILIKE ${ilikePattern} OR dv.original_name ILIKE ${ilikePattern}
              THEN 1.2
            ELSE ${FUZZY_METADATA_TITLE_SCORE}
          END::float8 AS score,
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
            OR GREATEST(
              similarity(lower(d.name), lower(${trimmedQuery})),
              similarity(lower(dv.original_name), lower(${trimmedQuery}))
            ) >= ${FUZZY_METADATA_MIN_SIMILARITY}
            AND (
              lower(d.name) % lower(${trimmedQuery})
              OR lower(dv.original_name) % lower(${trimmedQuery})
            )
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


  return searchDocuments;
}
