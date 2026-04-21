import type { DocumentParser } from './parser.types.js';
import type { ParserOutput } from './parsed-document.schema.js';
import { describe, expect, test, vi } from 'vitest';
import { createParserRegistry } from './parser.registry.js';

function makeParser(engine: 'docling', version = 'v1'): DocumentParser {
  return {
    engine,
    engineVersion: version,
    capabilities: { ocr: true, tables: true, supportedMimeTypes: 'any' },
    parse: vi.fn(
      async (): Promise<ParserOutput> => ({
        engine,
        engineVersion: version,
        text: 'x',
        markdown: 'x',
        warnings: [],
      }),
    ),
  };
}

describe('parser registry', () => {
  test('returns the registered parser for a known engine', () => {
    const parser = makeParser('docling');
    const registry = createParserRegistry({ parsers: [parser], defaultEngine: 'docling' });

    expect(registry.get('docling')).toBe(parser);
    expect(registry.has('docling')).toBe(true);
  });

  test('throws when retrieving an unregistered engine', () => {
    const registry = createParserRegistry({
      parsers: [makeParser('docling')],
      defaultEngine: 'docling',
    });

    expect(() => registry.get('mineru' as 'docling')).toThrow(/not registered/);
  });

  test('throws when constructed without parsers', () => {
    expect(() =>
      createParserRegistry({ parsers: [], defaultEngine: 'docling' }),
    ).toThrow(/at least one parser/);
  });

  test('throws when the default engine is not in the list', () => {
    expect(() =>
      createParserRegistry({
        parsers: [makeParser('docling')],
        defaultEngine: 'mineru' as 'docling',
      }),
    ).toThrow(/not registered/);
  });

  test('throws when the same engine is registered twice', () => {
    expect(() =>
      createParserRegistry({
        parsers: [makeParser('docling'), makeParser('docling', 'v2')],
        defaultEngine: 'docling',
      }),
    ).toThrow(/Duplicate/);
  });

  test('getDefault returns the configured default parser', () => {
    const docling = makeParser('docling');
    const registry = createParserRegistry({ parsers: [docling], defaultEngine: 'docling' });

    expect(registry.getDefault()).toBe(docling);
  });
});
