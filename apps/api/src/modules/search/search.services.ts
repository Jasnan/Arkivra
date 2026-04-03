import type { Database } from '../database/database.js';
import type { DocumentSearchServices, SearchResultItem } from './search.types.js';
import { sql } from 'drizzle-orm';

type SearchRow = {
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

export function createDocumentSearchServices({ db }: { db: Database }): DocumentSearchServices {
  async function searchDocuments({
    vaultId,
    query,
    pageIndex,
    pageSize,
  }: {
    vaultId: string;
    query: string;
    pageIndex: number;
    pageSize: number;
  }) {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 0) {
      return {
        query: trimmedQuery,
        pageIndex,
        pageSize,
        results: [],
        resultsCount: 0,
      };
    }

    const offset = pageIndex * pageSize;
    const headlineOptions = 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=5';

    const countResult = await db.execute<CountRow>(sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
      ),
      matched_documents AS (
        SELECT DISTINCT dc.document_id
        FROM document_chunks AS dc
        CROSS JOIN search_query
        INNER JOIN documents AS d ON d.id = dc.document_id
        WHERE dc.vault_id = ${vaultId}
          AND d.vault_id = ${vaultId}
          AND d.is_deleted = false
          AND dc.tsv @@ search_query.query
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
      };
    }

    const searchResult = await db.execute<SearchRow>(sql`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${trimmedQuery}) AS query
      ),
      matched_chunks AS (
        SELECT
          dc.document_id,
          dc.chunk_index,
          dc.chunk_type,
          dc.page_number,
          dc.content AS chunk_content,
          ts_headline('english', dc.content, search_query.query, ${headlineOptions}) AS snippet,
          ts_rank_cd(dc.tsv, search_query.query)::float8 AS score
        FROM document_chunks AS dc
        CROSS JOIN search_query
        WHERE dc.vault_id = ${vaultId}
          AND dc.tsv @@ search_query.query
      ),
      ranked_results AS (
        SELECT
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
          row_number() OVER (
            PARTITION BY d.id
            ORDER BY mc.score DESC, mc.chunk_index ASC
          )::int AS rank_in_document
        FROM matched_chunks AS mc
        INNER JOIN documents AS d ON d.id = mc.document_id
        WHERE d.vault_id = ${vaultId}
          AND d.is_deleted = false
      )
      SELECT
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
        score
      FROM ranked_results
      WHERE rank_in_document = 1
      ORDER BY score DESC, updated_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `);

    const results: SearchResultItem[] = searchResult.rows.map(row => ({
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
    };
  }

  return {
    name: 'database-pg-tsvector',
    searchDocuments,
  };
}
