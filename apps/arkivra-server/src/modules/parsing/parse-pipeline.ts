import { basename } from 'node:path';
import type { ParserRegistry } from './parser.registry.js';
import type { ParseInput, ParserEngine } from './parser.types.js';
import type { ParsedChunk, ParsedDocument, ParserOutput } from './parsed-document.schema.js';
import type { TextCleaner } from './text-cleaner.js';
import { ParserValidationError } from './parser.types.js';
import { parsedDocumentSchema } from './parsed-document.schema.js';
import { markdownToPlainText } from './markdown-text.js';
import { resolveDocumentLanguage } from './language-detection.js';

export type ParsePipelineOptions = {
  parserRegistry: ParserRegistry;
  cleaner: TextCleaner;
  /** Explicit engine override; falls back to the registry default. */
  engine?: ParserEngine;
};

export type ParsePipelineStage = 'chunking';

export type ParsePipelineRunHooks = {
  onStageChange?: (stage: ParsePipelineStage) => void | Promise<void>;
};

export type ParsePipeline = {
  run: (input: ParseInput, hooks?: ParsePipelineRunHooks) => Promise<ParsedDocument>;
};

const markdownFileExtensions = ['.md', '.markdown'];
const textFileExtensions = ['.txt'];
const whitespacePattern = /\s+/g;
const whitespaceCharacterPattern = /\s/;
const markdownFencePattern = /```([\s\S]*?)```/g;
const markdownInlineCodePattern = /`([^`]*)`/g;
const markdownEmphasisPattern = /[*_~]+/g;
const markdownLinkPattern = /\[([^\]]+)\]\([^)]+\)/g;
const punctuationSpacingPattern = /\s+([.,;:!?)])/g;
const punctuationAfterSpacePattern = /[.,;:!?)]/;
const utf8BomPattern = /^\uFEFF/;
const skippedLocatorCharacters = new Set(['`', '*', '_', '~']);

type TextLocatorSource = {
  sourceType: 'rawMarkdown' | 'rawText';
  text: string;
};

type TextLocatorRange = {
  sourceType: TextLocatorSource['sourceType'];
  startOffset: number;
  endOffset: number;
};

function prefersParserTextAsCanonical(rawStructuredOutput: ParserOutput['rawStructuredOutput']) {
  const processing = rawStructuredOutput?.arkivra_processing;
  if (typeof processing !== 'object' || processing === null || Array.isArray(processing)) {
    return false;
  }

  const metadata = processing as {
    canonical_text_source?: unknown;
    processing_path?: unknown;
  };

  return metadata.canonical_text_source === 'docling' && metadata.processing_path === 'scan-heavy';
}

function getFileExtension(fileName: string) {
  const lowerName = fileName.toLocaleLowerCase();
  const dotIndex = lowerName.lastIndexOf('.');
  return dotIndex >= 0 ? lowerName.slice(dotIndex) : '';
}

function decodeUtf8Source(fileData: Buffer) {
  return fileData.toString('utf8').replace(utf8BomPattern, '');
}

function getTextLocatorSource(input: ParseInput): TextLocatorSource | null {
  const normalizedMimeType = input.mimeType.toLocaleLowerCase();
  const extension = getFileExtension(input.fileName);

  if (normalizedMimeType === 'text/markdown' || markdownFileExtensions.includes(extension)) {
    return { sourceType: 'rawMarkdown', text: decodeUtf8Source(input.fileData) };
  }

  if (normalizedMimeType === 'text/plain' || textFileExtensions.includes(extension)) {
    return { sourceType: 'rawText', text: decodeUtf8Source(input.fileData) };
  }

  return null;
}

function normalizeLocatorText(value: string, sourceType: TextLocatorSource['sourceType']) {
  const sourceAwareValue =
    sourceType === 'rawMarkdown'
      ? value
          .replace(markdownLinkPattern, '$1')
          .replace(markdownFencePattern, '$1')
          .replace(markdownInlineCodePattern, '$1')
          .replace(markdownEmphasisPattern, '')
      : value;

  return sourceAwareValue
    .replace(whitespacePattern, ' ')
    .trim()
    .toLocaleLowerCase()
    .replace(punctuationSpacingPattern, '$1');
}

