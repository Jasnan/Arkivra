import type { DocumentParser, ParserEngine } from './parser.types.js';
import type { ParserOutput } from './parsed-document.schema.js';
import { describe, expect, test, vi } from 'vitest';
import { createParserRegistry } from './parser.registry.js';

function makeParser(engine: ParserEngine, version = 'v1'): DocumentParser {
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
    const parser = makeParser('unstructured');
    const registry = createParserRegistry({ parsers: [parser], defaultEngine: 'unstructured' });

    expect(registry.get('unstructured')).toBe(parser);
    expect(registry.has('unstructured')).toBe(true);
  });

  test('throws when retrieving an unregistered engine', () => {
    const registry = createParserRegistry({
      parsers: [makeParser('unstructured')],
      defaultEngine: 'unstructured',
    });

    expect(() => registry.get('unknown' as ParserEngine)).toThrow(/not registered/);
  });

  test('throws when constructed without parsers', () => {
    expect(() =>
      createParserRegistry({ parsers: [], defaultEngine: 'unstructured' }),
    ).toThrow(/at least one parser/);
  });

  test('throws when the default engine is not in the list', () => {
    expect(() =>
      createParserRegistry({
        parsers: [makeParser('unstructured')],
        defaultEngine: 'unknown' as ParserEngine,
      }),
    ).toThrow(/not registered/);
  });

  test('uses Unstructured as the default parser', () => {
    const unstructured = makeParser('unstructured');
    const registry = createParserRegistry({
      parsers: [unstructured],
      defaultEngine: 'unstructured',
    });

    expect(registry.getDefault()).toBe(unstructured);
    expect(registry.has('unstructured')).toBe(true);
  });

  test('throws when the same engine is registered twice', () => {
    expect(() =>
      createParserRegistry({
        parsers: [makeParser('unstructured'), makeParser('unstructured', 'v2')],
        defaultEngine: 'unstructured',
      }),
    ).toThrow(/Duplicate/);
  });

  test('getDefault returns the configured default parser', () => {
    const unstructured = makeParser('unstructured');
    const registry = createParserRegistry({ parsers: [unstructured], defaultEngine: 'unstructured' });

    expect(registry.getDefault()).toBe(unstructured);
  });
});
