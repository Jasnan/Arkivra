import type { Database } from '../database/database.js';
import { sql } from 'drizzle-orm';
import type { Citation, HybridSearchMode } from './search.types.js';
import {
  buildVectorLiteral,
  diversifyHybridSearchRows,
  extractHybridTitleTerms,
  FUZZY_METADATA_MIN_SIMILARITY,
  HYBRID_CITATION_DEFAULT_CANDIDATE_LIMIT,
  HYBRID_CITATION_MAX_CANDIDATE_LIMIT,
  HYBRID_CITATION_MAX_TERMS,
  HYBRID_FOLDER_MATCH_TERM_WEIGHT,
  HYBRID_TITLE_FUZZY_MATCH_BASE_SCORE,
  HYBRID_TITLE_FUZZY_MATCH_TERM_SCORE,
  HYBRID_TITLE_MATCH_BASE_SCORE,
  HYBRID_TITLE_MATCH_TERM_SCORE,
  inferAssetType,
  mergeHybridSearchRows,
  mergeImageAssetsWithProvenance,
  parseAssetSourceElementIds,
  parseBoundingBoxes,
  parseCitationPrecision,
  parseCitationRetrievalDiagnostics,
  parseImageAssets,
  parseImageProvenance,
  parseStringArray,
  parseTextLocator
  
} from './search.service-helpers.js';
import type {HybridSearchRow} from './search.service-helpers.js';

type QueryEmbedding = { vector: number[]; index: { id: string } };

export function createSearchHybrid({
  db,
  embedQuery,
}: {
  db: Database;
  embedQuery: (trimmedQuery: string) => Promise<QueryEmbedding | null>;
}) {

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
              SELECT websearch_to_tsquery('simple', ${trimmedQuery}) AS query
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
                'simple',
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
              (1.0 / (60 + fts_ranked.fts_rank))::float8 AS score,
              'fts'::text AS retrieval_source,
              fts_ranked.fts_rank,
              NULL::int AS vec_rank,
              (1.0 / (60 + fts_ranked.fts_rank))::float8 AS rrf_score,
              NULL::int AS metadata_exact_match_count,
              NULL::int AS metadata_fuzzy_match_count
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
              SELECT websearch_to_tsquery('simple', ${trimmedQuery}) AS query
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
                'simple',
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
                fts_ranked.fts_rank,
                vec_ranked.vec_rank,
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
              ranked.score::float8 AS score,
              CASE
                WHEN ranked.fts_rank IS NOT NULL AND ranked.vec_rank IS NOT NULL THEN 'hybrid'
                WHEN ranked.fts_rank IS NOT NULL THEN 'fts'
                ELSE 'vector'
              END::text AS retrieval_source,
              ranked.fts_rank,
              ranked.vec_rank,
              ranked.score::float8 AS rrf_score,
              NULL::int AS metadata_exact_match_count,
              NULL::int AS metadata_fuzzy_match_count
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
    const titleExactMatchCountSql = () =>
      sql.join(
        titleTerms.map(
          (term) =>
            sql`
              CASE WHEN lower(concat_ws(' ', d.name, dv.original_name)) LIKE ${`%${term}%`}
                THEN 1
                ELSE 0
              END
              + CASE WHEN lower(COALESCE(folder.name, '')) LIKE ${`%${term}%`}
                THEN ${HYBRID_FOLDER_MATCH_TERM_WEIGHT}
                ELSE 0
              END
            `,
        ),
        sql` + `,
      );
    const titleFuzzyMatchCountSql = () =>
      sql.join(
        titleTerms.map(
          (term) =>
            sql`
              CASE
                WHEN (
                  lower(d.name) % ${term}
                  OR lower(dv.original_name) % ${term}
                  OR lower(COALESCE(folder.name, '')) % ${term}
                )
                AND GREATEST(
                  similarity(lower(d.name), ${term}),
                  similarity(lower(dv.original_name), ${term}),
                  similarity(lower(COALESCE(folder.name, '')), ${term})
                ) >= ${FUZZY_METADATA_MIN_SIMILARITY}
                  THEN 1
                ELSE 0
              END
            `,
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
                  (${titleExactMatchCountSql()})::int AS title_exact_match_count,
                  (${titleFuzzyMatchCountSql()})::int AS title_fuzzy_match_count
                FROM document_chunks AS dc
                INNER JOIN documents AS d ON d.id = dc.document_id
                INNER JOIN document_versions AS dv
                  ON dv.id = dc.document_version_id
                  AND dv.document_id = d.id
                  AND dv.vault_id = d.vault_id
                LEFT JOIN vault_folders AS folder
                  ON folder.id = d.folder_id
                  AND folder.vault_id = d.vault_id
                  AND folder.is_deleted = false
                WHERE dc.vault_id IN (${scopedVaultIdList})
                  AND d.vault_id IN (${scopedVaultIdList})
                  AND d.is_deleted = false
                  AND dv.deleted_at IS NULL
                  AND dv.processing_status = 'completed'
                  AND ${hybridVersionScopeSql}
                  AND (${documentId ?? null}::text IS NULL OR d.id = ${documentId ?? null})
                  AND (
                    (${titleExactMatchCountSql()}) > 0
                    OR (${titleFuzzyMatchCountSql()}) > 0
                  )
              ),
              title_first_chunks AS (
                SELECT DISTINCT ON (document_id, document_version_id)
                  chunk_id,
                  title_exact_match_count,
                  title_fuzzy_match_count
                FROM title_scored
                ORDER BY
                  document_id,
                  document_version_id,
                  title_exact_match_count DESC,
                  title_fuzzy_match_count DESC,
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
                  CASE
                    WHEN title_first_chunks.title_exact_match_count > 0
                      THEN ${HYBRID_TITLE_MATCH_BASE_SCORE}::float8
                        + title_first_chunks.title_exact_match_count::float8
                          * ${HYBRID_TITLE_MATCH_TERM_SCORE}::float8
                    ELSE ${HYBRID_TITLE_FUZZY_MATCH_BASE_SCORE}::float8
                      + title_first_chunks.title_fuzzy_match_count::float8
                        * ${HYBRID_TITLE_FUZZY_MATCH_TERM_SCORE}::float8
                  END
                )::float8 AS score,
                'metadata'::text AS retrieval_source,
                NULL::int AS fts_rank,
                NULL::int AS vec_rank,
                NULL::float8 AS rrf_score,
                title_first_chunks.title_exact_match_count AS metadata_exact_match_count,
                title_first_chunks.title_fuzzy_match_count AS metadata_fuzzy_match_count
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
      const retrievalDiagnostics = parseCitationRetrievalDiagnostics(row);

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
        ...(retrievalDiagnostics !== undefined ? { retrievalDiagnostics } : {}),
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

  return searchHybrid;
}