function isMarkdownFenceAtLineStart(sourceText: string, index: number) {
  if (!sourceText.startsWith('```', index)) {
    return false;
  }

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = sourceText[cursor];
    if (char === ' ' || char === '\t') {
      continue;
    }

    return char === '\n' || char === '\r';
  }

  return true;
}

function skipMarkdownFenceInfoString(sourceText: string, index: number) {
  const lineEndIndex = sourceText.indexOf('\n', index);
  return lineEndIndex >= 0 ? lineEndIndex : sourceText.length;
}

function buildNormalizedSourceMap(source: TextLocatorSource) {
  const rawChars: string[] = [];
  const rawStarts: number[] = [];
  const rawEnds: number[] = [];
  let previousWasWhitespace = true;
  let isInMarkdownFence = false;

  for (let index = 0; index < source.text.length; index += 1) {
    const char = source.text[index] ?? '';
    if (source.sourceType === 'rawMarkdown' && isMarkdownFenceAtLineStart(source.text, index)) {
      if (isInMarkdownFence) {
        index += 2;
        isInMarkdownFence = false;
      } else {
        index = skipMarkdownFenceInfoString(source.text, index);
        isInMarkdownFence = true;
      }
      continue;
    }

    if (source.sourceType === 'rawMarkdown' && char === '!' && source.text[index + 1] === '[') {
      const labelEndIndex = source.text.indexOf(']', index + 2);
      if (labelEndIndex >= 0 && source.text[labelEndIndex + 1] === '(') {
        const urlEndIndex = source.text.indexOf(')', labelEndIndex + 2);
        if (urlEndIndex > labelEndIndex) {
          continue;
        }
      }
    }

    if (source.sourceType === 'rawMarkdown' && char === '[') {
      const labelEndIndex = source.text.indexOf(']', index + 1);
      if (labelEndIndex >= 0 && source.text[labelEndIndex + 1] === '(') {
        const urlEndIndex = source.text.indexOf(')', labelEndIndex + 2);
        if (urlEndIndex > labelEndIndex) {
          continue;
        }
      }
    }

    if (source.sourceType === 'rawMarkdown' && char === ']') {
      const urlStartIndex = index + 1;
      const urlEndIndex =
        source.text[urlStartIndex] === '(' ? source.text.indexOf(')', urlStartIndex + 1) : -1;
      if (urlEndIndex > urlStartIndex) {
        index = urlEndIndex;
        continue;
      }
    }

    if (source.sourceType === 'rawMarkdown' && skippedLocatorCharacters.has(char)) {
      continue;
    }

    if (whitespaceCharacterPattern.test(char)) {
      if (!previousWasWhitespace) {
        rawChars.push(' ');
        rawStarts.push(index);
        rawEnds.push(index + 1);
        previousWasWhitespace = true;
      }
      continue;
    }

    rawChars.push(char.toLocaleLowerCase());
    rawStarts.push(index);
    rawEnds.push(index + 1);
    previousWasWhitespace = false;
  }

  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];

  for (let index = 0; index < rawChars.length; index += 1) {
    const char = rawChars[index] ?? '';
    const nextChar = rawChars[index + 1] ?? '';
    if (
      char === ' ' &&
      (index === rawChars.length - 1 || punctuationAfterSpacePattern.test(nextChar))
    ) {
      continue;
    }

    chars.push(char);
    starts.push(rawStarts[index] ?? 0);
    ends.push(rawEnds[index] ?? 0);
  }

  return {
    text: chars.join('').trimEnd(),
    starts,
    ends,
  };
}

