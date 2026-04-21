import type { ParsedChunk, ParsedChunkType } from './parsed-document.schema.js';

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
