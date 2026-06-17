import type { DocumentParser, ParserEngine } from './parser.types.js';

/**
 * Engine-agnostic registry. The worker only talks to this registry — adding a
 * new parser means registering another {@link DocumentParser}, with no other
 * changes required downstream.
 */
export type ParserRegistry = {
  get: (engine: ParserEngine) => DocumentParser;
  getDefault: () => DocumentParser;
  list: () => DocumentParser[];
  has: (engine: ParserEngine) => boolean;
};

export function createParserRegistry({
  parsers,
  defaultEngine,
}: {
  parsers: DocumentParser[];
  defaultEngine: ParserEngine;
}): ParserRegistry {
  if (parsers.length === 0) {
    throw new Error('createParserRegistry requires at least one parser');
  }

  const map = new Map<ParserEngine, DocumentParser>();
  for (const parser of parsers) {
    if (map.has(parser.engine)) {
      throw new Error(`Duplicate parser engine registered: "${parser.engine}"`);
    }
    map.set(parser.engine, parser);
  }

  const fallback = map.get(defaultEngine);
  if (fallback === undefined) {
    throw new Error(`Default parser engine "${defaultEngine}" is not registered`);
  }

  return {
    get(engine) {
      const parser = map.get(engine);
      if (parser === undefined) {
        throw new Error(`Parser engine "${engine}" is not registered`);
      }
      return parser;
    },
    getDefault() {
      return fallback;
    },
    list() {
      return [...map.values()];
    },
    has(engine) {
      return map.has(engine);
    },
  };
}
