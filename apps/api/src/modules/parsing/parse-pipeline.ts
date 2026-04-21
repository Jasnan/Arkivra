import type { ParserRegistry } from './parser.registry.js';
import type { ParseInput, ParserEngine } from './parser.types.js';
import type { ParsedDocument } from './parsed-document.schema.js';
import type { GluedWordNormalizer } from './glued-word-normalizer.js';
import type { TextCleaner } from './text-cleaner.js';
import type { ChunkerOptions } from './chunker.js';
import { ParserValidationError } from './parser.types.js';
import { parsedDocumentSchema } from './parsed-document.schema.js';
import { markdownToPlainText } from './adapters/docling.text.js';
import { chunkMarkdown } from './chunker.js';

export type ParsePipelineOptions = {
  parserRegistry: ParserRegistry;
  cleaner: TextCleaner;
  gluedWordNormalizer?: GluedWordNormalizer;
  chunkerOptions?: Omit<ChunkerOptions, 'documentId'>;
  /** Explicit engine override; falls back to the registry default. */
  engine?: ParserEngine;
};

export type ParsePipeline = {
  run: (input: ParseInput) => Promise<ParsedDocument>;
};

/**
 * Composes parser → text cleaner → chunker into a single pipeline that
 * yields a validated {@link ParsedDocument}. This is the sole code path
 * the worker (or any future ingestion entrypoint) should use.
 */
export function createParsePipeline({
  parserRegistry,
  cleaner,
  gluedWordNormalizer,
  chunkerOptions,
  engine,
}: ParsePipelineOptions): ParsePipeline {
  async function run(input: ParseInput): Promise<ParsedDocument> {
    const parser =
      engine !== undefined ? parserRegistry.get(engine) : parserRegistry.getDefault();

    const raw = await parser.parse(input);

    const cleaned = await cleaner.clean({ text: raw.text, markdown: raw.markdown });
    const normalized = await (gluedWordNormalizer?.normalize(cleaned) ?? Promise.resolve({
      text: cleaned.text,
      markdown: cleaned.markdown,
      replacements: [],
    }));
    const normalizedText = normalized.markdown.length > 0
      ? markdownToPlainText(normalized.markdown)
      : normalized.text;

    const chunkSource = normalized.markdown.length > 0 ? normalized.markdown : normalizedText;
    const chunks = chunkMarkdown(chunkSource, {
      documentId: input.documentId,
      ...(chunkerOptions ?? {}),
    });

    const parsed: ParsedDocument = {
      documentId: input.documentId,
      engine: raw.engine,
      engineVersion: raw.engineVersion,
      text: normalizedText,
      markdown: normalized.markdown,
      rawText: raw.text,
      rawMarkdown: raw.markdown,
      chunks,
      warnings: raw.warnings,
    };

    const validation = parsedDocumentSchema.safeParse(parsed);
    if (!validation.success) {
      throw new ParserValidationError(
        `Parse pipeline produced an invalid ParsedDocument for ${input.documentId}`,
        parser.engine,
        { issues: validation.error.issues },
      );
    }

    return validation.data;
  }

  return { run };
}
