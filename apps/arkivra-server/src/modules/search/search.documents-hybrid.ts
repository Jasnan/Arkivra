import type { Database } from '../database/database.js';
import { sql } from 'drizzle-orm';
import type { SearchSortBy, SearchVersionMode } from './search.types.js';
import {
  buildVectorLiteral,
  createEmptyResponse,
  FUZZY_METADATA_MIN_SIMILARITY,
  FUZZY_METADATA_TITLE_SCORE,
  getHybridSearchOrderSql,
  HYBRID_DOCUMENT_CANDIDATE_LIMIT,
  HYBRID_DOCUMENT_EXCERPT_LENGTH,
  HYBRID_DOCUMENT_MIN_SEMANTIC_SIMILARITY,
  mapSearchRow,
  toIsoString
  
} from './search.service-helpers.js';
import type {SearchRow} from './search.service-helpers.js';

type QueryEmbedding = { vector: number[]; index: { id: string } };

export function createSearchDocumentsWithHybrid({
  db,
  embedQuery,
}: {
  db: Database;
  embedQuery: (trimmedQuery: string) => Promise<QueryEmbedding | null>;
}) {
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
        SELECT websearch_to_tsquery('simple', ${trimmedQuery}) AS query
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
            WHEN ranked_chunks.fulltext_match THEN ts_headline('simple', dc.content, search_query.query, ${headlineOptions})
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
            WHEN sd.original_name ILIKE ${ilikePattern}
              THEN replace(
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
            ELSE sd.name
          END AS snippet,
          CASE
            WHEN sd.name ILIKE ${ilikePattern} OR sd.original_name ILIKE ${ilikePattern}
              THEN 1.2
            ELSE ${FUZZY_METADATA_TITLE_SCORE}
          END::float8 AS score,
          'title'::text AS match_type,
          true AS title_match
        FROM scoped_document_versions AS sd
        WHERE sd.name ILIKE ${ilikePattern}
          OR sd.original_name ILIKE ${ilikePattern}
          OR GREATEST(
            similarity(lower(sd.name), lower(${trimmedQuery})),
            similarity(lower(sd.original_name), lower(${trimmedQuery}))
          ) >= ${FUZZY_METADATA_MIN_SIMILARITY}
          AND (
            lower(sd.name) % lower(${trimmedQuery})
            OR lower(sd.original_name) % lower(${trimmedQuery})
          )
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

  return searchDocumentsWithHybrid;
}
