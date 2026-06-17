import type { DocumentParser, ParseInput } from './parser.types.js';
import type { ParsedChunk, ParserOutput } from './parsed-document.schema.js';
import type { ChunkSummariser } from './ollama-chunk-summariser.js';
import type { TextCleaner } from './text-cleaner.js';
import { describe, expect, test, vi } from 'vitest';
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
  chunkSummariser?: ChunkSummariser,
) {
  const parser = makeParser(parserOverrides);
  const registry = createParserRegistry({ parsers: [parser], defaultEngine: 'docling' });
  const pipeline = createParsePipeline({
    parserRegistry: registry,
    cleaner,
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

  test('keeps Docling OCR text canonical for scan-heavy output', async () => {
    const { pipeline } = makePipeline(
      {
        text: 'OCR  canonical  text',
        markdown: '# Docling markdown text',
        rawStructuredOutput: {
          schema_name: 'DoclingDocument',
          arkivra_processing: {
            processing_path: 'scan-heavy',
            canonical_text_source: 'docling',
          },
        },
      },
      createDeterministicTextCleaner(),
    );

    const parsed = await pipeline.run(input);

    expect(parsed.text).toBe('OCR canonical text');
    expect(parsed.rawMarkdown).toBe('# Docling markdown text');
    expect(parsed.markdown).toBe('# Docling markdown text');
  });

  test('uses parser-provided chunks with file name metadata', async () => {
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

    expect(parsed.chunks).toEqual([
      {
        ...chunk,
        metadata: {
          ...chunk.metadata,
          fileName: 'file.pdf',
        },
      },
    ]);
  });

  test('stores only the basename as chunk file metadata', async () => {
    const { pipeline } = makePipeline({
      chunks: [makeChunk()],
    });

    const parsed = await pipeline.run({
      ...input,
      fileName: 'C:\\uploads\\nested\\source.pdf',
    });

    expect(parsed.chunks[0]?.metadata.fileName).toBe('source.pdf');
  });

  test('adds raw text offsets to plain text chunks', async () => {
    const fileText = [
      'First sentence in the notes.',
      'The renewal notice must be sent',
      'within 30 days of approval.',
      'Final sentence.',
    ].join('\n');
    const startOffset = fileText.indexOf('The renewal notice');
    const endOffset = fileText.indexOf('Final sentence.') - 1;
    const { pipeline } = makePipeline({
      chunks: [
        makeChunk({
          text: 'The renewal notice must be sent within 30 days of approval.',
          originalText: 'The renewal notice must be sent within 30 days of approval.',
        }),
      ],
    });

    const parsed = await pipeline.run({
      ...input,
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      fileData: Buffer.from(fileText),
    });

    expect(parsed.chunks[0]?.metadata.textLocator).toEqual({
      sourceType: 'rawText',
      startOffset,
      endOffset,
    });
  });

  test('adds raw Markdown offsets to Markdown chunks', async () => {
    const fileText = [
      '# Renewal policy',
      '',
      '1. Give member `full` AI access on one vault.',
      '2. Go to `/chat`.',
      '3. Expected: global chat is available.',
    ].join('\n');
    const startOffset = fileText.indexOf('1. Give member');
    const endOffset = fileText.length;
    const { pipeline } = makePipeline({
      chunks: [
        makeChunk({
          text: [
            '1. Give member full AI access on one vault.',
            '2. Go to /chat.',
            '3. Expected: global chat is available.',
          ].join(' '),
          originalText: [
            '1. Give member full AI access on one vault.',
            '2. Go to /chat.',
            '3. Expected: global chat is available.',
          ].join(' '),
        }),
      ],
    });

    const parsed = await pipeline.run({
      ...input,
      fileName: 'policy.md',
      mimeType: 'text/markdown',
      fileData: Buffer.from(fileText),
    });

    expect(parsed.chunks[0]?.metadata.textLocator).toEqual({
      sourceType: 'rawMarkdown',
      startOffset,
      endOffset,
    });
  });

  test('matches Markdown chunks when fenced code blocks include an info string', async () => {
    const fileText = [
      'Below is a practical manual QA script.',
      '',
      '1. Start the app:',
      '',
      '```bash',
      'docker compose up -d',
      'pnpm db:migrate',
      'pnpm dev:web',
      '```',
      '',
      '2. Open `http://localhost:5173`.',
    ].join('\n');
    const startOffset = fileText.indexOf('Below is a practical');
    const endOffset = fileText.length;
    const { pipeline } = makePipeline({
      chunks: [
        makeChunk({
          text: [
            'Below is a practical manual QA script.',
            '1. Start the app:',
            'docker compose up -d',
            'pnpm db:migrate',
            'pnpm dev:web',
            '2. Open http://localhost:5173.',
          ].join(' '),
          originalText: [
            'Below is a practical manual QA script.',
            '1. Start the app:',
            '```',
            'docker compose up -d',
            'pnpm db:migrate',
            'pnpm dev:web',
            '```',
            '2. Open `http://localhost:5173` .',
          ].join('\n'),
        }),
      ],
    });

    const parsed = await pipeline.run({
      ...input,
      fileName: 'qa.md',
      mimeType: 'text/markdown',
      fileData: Buffer.from(fileText),
    });

    expect(parsed.chunks[0]?.metadata.textLocator).toEqual({
      sourceType: 'rawMarkdown',
      startOffset,
      endOffset,
    });
  });

  test('infers Markdown offsets for edge chunks from neighboring exact matches', async () => {
    const fileText = [
      '# QA script',
      '',
      'Below is a practical manual QA script.',
      '',
      '## Invite Acceptance',
      '',
      '1. Log in as root.',
      '2. Create an invite.',
      '',
      '## Global Chat',
      '',
      '1. Give member `full` AI access on one vault.',
      '2. Go to `/chat`.',
    ].join('\n');
    const firstEndOffset = fileText.indexOf('Invite Acceptance') - 1;
    const middleStartOffset = fileText.indexOf('Invite Acceptance');
    const middleEndOffset = fileText.indexOf('\n\n## Global Chat');
    const lastStartOffset = fileText.indexOf('## Global Chat');
    const { pipeline } = makePipeline({
      chunks: [
        makeChunk({
          text: 'This parser text does not exactly match the first source range.',
          originalText: 'This parser text does not exactly match the first source range.',
        }),
        makeChunk({
          text: ['Invite Acceptance', '1. Log in as root.', '2. Create an invite.'].join(' '),
          originalText: ['Invite Acceptance', '1. Log in as root.', '2. Create an invite.'].join(
            ' ',
          ),
        }),
        makeChunk({
          text: 'This parser text does not exactly match the last source range.',
          originalText: 'This parser text does not exactly match the last source range.',
        }),
      ],
    });

    const parsed = await pipeline.run({
      ...input,
      fileName: 'qa.md',
      mimeType: 'text/markdown',
      fileData: Buffer.from(fileText),
    });

    expect(parsed.chunks.map((chunk) => chunk.metadata.textLocator)).toEqual([
      {
        sourceType: 'rawMarkdown',
        startOffset: 0,
        endOffset: firstEndOffset,
      },
      {
        sourceType: 'rawMarkdown',
        startOffset: middleStartOffset,
        endOffset: middleEndOffset,
      },
      {
        sourceType: 'rawMarkdown',
        startOffset: lastStartOffset,
        endOffset: fileText.length,
      },
    ]);
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

  test('detects source language from cleaned document text', async () => {
    const { pipeline } = makePipeline({
      text: 'Dies ist eine Rechnung und die Zahlung ist innerhalb von vierzehn Tagen fällig. Der Betrag ist mit der angegebenen Referenz zu überweisen.',
      markdown: '',
    });

    const parsed = await pipeline.run(input);

    expect(parsed.language).toMatchObject({
      code: 'de',
      name: 'German',
      source: 'heuristic',
    });
  });

  test('uses parser language metadata before heuristic detection', async () => {
    const { pipeline } = makePipeline({
      text: 'This document text is English, but the parser metadata wins when present.',
      markdown: '',
      rawStructuredOutput: {
        schema_name: 'DoclingDocument',
        metadata: { language: 'de' },
      },
    });

    const parsed = await pipeline.run(input);

    expect(parsed.language).toEqual({
      code: 'de',
      name: 'German',
      confidence: null,
      source: 'docling',
    });
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