function findSourceTextRange({
  sourceMap,
  chunkText,
  searchFrom,
  sourceType,
}: {
  sourceMap: ReturnType<typeof buildNormalizedSourceMap>;
  chunkText: string;
  searchFrom: number;
  sourceType: TextLocatorSource['sourceType'];
}) {
  const normalizedChunk = normalizeLocatorText(chunkText, sourceType);
  if (normalizedChunk.length === 0) {
    return null;
  }

  const matchIndexFromCursor = sourceMap.text.indexOf(normalizedChunk, searchFrom);
  const matchIndex =
    matchIndexFromCursor >= 0 ? matchIndexFromCursor : sourceMap.text.indexOf(normalizedChunk);
  if (matchIndex < 0) {
    return null;
  }

  const startOffset = sourceMap.starts[matchIndex];
  const endOffset = sourceMap.ends[matchIndex + normalizedChunk.length - 1];
  if (startOffset === undefined || endOffset === undefined || startOffset >= endOffset) {
    return null;
  }

  return {
    startOffset,
    endOffset,
    nextSearchFrom: matchIndex + normalizedChunk.length,
  };
}

function trimSourceRange(sourceText: string, startOffset: number, endOffset: number) {
  let start = startOffset;
  let end = endOffset;

  while (start < end && whitespaceCharacterPattern.test(sourceText[start] ?? '')) {
    start += 1;
  }

  while (end > start && whitespaceCharacterPattern.test(sourceText[end - 1] ?? '')) {
    end -= 1;
  }

  return start < end ? { startOffset: start, endOffset: end } : null;
}

function inferSourceTextRangeFromNeighbors({
  source,
  ranges,
  chunkIndex,
}: {
  source: TextLocatorSource;
  ranges: Array<TextLocatorRange | null>;
  chunkIndex: number;
}): TextLocatorRange | null {
  let previousRange: TextLocatorRange | null = null;
  for (let index = chunkIndex - 1; index >= 0; index -= 1) {
    previousRange = ranges[index] ?? null;
    if (previousRange !== null) {
      break;
    }
  }

  let nextRange: TextLocatorRange | null = null;
  for (let index = chunkIndex + 1; index < ranges.length; index += 1) {
    nextRange = ranges[index] ?? null;
    if (nextRange !== null) {
      break;
    }
  }

  if (previousRange === null && nextRange === null) {
    return null;
  }

  const startOffset = previousRange?.endOffset ?? 0;
  const endOffset = nextRange?.startOffset ?? source.text.length;
  if (startOffset >= endOffset) {
    return null;
  }

  const trimmedRange = trimSourceRange(source.text, startOffset, endOffset);
  if (trimmedRange === null) {
    return null;
  }

  return {
    sourceType: source.sourceType,
    startOffset: trimmedRange.startOffset,
    endOffset: trimmedRange.endOffset,
  };
}

function attachTextLocators(parsed: ParsedDocument, source: TextLocatorSource | null) {
  if (source === null || source.text.trim().length === 0) {
    return parsed;
  }

  const sourceMap = buildNormalizedSourceMap(source);
  let searchFrom = 0;
  const ranges = parsed.chunks.map((chunk): TextLocatorRange | null => {
    const range = findSourceTextRange({
      sourceMap,
      chunkText: chunk.originalText || chunk.text,
      searchFrom,
      sourceType: source.sourceType,
    });

    if (range === null) {
      return null;
    }

    searchFrom = range.nextSearchFrom;

    return {
      sourceType: source.sourceType,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
    };
  });

  for (let index = 0; index < ranges.length; index += 1) {
    if (ranges[index] !== null) {
      continue;
    }

    ranges[index] = inferSourceTextRangeFromNeighbors({
      source,
      ranges,
      chunkIndex: index,
    });
  }

  return {
    ...parsed,
    chunks: parsed.chunks.map((chunk, index) => {
      const range = ranges[index] ?? null;
      if (range === null) {
        return chunk;
      }

      return {
        ...chunk,
        metadata: {
          ...chunk.metadata,
          textLocator: {
            sourceType: range.sourceType,
            startOffset: range.startOffset,
            endOffset: range.endOffset,
          },
        },
      };
    }),
  };
}

function buildDocumentFallbackChunk({
  documentId,
  text,
}: {
  documentId: string;
  text: string;
}): ParsedChunk | null {
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return null;
  }

  return {
    id: `${documentId}:fallback-0`,
    text: trimmedText,
    section: null,
    sectionPath: [],
    pageNumber: null,
    pageStart: null,
    pageEnd: null,
    boundingBoxes: [],
    sourceElementIds: [],
    parentElementId: null,
    originalText: trimmedText,
    tablesHtml: [],
    images: [],
    citationPrecision: 'document',
    enhancedContent: null,
    type: 'other',
    metadata: {
      tokenCount: Math.ceil(trimmedText.length / 4),
      chunkingType: 'document_text_fallback',
    },
  };
}

