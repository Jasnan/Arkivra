import type {
  ChunkBoundingBox,
  CitationPrecision,
  ParsedChunk,
  ParsedChunkType,
  StructuredElement,
} from './parsed-document.schema.js';

const DEFAULT_MAX_CHUNK_CHARS = 2000;
const DEFAULT_OVERLAP_CHARS = 200;

export type ChunkerOptions = {
  documentId: string;
  maxChunkChars?: number;
  overlapChars?: number;
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type RawSection = {
  heading: string | null;
  type: ParsedChunkType;
  content: string;
};

function detectHeading(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})[ \t]+(\S.*)$/);
  if (match === null) {
    return null;
  }
  return { level: match[1]!.length, text: match[2]!.trim() };
}

function splitIntoSections(markdown: string): RawSection[] {
  const lines = markdown.split('\n');
  const sections: RawSection[] = [];
  let currentHeading: string | null = null;
  let currentType: ParsedChunkType = 'paragraph';
  let currentContent = '';
  let headingJustSeen = false;

  for (const line of lines) {
    const heading = detectHeading(line);

    if (heading !== null) {
      if (currentContent.trim().length > 0) {
        sections.push({
          heading: currentHeading,
          type: currentType,
          content: currentContent.trim(),
        });
      }

      currentHeading = heading.text;
      currentType = 'heading';
      currentContent = `${line}\n`;
      headingJustSeen = true;
      continue;
    }

    currentContent += `${line}\n`;

    if (headingJustSeen && line.trim().length > 0) {
      currentType = inferBlockType(line);
      headingJustSeen = false;
    } else if (!headingJustSeen && currentType === 'heading' && line.trim().length > 0) {
      currentType = inferBlockType(line);
    }
  }

  if (currentContent.trim().length > 0) {
    sections.push({
      heading: currentHeading,
      type: currentType,
      content: currentContent.trim(),
    });
  }

  return sections;
}

function inferBlockType(line: string): ParsedChunkType {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
    return 'table';
  }
  if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return 'list';
  }
  return 'paragraph';
}

function splitLargeText(
  text: string,
  maxChunkChars: number,
  overlapChars: number,
): string[] {
  const pieces: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkChars, text.length);

    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + maxChunkChars / 2) {
        end = breakPoint + 1;
      }
    }

    const piece = text.slice(start, end).trim();
    if (piece.length > 0) {
      pieces.push(piece);
    }

    const previousStart = start;
    start = end - overlapChars;
    if (start <= previousStart) {
      start = end;
    }
  }

  return pieces;
}

/**
 * Generic markdown chunker. Parser-independent: consumes a markdown string and
 * emits stable {@link ParsedChunk} records with deterministic ids, section
 * context (derived from the nearest preceding heading), bounded type enum, and
 * an extensible metadata bag.
 */
export function chunkMarkdown(
  markdown: string,
  options: ChunkerOptions,
): ParsedChunk[] {
  const { documentId } = options;
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  if (markdown.trim().length === 0) {
    return [];
  }

  const sections = splitIntoSections(markdown);
  const chunks: ParsedChunk[] = [];
  let index = 0;

  for (const section of sections) {
    const trimmed = section.content.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const pieces =
      trimmed.length <= maxChunkChars
        ? [trimmed]
        : splitLargeText(trimmed, maxChunkChars, overlapChars);

    for (const piece of pieces) {
      chunks.push({
        id: `${documentId}:${index}`,
        text: piece,
        section: section.heading,
        pageNumber: null,
        pageStart: null,
        pageEnd: null,
        boundingBoxes: [],
        sourceElementIds: [],
        parentElementId: null,
        originalText: piece,
        tablesHtml: [],
        images: [],
        citationPrecision: 'document',
        enhancedContent: null,
        type: section.type,
        metadata: {
          index,
          tokenCount: estimateTokens(piece),
        },
      });
      index++;
    }
  }

  return chunks;
}

/**
 * Element-aware chunker for parsers that emit
 * {@link StructuredElement}s. Walks elements top-to-bottom, opens a new
 * section on every `title`-typed element, then accumulates elements
 * within a section until the rendered text exceeds `maxChunkChars`,
 * applying the same overlap rule as {@link chunkMarkdown} once the cap
 * is exceeded.
 *
 * For each emitted chunk:
 *   - `pageStart` / `pageEnd` come from the min / max element page
 *     numbers (null if no element carried one).
 *   - `boundingBoxes` carries one entry per element that has a bbox.
 *   - `tablesHtml` / `images` collect every `table` / `image` element.
 *   - `originalText` is the verbatim concatenation of element `text`.
 *   - `citationPrecision` is `'box'` if every element has a bbox,
 *     otherwise `'page'` if every element has a page number,
 *     otherwise `'document'`.
 *
 * The chunker is parser-agnostic — both the Docling adapter and
 * the vision fallback can feed it.
 */
