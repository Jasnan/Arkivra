export type Chunk = {
  chunkIndex: number;
  content: string;
  chunkType: string;
  pageNumber: number | null;
  tokenCount: number;
};

const MAX_CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 200;

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

export function chunkMarkdownContent(markdown: string): Chunk[] {
  if (markdown.trim().length === 0) {
    return [];
  }

  // Split by markdown headings (##, ###, etc.) or double newlines
  const sections = splitIntoSections(markdown);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const trimmed = section.content.trim();

    if (trimmed.length === 0) {
      continue;
    }

    if (trimmed.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        chunkIndex,
        content: trimmed,
        chunkType: section.type,
        pageNumber: null,
        tokenCount: estimateTokens(trimmed),
      });
      chunkIndex++;
    } else {
      // Split large sections into overlapping chunks
      const subChunks = splitLargeSection(trimmed, section.type);

      for (const sub of subChunks) {
        chunks.push({
          ...sub,
          chunkIndex,
        });
        chunkIndex++;
      }
    }
  }

  return chunks;
}

type Section = {
  content: string;
  type: string;
};

function splitIntoSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentContent = '';
  let currentType = 'text';

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch !== null) {
      // Flush current section
      if (currentContent.trim().length > 0) {
        sections.push({ content: currentContent.trim(), type: currentType });
      }

      currentContent = `${line}\n`;
      currentType = 'heading';
    } else {
      currentContent += `${line}\n`;

      if (currentType === 'heading' && line.trim().length > 0) {
        currentType = 'section';
      }
    }
  }

  // Flush last section
  if (currentContent.trim().length > 0) {
    sections.push({ content: currentContent.trim(), type: currentType });
  }

  return sections;
}

function splitLargeSection(text: string, type: string): Omit<Chunk, 'chunkIndex'>[] {
  const chunks: Omit<Chunk, 'chunkIndex'>[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, text.length);

    // Try to break at a sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('. ', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + MAX_CHUNK_CHARS / 2) {
        end = breakPoint + 1;
      }
    }

    const content = text.slice(start, end).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        chunkType: type,
        pageNumber: null,
        tokenCount: estimateTokens(content),
      });
    }

    // Move start forward with overlap, but guarantee forward progress
    const previousStart = start;
    start = end - OVERLAP_CHARS;

    if (start <= previousStart) {
      start = end;
    }
  }

  return chunks;
}
