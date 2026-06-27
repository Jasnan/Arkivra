import type { Citation, CitationBoundingBox, CitationImageAsset } from '../search/search.types.js';
import { CHAT_CONTEXT_PAGE_RADIUS } from './chat.constants.js';

export type PageBounds = {
  start: number;
  end: number;
};

export type ChatContextChunkRow = {
  chunk_id: string;
  chunk_index: number;
  retrieval_representation: string | null;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  source_element_ids: unknown;
  bounding_boxes: unknown;
  citation_precision: string | null;
  citation_candidate_scope: string | null;
  provenance_elements: unknown;
  text_locator: unknown;
  snippet: string | null;
};

export type CitationProvenanceElement = {
  elementId: string;
  text: string;
  pageNumber: number | null;
  bbox: CitationBoundingBox | null;
  sortIndex: number;
};

export type ChatContextExpansionChunk = {
  chunkId: string;
  chunkIndex: number;
  retrievalRepresentation?: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
  sourceElementIds?: string[];
  boundingBoxes?: CitationBoundingBox[];
  citationPrecision?: Citation['citationPrecision'];
  citationCandidateScope?: 'source' | 'page';
  provenanceElements?: CitationProvenanceElement[];
  textLocator?: Citation['textLocator'];
  snippet: string;
  retrievalScore?: number;
  retrievalRank?: number;
};

export function getCitationPageBounds(
  citation: Pick<Citation, 'pageStart' | 'pageEnd'>,
): PageBounds | null {
  const start = citation.pageStart ?? citation.pageEnd;
  const end = citation.pageEnd ?? citation.pageStart;

  if (start === null || end === null) {
    return null;
  }

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

export function getChunkPageBounds(
  chunk: Pick<ChatContextExpansionChunk, 'pageStart' | 'pageEnd'>,
): PageBounds | null {
  const start = chunk.pageStart ?? chunk.pageEnd;
  const end = chunk.pageEnd ?? chunk.pageStart;

  if (start === null || end === null) {
    return null;
  }

  return {
    start: Math.min(start, end),
    end: Math.max(start, end),
  };
}

export function formatPageBounds(bounds: PageBounds | null) {
  if (bounds === null) {
    return null;
  }

  return bounds.start === bounds.end
    ? `Page ${bounds.start}`
    : `Pages ${bounds.start}-${bounds.end}`;
}

export function mergePageBounds(bounds: Array<PageBounds | null>): PageBounds | null {
  const presentBounds = bounds.filter((item): item is PageBounds => item !== null);

  if (presentBounds.length === 0) {
    return null;
  }

  return {
    start: Math.min(...presentBounds.map((item) => item.start)),
    end: Math.max(...presentBounds.map((item) => item.end)),
  };
}

export function getExpandedPageWindow(citations: Citation[]): PageBounds | null {
  const bounds = mergePageBounds(citations.map(getCitationPageBounds));

  if (bounds === null) {
    return null;
  }

  return {
    start: Math.max(1, bounds.start - CHAT_CONTEXT_PAGE_RADIUS),
    end: bounds.end + CHAT_CONTEXT_PAGE_RADIUS,
  };
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(values.map((value) => value?.trim() ?? '').filter((value) => value.length > 0)),
  ];
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => (typeof item === 'string' ? [item] : []));
}

export function parseCitationPrecision(value: string | null): Citation['citationPrecision'] {
  if (value === 'box' || value === 'page' || value === 'document') {
    return value;
  }

  return 'document';
}

export function parseCitationCandidateScope(value: string | null): 'source' | 'page' {
  return value === 'page' ? 'page' : 'source';
}

export function parseBoundingBoxes(value: unknown): CitationBoundingBox[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((box) => {
    if (typeof box !== 'object' || box === null || Array.isArray(box)) {
      return [];
    }

    const candidate = box as Partial<CitationBoundingBox>;
    if (
      typeof candidate.pageNumber !== 'number' ||
      typeof candidate.x0 !== 'number' ||
      typeof candidate.y0 !== 'number' ||
      typeof candidate.x1 !== 'number' ||
      typeof candidate.y1 !== 'number' ||
      typeof candidate.layoutWidth !== 'number' ||
      typeof candidate.layoutHeight !== 'number' ||
      typeof candidate.system !== 'string'
    ) {
      return [];
    }

    return [
      {
        pageNumber: candidate.pageNumber,
        x0: candidate.x0,
        y0: candidate.y0,
        x1: candidate.x1,
        y1: candidate.y1,
        layoutWidth: candidate.layoutWidth,
        layoutHeight: candidate.layoutHeight,
        system: candidate.system,
      },
    ];
  });
}

