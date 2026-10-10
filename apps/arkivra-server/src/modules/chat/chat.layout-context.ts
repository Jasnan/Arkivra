import type { Citation } from '../search/search.types.js';
import type { ChatContextExpansionChunk } from './chat.citation-utils.js';
import { mergeCitationImageAssets, uniqueTables, uniqueStrings } from './chat.citation-utils.js';
import {
  isFineGrainedDoclingRepresentation,
  toChunkLevelCitation,
  extractRetrievalQueryTerms,
} from './chat.citation-ranking.js';

export const MAX_LAYOUT_CONTEXT_LENGTH = 3600;

function pageOf(chunk: ChatContextExpansionChunk) {
  return chunk.pageStart !== null && chunk.pageStart === chunk.pageEnd ? chunk.pageStart : null;
}

function distance(left: ChatContextExpansionChunk, right: ChatContextExpansionChunk) {
  let spatial = Number.POSITIVE_INFINITY;
  for (const a of left.boundingBoxes ?? []) {
    for (const b of right.boundingBoxes ?? []) {
      if (
        a.pageNumber !== b.pageNumber ||
        a.layoutWidth !== b.layoutWidth ||
        a.layoutHeight !== b.layoutHeight ||
        a.system !== b.system
      )
        continue;
      const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1) / a.layoutWidth;
      const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1) / a.layoutHeight;
      spatial = Math.min(spatial, Math.hypot(dx, dy));
    }
  }
  return spatial;
}

// Called only with permission-checked chunks from one document version.
// Structure comes from persisted page membership, reading order and source boxes.
export function buildLayoutContextCitations({
  citations,
  chunks,
  question,
  answerText,
}: {
  citations: Citation[];
  chunks: ChatContextExpansionChunk[];
  question: string;
  answerText?: string;
}): Citation[] {
  const output: Citation[] = [];
  const groups: { anchor: Citation; members: ChatContextExpansionChunk[] }[] = [];
  const byId = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const queryTerms = extractRetrievalQueryTerms(question);
  const length = (members: ChatContextExpansionChunk[]) =>
    members.reduce((total, member) => total + member.snippet.length + 2, 0);

  for (const citation of citations) {
    const anchor = byId.get(citation.chunkId);
    if (
      !anchor ||
      !isFineGrainedDoclingRepresentation(citation.retrievalRepresentation) ||
      pageOf(anchor) === null ||
      !isFineGrainedDoclingRepresentation(anchor.retrievalRepresentation)
    ) {
      output.push(citation);
      continue;
    }
    const page = chunks
      .filter((chunk) => pageOf(chunk) === pageOf(anchor))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
    let members: ChatContextExpansionChunk[];
    if (length(page) <= MAX_LAYOUT_CONTEXT_LENGTH) {
      members = page;
    } else {
      // Include both reading-order neighbors and geometrically close regions.
      const nearest = [...page].sort((a, b) => distance(anchor, a) - distance(anchor, b));
      const adjacent = [...page].sort(
        (a, b) =>
          Math.abs(a.chunkIndex - anchor.chunkIndex) - Math.abs(b.chunkIndex - anchor.chunkIndex),
      );
      const candidates = [
        ...new Map(
          [anchor, ...adjacent.slice(0, 9), ...nearest.slice(0, 9)].map((chunk) => [
            chunk.chunkId,
            chunk,
          ]),
        ).values(),
      ];
      members = [anchor];
      for (const candidate of candidates) {
        if (candidate.chunkId === anchor.chunkId) continue;
        if (length([...members, candidate]) <= MAX_LAYOUT_CONTEXT_LENGTH) members.push(candidate);
      }
    }
    // Merge overlapping contexts when their union fits; one page should not fill
    // the citation limit with many identical region excerpts.
    const overlap = groups.find(
      (group) =>
        group.members.some((member) =>
          members.some((candidate) => candidate.chunkId === member.chunkId),
        ) &&
        length([...new Map([...group.members, ...members].map((c) => [c.chunkId, c])).values()]) <=
          MAX_LAYOUT_CONTEXT_LENGTH,
    );
    if (overlap) {
      overlap.members = [
        ...new Map([...overlap.members, ...members].map((c) => [c.chunkId, c])).values(),
      ];
    } else {
      groups.push({ anchor: citation, members });
    }
  }

  for (const { anchor, members } of groups) {
    members.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const source = byId.get(anchor.chunkId)!;
    const snippet = members.map((member) => member.snippet).join('\n\n');
    const parent: ChatContextExpansionChunk = {
      ...source,
      snippet,
      citationCandidateScope: 'source',
      sourceElementIds: [...new Set(members.flatMap((member) => member.sourceElementIds ?? []))],
      boundingBoxes: members.flatMap((member) => member.boundingBoxes ?? []),
      provenanceElements: members.flatMap((member) => member.provenanceElements ?? []),
    };
    const expanded = toChunkLevelCitation({
      base: anchor,
      source: anchor,
      chunk: parent,
      queryTerms,
      answerText,
    });
    const memberIds = new Set(members.map((member) => member.chunkId));
    const sources = citations.filter((citation) => memberIds.has(citation.chunkId));
    expanded.tablesHtml = uniqueTables(sources.flatMap((citation) => citation.tablesHtml));
    expanded.tableSourceElementIds = uniqueStrings(
      sources.flatMap((citation) => citation.tableSourceElementIds ?? []),
    );
    expanded.imageAssets = mergeCitationImageAssets(sources);
    expanded.imageAssetIds = uniqueStrings(sources.flatMap((citation) => citation.imageAssetIds));
    expanded.assetType = expanded.imageAssetIds.length
      ? 'image'
      : expanded.tablesHtml.length
        ? 'table'
        : 'text';
    expanded.contextChunks = [
      {
        chunkId: anchor.chunkId,
        retrievalRepresentation: 'layout_parent',
        pageStart: source.pageStart,
        pageEnd: source.pageEnd,
        section: source.section,
        sourceElementIds: parent.sourceElementIds,
        snippet,
        score: anchor.score,
      },
    ];
    output.push(expanded);
  }
  return output;
}
