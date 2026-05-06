import type { ParserRegistry } from './parser.registry.js';
import type { ParseInput, ParserEngine } from './parser.types.js';
import type { ParserOutput } from './parsed-document.schema.js';
import type { ParsedDocument } from './parsed-document.schema.js';
import type { GluedWordNormalizer } from './glued-word-normalizer.js';
import type { ChunkSummariser } from './ollama-chunk-summariser.js';
import type { TextCleaner } from './text-cleaner.js';
import { ParserValidationError } from './parser.types.js';
import { parsedDocumentSchema, parserOutputSchema } from './parsed-document.schema.js';
import { markdownToPlainText } from './markdown-text.js';

export type ParsePipelineOptions = {
  parserRegistry: ParserRegistry;
  cleaner: TextCleaner;
  gluedWordNormalizer?: GluedWordNormalizer;
  chunkSummariser?: ChunkSummariser;
  /** Explicit engine override; falls back to the registry default. */
  engine?: ParserEngine;
};

export type ParsePipelineStage = 'chunking' | 'summarising';

export type ParsePipelineRunHooks = {
  onStageChange?: (stage: ParsePipelineStage) => void | Promise<void>;
};

export type ParsePipeline = {
  run: (input: ParseInput, hooks?: ParsePipelineRunHooks) => Promise<ParsedDocument>;
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
  chunkSummariser,
  engine,
}: ParsePipelineOptions): ParsePipeline {
  async function buildParsedDocumentFromRawOutput(
    raw: ParserOutput,
    documentId: string,
    persistedRaw?: {
      text: string;
      markdown: string;
      structuredOutput?: Record<string, unknown>;
    },
    hooks?: ParsePipelineRunHooks,
  ): Promise<ParsedDocument> {
    const cleaned = await cleaner.clean({ text: raw.text, markdown: raw.markdown });
    const normalized = await (gluedWordNormalizer?.normalize(cleaned) ?? Promise.resolve({
      text: cleaned.text,
      markdown: cleaned.markdown,
      replacements: [],
    }));
    const normalizedText = normalized.markdown.length > 0
      ? markdownToPlainText(normalized.markdown)
      : normalized.text;

    await hooks?.onStageChange?.('chunking');

    const parserChunks = raw.chunks;
    if (parserChunks === undefined) {
      throw new ParserValidationError(
        `Parse pipeline requires parser-provided chunks for ${documentId}`,
        raw.engine as ParserEngine,
      );
    }

    const chunks = parserChunks;

    const pipelineWarnings = [...raw.warnings];
    if (chunkSummariser !== undefined) {
      await hooks?.onStageChange?.('summarising');
      for (const chunk of chunks) {
        const summary = await chunkSummariser.summarise(chunk);
        chunk.enhancedContent = summary.enhancedContent;
        chunk.text = summary.enhancedContent ?? chunk.originalText;
        chunk.metadata.tokenCount = Math.ceil(chunk.text.length / 4);
        pipelineWarnings.push(...summary.warnings);
      }
    }

    const parsed: ParsedDocument = {
      documentId,
      engine: raw.engine,
      engineVersion: raw.engineVersion,
      text: normalizedText,
      markdown: normalized.markdown,
      rawText: persistedRaw?.text ?? raw.text,
      rawMarkdown: persistedRaw?.markdown ?? raw.markdown,
      rawStructuredOutput: persistedRaw?.structuredOutput ?? raw.rawStructuredOutput,
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
    const parser =
      engine !== undefined ? parserRegistry.get(engine) : parserRegistry.getDefault();

    const raw = await parser.parse(input);

    return buildParsedDocumentFromRawOutput(
      raw,
      input.documentId,
      {
        text: raw.text,
        markdown: raw.markdown,
        structuredOutput: raw.rawStructuredOutput,
      },
      hooks,
    );
  }

  return { run };
}