export function parseTextLocator(value: unknown): Citation['textLocator'] | undefined {
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

export function isRenderableCitationBox(box: CitationBoundingBox) {
  return (
    Number.isFinite(box.pageNumber) &&
    Number.isFinite(box.x0) &&
    Number.isFinite(box.y0) &&
    Number.isFinite(box.x1) &&
    Number.isFinite(box.y1) &&
    Number.isFinite(box.layoutWidth) &&
    Number.isFinite(box.layoutHeight) &&
    box.layoutWidth > 0 &&
    box.layoutHeight > 0 &&
    box.x1 > box.x0 &&
    box.y1 > box.y0
  );
}

export function getCitationBoxGroupKey(box: CitationBoundingBox) {
  return `${box.pageNumber}:${box.layoutWidth}:${box.layoutHeight}:${box.system}`;
}

export function mergeCitationBoundingBoxes(boxes: CitationBoundingBox[]) {
  const groups = new Map<string, CitationBoundingBox>();

  for (const box of boxes) {
    if (!isRenderableCitationBox(box)) {
      continue;
    }

    const key = getCitationBoxGroupKey(box);
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(key, { ...box });
      continue;
    }

    groups.set(key, {
      ...existing,
      x0: Math.min(existing.x0, box.x0),
      y0: Math.min(existing.y0, box.y0),
      x1: Math.max(existing.x1, box.x1),
      y1: Math.max(existing.y1, box.y1),
    });
  }

  return [...groups.values()].sort(
    (left, right) => left.pageNumber - right.pageNumber || left.y0 - right.y0 || left.x0 - right.x0,
  );
}

export function parseProvenanceElements(value: unknown): CitationProvenanceElement[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return [];
    }

    const candidate = item as {
      elementId?: unknown;
      text?: unknown;
      pageNumber?: unknown;
      bbox?: unknown;
      sortIndex?: unknown;
    };

    if (
      typeof candidate.elementId !== 'string' ||
      typeof candidate.text !== 'string' ||
      (candidate.pageNumber !== null && typeof candidate.pageNumber !== 'number') ||
      typeof candidate.sortIndex !== 'number'
    ) {
      return [];
    }

    return [
      {
        elementId: candidate.elementId,
        text: candidate.text,
        pageNumber: typeof candidate.pageNumber === 'number' ? candidate.pageNumber : null,
        bbox: parseBoundingBoxes([candidate.bbox])[0] ?? null,
        sortIndex: candidate.sortIndex,
      },
    ];
  });
}

export function uniqueTables(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

export function mergeCitationImageAssets(citations: Citation[]): CitationImageAsset[] {
  const assetsById = new Map<string, CitationImageAsset>();

  for (const citation of citations) {
    for (const asset of citation.imageAssets ?? []) {
      assetsById.set(asset.assetId, asset);
    }
  }

  return [...assetsById.values()];
}

export function getCitationGroupKey(citation: Citation) {
  return `${citation.vaultId}:${citation.documentId}:${citation.documentVersionId}`;
}

export function groupCitationsByDocument(citations: Citation[]) {
  const groups: Citation[][] = [];
  const groupIndexes = new Map<string, number>();

  for (const citation of citations) {
    const key = getCitationGroupKey(citation);
    const groupIndex = groupIndexes.get(key);

    if (groupIndex === undefined) {
      groupIndexes.set(key, groups.length);
      groups.push([citation]);
      continue;
    }

    groups[groupIndex]!.push(citation);
  }

  return groups;
}

export function formatContextChunkLabel(chunk: ChatContextExpansionChunk) {
  const pageLabel = formatPageBounds(getChunkPageBounds(chunk));
  const section = chunk.section?.trim();

  return [pageLabel, section].filter(Boolean).join(' - ');
}

export function getCitationRetrievalRankMap(citations: Citation[]) {
  const ranks = new Map<string, { score: number; rank: number }>();

  for (const [index, citation] of citations.entries()) {
    const existing = ranks.get(citation.chunkId);

    if (existing === undefined || citation.score > existing.score) {
      ranks.set(citation.chunkId, { score: citation.score, rank: index });
    }
  }

  return ranks;
}

export function toFallbackContextChunk(citation: Citation, index: number): ChatContextExpansionChunk {
  return {
    chunkId: citation.chunkId,
    chunkIndex: index,
    retrievalRepresentation: citation.retrievalRepresentation ?? null,
    pageStart: citation.pageStart,
    pageEnd: citation.pageEnd,
    section: citation.section,
    sourceElementIds: citation.sourceElementIds ?? [],
    snippet: citation.snippet,
    retrievalScore: citation.score,
    retrievalRank: index,
  };
}