/**
 * Composes parser → canonical text selection → chunker into a single pipeline that
 * yields a validated {@link ParsedDocument}. This is the sole code path
 * the worker (or any future ingestion entrypoint) should use.
 */
export function createParsePipeline({
  parserRegistry,
  cleaner,
  engine,
}: ParsePipelineOptions): ParsePipeline {
  async function buildParsedDocumentFromRawOutput(
    raw: ParserOutput,
    documentId: string,
    fileName: string,
    persistedRaw?: {
      text: string;
      markdown: string;
      structuredOutput?: Record<string, unknown>;
    },
    hooks?: ParsePipelineRunHooks,
  ): Promise<ParsedDocument> {
    const canonical = await cleaner.clean({ text: raw.text, markdown: raw.markdown });
    const canonicalText = prefersParserTextAsCanonical(raw.rawStructuredOutput)
      ? canonical.text
      : canonical.markdown.length > 0
        ? markdownToPlainText(canonical.markdown)
        : canonical.text;

    await hooks?.onStageChange?.('chunking');

    const parserChunks = raw.chunks;
    if (parserChunks === undefined) {
      throw new ParserValidationError(
        `Parse pipeline requires parser-provided chunks for ${documentId}`,
        raw.engine as ParserEngine,
      );
    }

    const chunkFileName = basename(fileName.replaceAll('\\', '/'));
    const chunks: ParsedChunk[] = parserChunks.map(
      (chunk): ParsedChunk => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          fileName: chunkFileName,
        },
      }),
    );

    const pipelineWarnings = [...raw.warnings];
    if (chunks.length === 0) {
      const fallbackChunk = buildDocumentFallbackChunk({
        documentId,
        text: canonicalText,
      });

      if (fallbackChunk !== null) {
        chunks.push({
          ...fallbackChunk,
          metadata: {
            ...fallbackChunk.metadata,
            fileName: chunkFileName,
          },
        });
        pipelineWarnings.push('parser.empty_chunks_fallback');
      }
    }

    let language: ParsedDocument['language'] = null;
    try {
      language = resolveDocumentLanguage({
        text: canonicalText,
        rawStructuredOutput: persistedRaw?.structuredOutput ?? raw.rawStructuredOutput,
      });
    } catch (error) {
      pipelineWarnings.push(
        error instanceof Error
          ? `language_detection_failed:${error.message}`
          : 'language_detection_failed',
      );
    }

    const parsed: ParsedDocument = {
      documentId,
      engine: raw.engine,
      engineVersion: raw.engineVersion,
      text: canonicalText,
      markdown: canonical.markdown,
      rawText: persistedRaw?.text ?? raw.text,
      rawMarkdown: persistedRaw?.markdown ?? raw.markdown,
      rawStructuredOutput: persistedRaw?.structuredOutput ?? raw.rawStructuredOutput,
      structuredElements: raw.structuredElements,
      language,
      chunks,
      warnings: pipelineWarnings,
    };

    const validation = parsedDocumentSchema.safeParse(parsed);
    if (!validation.success) {
      throw new ParserValidationError(
        `Parse pipeline produced an invalid ParsedDocument for ${documentId}`,
        raw.engine as ParserEngine,
        { issues: validation.error.issues },
      );
    }

    return validation.data;
  }

  async function run(input: ParseInput, hooks?: ParsePipelineRunHooks): Promise<ParsedDocument> {
    const parser = engine !== undefined ? parserRegistry.get(engine) : parserRegistry.getDefault();

    const raw = await parser.parse(input);

    const parsed = await buildParsedDocumentFromRawOutput(
      raw,
      input.documentId,
      input.fileName,
      {
        text: raw.text,
        markdown: raw.markdown,
        structuredOutput: raw.rawStructuredOutput,
      },
      hooks,
    );

    return attachTextLocators(parsed, getTextLocatorSource(input));
  }

  return { run };
}
