import type { DocumentParser, ParseInput } from './parser.types.js';
import type { ParserOutput } from './parsed-document.schema.js';
import type { GluedWordNormalizer } from './glued-word-normalizer.js';
import type { ChunkSummariser } from './ollama-chunk-summariser.js';
import type { ParsedChunk } from './parsed-document.schema.js';
import type { TextCleaner } from './text-cleaner.js';
import { describe, expect, test, vi } from 'vitest';
import { createNoopGluedWordNormalizer } from './glued-word-normalizer.js';
import { createParserRegistry } from './parser.registry.js';
import { createDeterministicTextCleaner, createNoopTextCleaner } from './text-cleaner.js';
import { createParsePipeline } from './parse-pipeline.js';

function makeChunk(overrides: Partial<ParsedChunk> = {}): ParsedChunk {
  return {
    id: 'doc_1:0',
    text: 'raw chunk text',
    section: 'Title',
    sectionPath: ['Title'],
    pageNumber: 1,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    sourceElementIds: ['#/texts/0'],
    parentElementId: null,
    originalText: 'raw chunk text',
    tablesHtml: [],
    images: [],
    citationPrecision: 'page',
    enhancedContent: null,
    type: 'paragraph',
    metadata: { tokenCount: 4 },
    ...overrides,
  };
}

function makeParser(raw: Partial<ParserOutput> = {}): DocumentParser {
  return {
    engine: 'docling',
    engineVersion: 'v1',
    capabilities: { ocr: true, tables: true, supportedMimeTypes: 'any' },
    parse: vi.fn(async (_input: ParseInput) => ({
      engine: 'docling',
      engineVersion: 'v1',
      text: 'raw text',
      markdown: '# raw markdown',
      chunks: [makeChunk()],
      warnings: [],
      ...raw,
    })),
  };
}

function makePipeline(
  parserOverrides: Partial<ParserOutput> = {},
  cleaner: TextCleaner = createNoopTextCleaner(),
  gluedWordNormalizer: GluedWordNormalizer = createNoopGluedWordNormalizer(),
  chunkSummariser?: ChunkSummariser,
) {
  const parser = makeParser(parserOverrides);
  const registry = createParserRegistry({ parsers: [parser], defaultEngine: 'docling' });
  const pipeline = createParsePipeline({
    parserRegistry: registry,
    cleaner,
    gluedWordNormalizer,
    chunkSummariser,
  });
  return { pipeline, parser };
}

const input: ParseInput = {
  documentId: 'doc_1',
  fileName: 'file.pdf',
  mimeType: 'application/pdf',
  fileData: Buffer.from('x'),
};

describe('parse pipeline', () => {
  test('preserves raw parser output alongside cleaned text', async () => {
    const { pipeline } = makePipeline(
      {
        text: 'Dirty  \ntext',
        markdown: '',
        rawStructuredOutput: { schema_name: 'DoclingDocument', texts: [] },
      },
      createDeterministicTextCleaner(),
    );

    const parsed = await pipeline.run(input);

    expect(parsed.rawText).toBe('Dirty  \ntext');
    expect(parsed.rawStructuredOutput).toEqual({
      schema_name: 'DoclingDocument',
      texts: [],
    });
    expect(parsed.text).not.toBe(parsed.rawText);
    expect(parsed.text.includes('  ')).toBe(false);
  });

  test('uses parser-provided chunks directly', async () => {
    const chunk = makeChunk({
      text: 'Docling hybrid chunk',
      originalText: 'Docling hybrid chunk',
      section: 'Financial Overview',
      sectionPath: ['Annual Report', 'Financial Overview'],
      sourceElementIds: ['#/texts/2', '#/pictures/0'],
      metadata: {
        tokenCount: 12,
        imageCaptions: ['Revenue trend by month'],
      },
    });
    const { pipeline } = makePipeline({
      text: 'ignored plain text',
      markdown: '# ignored markdown',
      chunks: [chunk],
    });

    const parsed = await pipeline.run(input);

    expect(parsed.chunks).toEqual([chunk]);
  });

  test('requires parser-provided chunks', async () => {
    const { pipeline } = makePipeline({
      chunks: undefined,
    });

    await expect(pipeline.run(input)).rejects.toThrow(/requires parser-provided chunks/);
  });

  test('propagates engine + engineVersion + warnings unchanged', async () => {
    const { pipeline } = makePipeline({
      warnings: ['docling.partial_success', 'ocr glitch'],
    });
    const parsed = await pipeline.run(input);
    expect(parsed.engine).toBe('docling');
    expect(parsed.engineVersion).toBe('v1');
    expect(parsed.warnings).toEqual(['docling.partial_success', 'ocr glitch']);
  });

  test('validates the final ParsedDocument via Zod', async () => {
    const { pipeline } = makePipeline({ engine: '' });

    await expect(pipeline.run(input)).rejects.toThrow(/invalid ParsedDocument/);
  });

  test('runs glued-word normalization on cleaned document text and markdown', async () => {
    const normalizer: GluedWordNormalizer = {
      name: 'mock-ollama',
      normalize: async (inputText) => ({
        text: inputText.text.replace('GOVERNMENTOFKERALA', 'GOVERNMENT OF KERALA'),
        markdown: inputText.markdown.replace('GOVERNMENTOFKERALA', 'GOVERNMENT OF KERALA'),
        replacements: [{
          original: 'GOVERNMENTOFKERALA',
          updated: 'GOVERNMENT OF KERALA',
        }],
      }),
    };

    const { pipeline } = makePipeline(
      {
        text: 'GOVERNMENTOFKERALA',
        markdown: '# GOVERNMENTOFKERALA',
        chunks: [makeChunk({ text: 'chunk stays parser-owned', originalText: 'chunk stays parser-owned' })],
      },
      createNoopTextCleaner(),
      normalizer,
    );

    const parsed = await pipeline.run(input);

    expect(parsed.text).toBe('GOVERNMENT OF KERALA');
    expect(parsed.markdown).toBe('# GOVERNMENT OF KERALA');
    expect(parsed.chunks[0]?.text).toBe('chunk stays parser-owned');
  });

  test('applies chunk summariser output while preserving original text', async () => {
    const chunkSummariser: ChunkSummariser = {
      name: 'stub',
      summarise: async () => ({
        enhancedContent: 'Enhanced searchable description',
        warnings: ['ollama_chunk_summariser.image_limit:1/2'],
      }),
    };

    const { pipeline } = makePipeline(
      {
        chunks: [
          makeChunk({
            text: 'Revenue increased to 20.',
            originalText: 'Revenue increased to 20.',
            images: [{ mimeType: 'image/png', data: Buffer.from('image') }],
          }),
        ],
      },
      createNoopTextCleaner(),
      createNoopGluedWordNormalizer(),
      chunkSummariser,
    );

    const parsed = await pipeline.run(input);
    const chunk = parsed.chunks[0]!;

    expect(chunk.originalText).toBe('Revenue increased to 20.');
    expect(chunk.enhancedContent).toBe('Enhanced searchable description');
    expect(chunk.text).toBe('Enhanced searchable description');
    expect(parsed.warnings).toContain('ollama_chunk_summariser.image_limit:1/2');
  });
});
