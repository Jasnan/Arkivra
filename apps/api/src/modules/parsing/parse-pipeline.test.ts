import type { DocumentParser, ParseInput } from './parser.types.js';
import type { ParserOutput } from './parsed-document.schema.js';
import type { TextCleaner } from './text-cleaner.js';
import { describe, expect, test, vi } from 'vitest';
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
) {
  const parser = makeParser(parserOverrides);
  const registry = createParserRegistry({ parsers: [parser], defaultEngine: 'docling' });
  const pipeline = createParsePipeline({ parserRegistry: registry, cleaner });
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
});
