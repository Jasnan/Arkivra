import type { DocumentParser, ParseInput } from './parser.types.js';
import type { ParserOutput } from './parsed-document.schema.js';
import type { GluedWordNormalizer } from './glued-word-normalizer.js';
import type { ChunkSummariser } from './ollama-chunk-summariser.js';
import type { EmptyTextFallback } from './ollama-vision-text-fallback.js';
import type { TextCleaner } from './text-cleaner.js';
import { describe, expect, test, vi } from 'vitest';
import { createNoopGluedWordNormalizer } from './glued-word-normalizer.js';
import { createParserRegistry } from './parser.registry.js';
import { createDeterministicTextCleaner, createNoopTextCleaner } from './text-cleaner.js';
import { createParsePipeline } from './parse-pipeline.js';

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
      warnings: [],
      ...raw,
    })),
  };
}

function makePipeline(
  parserOverrides: Partial<ParserOutput> = {},
  cleaner: TextCleaner = createNoopTextCleaner(),
  gluedWordNormalizer: GluedWordNormalizer = createNoopGluedWordNormalizer(),
  emptyTextFallback?: EmptyTextFallback,
  chunkSummariser?: ChunkSummariser,
) {
  const parser = makeParser(parserOverrides);
  const registry = createParserRegistry({ parsers: [parser], defaultEngine: 'docling' });
  const pipeline = createParsePipeline({
    parserRegistry: registry,
    cleaner,
    gluedWordNormalizer,
    emptyTextFallback,
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
      { text: 'Dirty  \ntext', markdown: '' },
      createDeterministicTextCleaner(),
    );

    const parsed = await pipeline.run(input);

    expect(parsed.rawText).toBe('Dirty  \ntext');
    expect(parsed.text).not.toBe(parsed.rawText);
    expect(parsed.text.includes('  ')).toBe(false);
  });

  test('runs cleaner BEFORE chunker (chunk texts contain cleaned content)', async () => {
    const cleaner: TextCleaner = {
      name: 'mark',
      clean: async (inputText) => ({
        text: inputText.text.replace(/raw/g, 'CLEAN'),
        markdown: inputText.markdown.replace(/raw/g, 'CLEAN'),
      }),
    };

    const { pipeline } = makePipeline({}, cleaner);
    const parsed = await pipeline.run(input);

    for (const chunk of parsed.chunks) {
      expect(chunk.text.includes('raw')).toBe(false);
      expect(chunk.text.includes('CLEAN')).toBe(true);
    }
  });

  test('uses markdown as chunking source when non-empty', async () => {
    const { pipeline } = makePipeline({
      text: 'ignored plain text',
      markdown: '# From Markdown\n\nHeadings preserved.',
    });

    const parsed = await pipeline.run(input);
    expect(parsed.chunks[0]?.section).toBe('From Markdown');
  });

  test('falls back to text when markdown is empty', async () => {
    const { pipeline } = makePipeline({ text: 'Plain only.', markdown: '' });
    const parsed = await pipeline.run(input);
    expect(parsed.chunks[0]?.text).toContain('Plain only.');
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
    // A parser that returns an empty engine string violates the schema's
    // `engine: z.string().min(1)` rule. The pipeline must surface this as a
    // ParserValidationError rather than silently persisting bad data.
    const { pipeline } = makePipeline({ engine: '' });

    await expect(pipeline.run(input)).rejects.toThrow(/invalid ParsedDocument/);
  });

  test('runs glued-word normalization after cleanup and before chunking', async () => {
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
      },
      createNoopTextCleaner(),
      normalizer,
    );

    const parsed = await pipeline.run(input);

    expect(parsed.text).toBe('GOVERNMENT OF KERALA');
    expect(parsed.markdown).toBe('# GOVERNMENT OF KERALA');
    expect(parsed.chunks[0]?.text).toContain('GOVERNMENT OF KERALA');
  });

  test('uses empty-text fallback output before chunking and preserves original raw parser text', async () => {
    const emptyTextFallback: EmptyTextFallback = {
      name: 'mock-vision',
      run: async () => ({
        output: {
          text: 'Recovered text from image',
          markdown: '',
        },
        warnings: ['ollama_vision_fallback.used:1'],
      }),
    };

    const { pipeline } = makePipeline(
      {
        text: '',
        markdown: '',
        embeddedImages: [{ mimeType: 'image/png', data: Buffer.from('image') }],
      },
      createNoopTextCleaner(),
      createNoopGluedWordNormalizer(),
      emptyTextFallback,
    );

    const parsed = await pipeline.run(input);

    expect(parsed.rawText).toBe('');
    expect(parsed.rawMarkdown).toBe('');
    expect(parsed.text).toBe('Recovered text from image');
    expect(parsed.chunks[0]?.text).toContain('Recovered text from image');
    expect(parsed.warnings).toEqual(['ollama_vision_fallback.used:1']);
  });

  test('routes provenance-rich parser output through the element-aware chunker', async () => {
    const tableHtml = '<table><tr><td>1</td></tr></table>';
    const imageData = Buffer.from('image-bytes');

    const { pipeline } = makePipeline({
      text: 'Methods\n\nWe trained models.\n\nA 1',
      markdown: `# Methods\n\nWe trained models.\n\n${tableHtml}`,
      structuredElements: [
        {
          elementId: 'el-1',
          parentId: null,
          type: 'title',
          text: 'Methods',
          tableHtml: null,
          image: null,
          pageNumber: 1,
          bbox: {
            x0: 0, y0: 0, x1: 100, y1: 50,
            layoutWidth: 612, layoutHeight: 792, system: 'PixelSpace',
          },
          section: 'Methods',
        },
        {
          elementId: 'el-2',
          parentId: 'el-1',
          type: 'narrative',
          text: 'We trained models.',
          tableHtml: null,
          image: null,
          pageNumber: 1,
          bbox: {
            x0: 0, y0: 60, x1: 500, y1: 200,
            layoutWidth: 612, layoutHeight: 792, system: 'PixelSpace',
          },
          section: 'Methods',
        },
        {
          elementId: 'el-3',
          parentId: 'el-1',
          type: 'table',
          text: 'A 1',
          tableHtml,
          image: null,
          pageNumber: 2,
          bbox: null,
          section: 'Methods',
        },
        {
          elementId: 'el-4',
          parentId: 'el-1',
          type: 'image',
          text: '',
          tableHtml: null,
          image: { mimeType: 'image/png', data: imageData },
          pageNumber: 2,
          bbox: null,
          section: 'Methods',
        },
      ],
    });

    const parsed = await pipeline.run(input);

    expect(parsed.chunks).toHaveLength(1);
    const chunk = parsed.chunks[0]!;

    expect(chunk.section).toBe('Methods');
    expect(chunk.pageStart).toBe(1);
    expect(chunk.pageEnd).toBe(2);
    expect(chunk.tablesHtml).toEqual([tableHtml]);
    expect(chunk.images).toHaveLength(1);
    expect(chunk.images[0]?.data.toString()).toBe('image-bytes');
    expect(chunk.sourceElementIds).toEqual(['el-2', 'el-3', 'el-4']);
    expect(chunk.parentElementId).toBe('el-1');
    // Mixed bbox / no-bbox elements → 'page'.
    expect(chunk.citationPrecision).toBe('page');
    expect(chunk.boundingBoxes).toHaveLength(1);
    expect(chunk.type).toBe('table');
  });

  test('falls back to markdown chunker when no structuredElements are emitted', async () => {
    const { pipeline } = makePipeline({
      text: 'plain text',
      markdown: '# Heading\n\nBody text only.',
    });

    const parsed = await pipeline.run(input);

    expect(parsed.chunks.length).toBeGreaterThan(0);
    for (const chunk of parsed.chunks) {
      expect(chunk.boundingBoxes).toEqual([]);
      expect(chunk.sourceElementIds).toEqual([]);
      expect(chunk.tablesHtml).toEqual([]);
      expect(chunk.images).toEqual([]);
      expect(chunk.citationPrecision).toBe('document');
    }
  });

  test('applies chunk summariser output to multimodal chunks while preserving original text', async () => {
    const chunkSummariser: ChunkSummariser = {
      name: 'stub',
      summarise: async (chunk) => ({
        enhancedContent:
          chunk.tablesHtml.length > 0 || chunk.images.length > 0
            ? 'Enhanced searchable description'
            : null,
        warnings: ['ollama_chunk_summariser.image_limit:1/2'],
      }),
    };

    const { pipeline } = makePipeline(
      {
        text: 'Results\n\nRevenue increased to 20.',
        markdown: '# Results\n\nRevenue increased to 20.',
        structuredElements: [
          {
            elementId: 'el-1',
            parentId: null,
            type: 'title',
            text: 'Results',
            tableHtml: null,
            image: null,
            pageNumber: 1,
            bbox: null,
            section: 'Results',
          },
          {
            elementId: 'el-2',
            parentId: 'el-1',
            type: 'narrative',
            text: 'Revenue increased to 20.',
            tableHtml: null,
            image: null,
            pageNumber: 1,
            bbox: null,
            section: 'Results',
          },
          {
            elementId: 'el-3',
            parentId: 'el-1',
            type: 'image',
            text: '',
            tableHtml: null,
            image: { mimeType: 'image/png', data: Buffer.from('image') },
            pageNumber: 1,
            bbox: null,
            section: 'Results',
          },
        ],
      },
      createNoopTextCleaner(),
      createNoopGluedWordNormalizer(),
      undefined,
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