export function chunkStructuredElements(
  elements: StructuredElement[],
  options: ChunkerOptions,
): ParsedChunk[] {
  const { documentId } = options;
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  if (elements.length === 0) {
    return [];
  }

  type Pending = {
    section: string | null;
    items: StructuredElement[];
  };

  // Group consecutive elements by their section. A `title` element
  // opens a new section; following elements until the next title share
  // it. The title text is *not* included in the chunk body so search
  // hits land on actual prose, but it is recorded in `section`.
  const groups: Pending[] = [];
  let current: Pending = { section: null, items: [] };

  for (const element of elements) {
    if (element.type === 'title') {
      if (current.items.length > 0) {
        groups.push(current);
      }
      const headingText = element.text.trim();
      current = {
        section: headingText.length > 0 ? headingText : element.section,
        items: [],
      };
      continue;
    }

    current.items.push(element);
  }

  if (current.items.length > 0) {
    groups.push(current);
  }

  // Drop sections that contain no body elements (e.g. trailing title
  // with nothing after it). Emitting an empty chunk would just confuse
  // retrieval.
  const nonEmpty = groups.filter(group => group.items.length > 0);

  let index = 0;
  const chunks: ParsedChunk[] = [];

  for (const group of nonEmpty) {
    const buckets = bucketSectionElements(group.items, maxChunkChars, overlapChars);

    for (const bucket of buckets) {
      const chunk = buildChunkFromBucket({
        bucket,
        section: group.section,
        documentId,
        index,
      });
      chunks.push(chunk);
      index += 1;
    }
  }

  return chunks;
}

/**
 * Split a section's elements into chunk buckets that respect
 * `maxChunkChars`. Tables / images count for their textual surrogate so
 * a section that is mostly tables still gets bucketed sensibly. We
 * always keep at least one element per bucket so that single-element
 * sections (e.g. one big table) do not get dropped.
 *
 * Overlap re-uses the trailing tail of the previous bucket as the
 * leading element of the next one when that element's text is shorter
 * than `overlapChars` — close enough to the markdown chunker's
 * character-overlap behaviour for retrieval recall, while staying
 * element-aligned for citation accuracy.
 */
function bucketSectionElements(
  items: StructuredElement[],
  maxChunkChars: number,
  overlapChars: number,
): StructuredElement[][] {
  const buckets: StructuredElement[][] = [];
  let pending: StructuredElement[] = [];
  let pendingChars = 0;

  for (const element of items) {
    const surrogate = renderElementSurrogate(element);
    const itemChars = surrogate.length;

    const wouldOverflow = pendingChars + itemChars > maxChunkChars && pending.length > 0;

    if (wouldOverflow) {
      buckets.push(pending);
      const tail = pending.at(-1);
      const overlapStarter =
        tail !== undefined && renderElementSurrogate(tail).length <= overlapChars
          ? [tail]
          : [];
      pending = [...overlapStarter, element];
      pendingChars = pending.reduce((acc, item) => acc + renderElementSurrogate(item).length, 0);
      continue;
    }

    pending.push(element);
    pendingChars += itemChars;
  }

  if (pending.length > 0) {
    buckets.push(pending);
  }

  return buckets;
}

/**
 * Surrogate text used to size chunks. Tables expose `tableHtml` and
 * images carry no text, so we substitute placeholders so they still
 * contribute to the chunk-size accounting and never get silently
 * grouped into a giant bucket.
 */
function renderElementSurrogate(element: StructuredElement): string {
  if (element.text.trim().length > 0) {
    return element.text;
  }

  if (element.tableHtml !== null && element.tableHtml.length > 0) {
    return element.tableHtml;
  }

  if (element.image !== null) {
    return '[image]';
  }

  return '';
}

function buildChunkFromBucket({
  bucket,
  section,
  documentId,
  index,
}: {
  bucket: StructuredElement[];
  section: string | null;
  documentId: string;
  index: number;
}): ParsedChunk {
  const originalText = bucket.map(item => item.text).join('\n\n').trim();
  const text = originalText;

  const pageNumbers = bucket
    .map(item => item.pageNumber)
    .filter((value): value is number => typeof value === 'number');

  const pageStart = pageNumbers.length > 0 ? Math.min(...pageNumbers) : null;
  const pageEnd = pageNumbers.length > 0 ? Math.max(...pageNumbers) : null;

  const boundingBoxes: ChunkBoundingBox[] = [];
  for (const item of bucket) {
    if (item.bbox === null || item.pageNumber === null) {
      continue;
    }
    boundingBoxes.push({ pageNumber: item.pageNumber, ...item.bbox });
  }

  const tablesHtml: string[] = [];
  for (const item of bucket) {
    if (item.tableHtml !== null && item.tableHtml.length > 0) {
      tablesHtml.push(item.tableHtml);
    }
  }

  const images = bucket
    .map(item => item.image)
    .filter((value): value is NonNullable<StructuredElement['image']> => value !== null);

  const sourceElementIds = bucket.map(item => item.elementId);

  // The first non-null parent_id wins. Parsers that emit repeated
  // parent for every element under a title, so this is stable.
  const parentElementId = bucket.find(item => item.parentId !== null)?.parentId ?? null;

  const allHaveBbox = bucket.every(item => item.bbox !== null && item.pageNumber !== null);
  const allHavePage = bucket.every(item => item.pageNumber !== null);
  const citationPrecision: CitationPrecision = allHaveBbox
    ? 'box'
    : allHavePage
      ? 'page'
      : 'document';

  const type = inferChunkType(bucket);

  return {
    id: `${documentId}:${index}`,
    text,
    section,
    pageNumber: pageStart,
    pageStart,
    pageEnd,
    boundingBoxes,
    sourceElementIds,
    parentElementId,
    originalText,
    tablesHtml,
    images,
    citationPrecision,
    enhancedContent: null,
    type,
    metadata: {
      index,
      tokenCount: estimateTokens(text),
      elementCount: bucket.length,
    },
  };
}

function inferChunkType(bucket: StructuredElement[]): ParsedChunkType {
  const hasTable = bucket.some(item => item.type === 'table');
  if (hasTable) {
    return 'table';
  }
  const hasList = bucket.some(item => item.type === 'list');
  if (hasList) {
    return 'list';
  }
  const onlyOther = bucket.every(item => item.type === 'other' || item.type === 'image');
  if (onlyOther) {
    return 'other';
  }
  return 'paragraph';
}
