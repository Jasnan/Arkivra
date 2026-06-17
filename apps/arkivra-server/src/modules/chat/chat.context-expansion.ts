import type { Database } from '../database/database.js';
import type { Citation } from '../search/search.types.js';
import { sql } from 'drizzle-orm';
import { MAX_EXPANDED_CONTEXT_CHUNKS } from './chat.constants.js';
import { compactWhitespace } from './chat.core.js';
import { buildChunkLevelCitationsForChat } from './chat.citation-ranking.js';
import {
  
  
  getCitationRetrievalRankMap,
  getExpandedPageWindow,
  groupCitationsByDocument,
  parseBoundingBoxes,
  parseCitationPrecision,
  parseProvenanceElements,
  parseStringArray,
  parseTextLocator
} from './chat.citation-utils.js';
import type {ChatContextChunkRow, ChatContextExpansionChunk} from './chat.citation-utils.js';

export async function loadContextChunksForCitationGroup({
  db,
  citations,
}: {
  db: Database;
  citations: Citation[];
}): Promise<ChatContextExpansionChunk[]> {
  const base = citations[0];
  const pageWindow = getExpandedPageWindow(citations);

  if (base === undefined || pageWindow === null) {
    return [];
  }

  const retrievalRanks = getCitationRetrievalRankMap(citations);
  const result = await db.execute<ChatContextChunkRow>(sql`
    SELECT
      dc.id AS chunk_id,
      dc.chunk_index,
      dc.metadata->>'retrievalRepresentation' AS retrieval_representation,
      COALESCE(dc.page_start, dc.page_number) AS page_start,
      COALESCE(dc.page_end, dc.page_start, dc.page_number) AS page_end,
      dc.section,
      COALESCE(dc.source_element_ids, '[]'::jsonb) AS source_element_ids,
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
      COALESCE(provenance.elements, '[]'::jsonb) AS provenance_elements,
      dc.metadata->'textLocator' AS text_locator,
      COALESCE(NULLIF(dc.original_text, ''), dc.content) AS snippet
    FROM document_chunks AS dc
    INNER JOIN documents AS d ON d.id = dc.document_id
    INNER JOIN document_versions AS dv
      ON dv.id = dc.document_version_id
      AND dv.document_id = d.id
      AND dv.vault_id = d.vault_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        jsonb_agg(dep.bbox ORDER BY dep.sort_index) FILTER (WHERE dep.bbox IS NOT NULL),
        '[]'::jsonb
      ) AS bounding_boxes,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'elementId', dep.element_id,
            'text', dep.text,
            'pageNumber', dep.page_number,
            'bbox', dep.bbox,
            'sortIndex', dep.sort_index
          )
          ORDER BY dep.sort_index
        ) FILTER (WHERE dep.element_id IS NOT NULL),
        '[]'::jsonb
      ) AS elements
      FROM document_element_provenance AS dep
      WHERE dep.document_version_id = dc.document_version_id
        AND dep.element_id IN (
          SELECT source_element_id
          FROM jsonb_array_elements_text(COALESCE(dc.source_element_ids, '[]'::jsonb))
            AS source(source_element_id)
        )
    ) AS provenance ON true
    WHERE dc.vault_id = ${base.vaultId}
      AND dc.document_id = ${base.documentId}
      AND dc.document_version_id = ${base.documentVersionId}
      AND d.vault_id = ${base.vaultId}
      AND d.is_deleted = false
      AND dv.deleted_at IS NULL
      AND dv.processing_status = 'completed'
      AND COALESCE(dc.page_end, dc.page_start, dc.page_number) >= ${pageWindow.start}
      AND COALESCE(dc.page_start, dc.page_number, dc.page_end) <= ${pageWindow.end}
    ORDER BY dc.chunk_index ASC, dc.id ASC
    LIMIT ${MAX_EXPANDED_CONTEXT_CHUNKS}
  `);

  return result.rows.flatMap((row) => {
    const snippet = compactWhitespace(row.snippet ?? '');
    const retrieval = retrievalRanks.get(row.chunk_id);

    if (snippet.length === 0) {
      return [];
    }

    return [
      {
        chunkId: row.chunk_id,
        chunkIndex: row.chunk_index,
        retrievalRepresentation: row.retrieval_representation,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        section: row.section,
        sourceElementIds: parseStringArray(row.source_element_ids),
        boundingBoxes: parseBoundingBoxes(row.bounding_boxes),
        citationPrecision: parseCitationPrecision(row.citation_precision),
        provenanceElements: parseProvenanceElements(row.provenance_elements),
        textLocator: parseTextLocator(row.text_locator),
        snippet,
        retrievalScore: retrieval?.score,
        retrievalRank: retrieval?.rank,
      },
    ];
  });
}

export async function expandRetrievedCitationsForChat({
  db,
  question,
  citations,
}: {
  db: Database;
  question: string;
  citations: Citation[];
}) {
  const groups = groupCitationsByDocument(citations);
  const expandedCitations: Citation[] = [];

  for (const group of groups) {
    const contextChunks = await loadContextChunksForCitationGroup({ db, citations: group });
    const chunkLevelCitations = buildChunkLevelCitationsForChat({
      question,
      citations: group,
      contextChunks,
    });

    expandedCitations.push(...chunkLevelCitations);
  }

  return expandedCitations;
}
