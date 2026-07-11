import type { Database } from '../database/database.js';
import type { Citation } from '../search/search.types.js';
import { sql } from 'drizzle-orm';
import { generateId } from '../database/schema/helpers.js';
import { MAX_CONTEXT_CHUNK_SNIPPET_LENGTH } from './chat.constants.js';
import { truncate } from './chat.core.js';
import { normalizeCitationsForDisplay } from './chat.citation-ranking.js';
import { getCitationGroupKey } from './chat.citation-utils.js';

const INLINE_CITATION_MARKER_PATTERN = /\[(\d+)\](?!\()|【(\d+)】/g;

export function sanitizeInlineCitationMarkers(content: string, citationCount: number) {
  return content.replace(INLINE_CITATION_MARKER_PATTERN, (marker, square, lenticular) => {
    const index = Number(square ?? lenticular);
    return Number.isInteger(index) && index >= 1 && index <= citationCount ? marker : '';
  });
}

export function createInlineCitationMarkerSanitizer(citationCount: number) {
  let pending = '';

  return {
    push(delta: string) {
      const combined = pending + delta;
      pending = '';
      const standardStart = combined.lastIndexOf('[');
      const lenticularStart = combined.lastIndexOf('【');
      const possibleStart = Math.max(standardStart, lenticularStart);

      if (possibleStart >= 0) {
        const suffix = combined.slice(possibleStart);
        if (/^(?:\[|【)\d*$/.test(suffix) || /^\[\d+\]$/.test(suffix)) {
          pending = suffix;
          return sanitizeInlineCitationMarkers(combined.slice(0, possibleStart), citationCount);
        }
      }

      return sanitizeInlineCitationMarkers(combined, citationCount);
    },
    flush() {
      const output = sanitizeInlineCitationMarkers(pending, citationCount);
      pending = '';
      return output;
    },
  };
}

export function alignCitationsToPromptOrder({
  promptCitations,
  refinedCitations,
}: {
  promptCitations: Citation[];
  refinedCitations: Citation[];
}) {
  const refinedBySource = new Map(
    refinedCitations.map(citation => [getCitationGroupKey(citation), citation]),
  );

  return promptCitations.map(
    citation => refinedBySource.get(getCitationGroupKey(citation)) ?? citation,
  );
}

export function buildChatMessageCitationRows({
  conversationId,
  messageId,
  citations,
}: {
  conversationId: string;
  messageId: string;
  citations: Citation[];
}) {
  return citations.map((citation) => ({
    id: generateId({ prefix: 'cmc' }),
    conversationId,
    messageId,
    vaultId: citation.vaultId,
    documentId: citation.documentId,
    documentVersionId: citation.documentVersionId,
    chunkId: citation.chunkId,
    versionNumber: citation.versionNumber,
    pageStart: citation.pageStart,
    pageEnd: citation.pageEnd,
    citationPrecision: citation.citationPrecision,
    snippet: truncate(citation.snippet, MAX_CONTEXT_CHUNK_SNIPPET_LENGTH),
    locatorJson: {
      retrievalRepresentation: citation.retrievalRepresentation ?? null,
      section: citation.section,
      sectionPath: citation.sectionPath ?? [],
      sourceElementIds: citation.sourceElementIds ?? [],
      tableSourceElementIds: citation.tableSourceElementIds ?? [],
      imageAssetIds: citation.imageAssetIds ?? [],
      imageAssets: citation.imageAssets ?? [],
      boundingBoxes: citation.boundingBoxes ?? [],
      textLocator: citation.textLocator ?? null,
      assetType: citation.assetType,
    },
  }));
}

export function sanitizeCitationsForMessagePersistence(citations: Citation[]): Citation[] {
  return normalizeCitationsForDisplay(citations).map((citation) => ({
    ...citation,
    snippet: truncate(citation.snippet, MAX_CONTEXT_CHUNK_SNIPPET_LENGTH),
    tablesHtml: [],
  }));
}

export async function insertChatMessageCitationRow({
  db,
  row,
}: {
  db: Database;
  row: ReturnType<typeof buildChatMessageCitationRows>[number];
}) {
  await db.execute(sql`
    INSERT INTO chat_message_citations (
      id,
      conversation_id,
      message_id,
      vault_id,
      document_id,
      document_version_id,
      chunk_id,
      version_number,
      page_start,
      page_end,
      citation_precision,
      snippet,
      locator_json
    )
    VALUES (
      ${row.id},
      ${row.conversationId},
      ${row.messageId},
      ${row.vaultId},
      ${row.documentId},
      (SELECT id FROM document_versions WHERE id = ${row.documentVersionId}),
      (SELECT id FROM document_chunks WHERE id = ${row.chunkId}),
      ${row.versionNumber},
      ${row.pageStart},
      ${row.pageEnd},
      ${row.citationPrecision},
      ${row.snippet},
      ${JSON.stringify(row.locatorJson)}::jsonb
    )
  `);
}
