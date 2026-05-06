import type { ParserRegistry } from './parser.registry.js';
import type { ParseInput, ParserEngine } from './parser.types.js';
import type { ParserOutput } from './parsed-document.schema.js';
import type { ParsedDocument } from './parsed-document.schema.js';
import type { GluedWordNormalizer } from './glued-word-normalizer.js';
import type { ChunkSummariser } from './ollama-chunk-summariser.js';
import type { EmptyTextFallback } from './ollama-vision-text-fallback.js';
import type { TextCleaner } from './text-cleaner.js';
import type { ChunkerOptions } from './chunker.js';
import { ParserValidationError } from './parser.types.js';
import { parsedDocumentSchema, parserOutputSchema } from './parsed-document.schema.js';
import { markdownToPlainText } from './markdown-text.js';
import { chunkMarkdown, chunkStructuredElements } from './chunker.js';
import { extractDoclingStructuredContent } from './adapters/docling.structured.js';

function hasMeaningfulText(value: { text: string; markdown: string }) {
  return value.text.trim().length > 0 || value.markdown.trim().length > 0;
}

export type ParsePipelineOptions = {
  parserRegistry: ParserRegistry;
  cleaner: TextCleaner;
  gluedWordNormalizer?: GluedWordNormalizer;
  emptyTextFallback?: EmptyTextFallback;
  chunkSummariser?: ChunkSummariser;
  chunkerOptions?: Omit<ChunkerOptions, 'documentId'>;
  /** Explicit engine override; falls back to the registry default. */
  engine?: ParserEngine;
};

export type ParsePipelineStage = 'chunking' | 'summarising';

export type ParsePipelineRunHooks = {
  onStageChange?: (stage: ParsePipelineStage) => void | Promise<void>;
};

export type ParsePipeline = {
  run: (input: ParseInput, hooks?: ParsePipelineRunHooks) => Promise<ParsedDocument>;
  reprocessStored: (input: {
    documentId: string;
    engine: ParserEngine;
    engineVersion: string;
    rawText: string;
    rawMarkdown: string;
    rawStructuredOutput?: unknown;
    warnings?: string[];
  }, hooks?: ParsePipelineRunHooks) => Promise<ParsedDocument>;
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
  emptyTextFallback,
  chunkSummariser,
  chunkerOptions,
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

    // When the parser (or the empty-text fallback) emitted provenance-rich
    // structured elements, route them through the element-aware chunker so
    // every chunk carries page numbers, bounding boxes, table HTML and
    // image bytes. The legacy markdown chunker remains as the fallback for
    // parsers without provenance and for the rare path where text was
    // recovered without any elements.
    const chunkOptions: ChunkerOptions = {
      documentId,
      ...(chunkerOptions ?? {}),
    };

    await hooks?.onStageChange?.('chunking');

    const structuredElements = raw.structuredElements;
    const chunks =
      structuredElements !== undefined && structuredElements.length > 0
        ? chunkStructuredElements(structuredElements, chunkOptions)
        : chunkMarkdown(
            normalized.markdown.length > 0 ? normalized.markdown : normalizedText,
            chunkOptions,
          );

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

    let effectiveRaw = raw;
    if (!hasMeaningfulText(raw) && emptyTextFallback !== undefined) {
      const fallbackResult = await emptyTextFallback.run(input, raw);
      effectiveRaw = fallbackResult.output === null
        ? {
            ...raw,
            warnings: [...raw.warnings, ...fallbackResult.warnings],
          }
        : {
            ...raw,
            text: fallbackResult.output.text,
            markdown: fallbackResult.output.markdown,
            // Prefer the fallback's per-page synthesised elements when
            // present (they carry the recovered narrative); otherwise
            // keep whatever the parser already emitted.
            structuredElements:
              fallbackResult.output.structuredElements ?? raw.structuredElements,
            warnings: [...raw.warnings, ...fallbackResult.warnings],
          };
    }

    return buildParsedDocumentFromRawOutput(
      effectiveRaw,
      input.documentId,
      {
        text: raw.text,
        markdown: raw.markdown,
        structuredOutput: raw.rawStructuredOutput,
      },
      hooks,
    );
  }

  async function reprocessStored(input: {
    documentId: string;
    engine: ParserEngine;
    engineVersion: string;
    rawText: string;
    rawMarkdown: string;
    rawStructuredOutput?: unknown;
    warnings?: string[];
  }, hooks?: ParsePipelineRunHooks): Promise<ParsedDocument> {
    let rebuiltStructuredElements: ParserOutput['structuredElements'];
    let rebuiltEmbeddedImages: ParserOutput['embeddedImages'];
    const rebuiltWarnings = [...(input.warnings ?? [])];

    if (input.engine === 'docling' && input.rawStructuredOutput !== undefined) {
      try {
        const structured = extractDoclingStructuredContent(input.rawStructuredOutput);
        rebuiltStructuredElements = structured.structuredElements;
        rebuiltEmbeddedImages = structured.embeddedImages;
      } catch (error) {
        rebuiltWarnings.push(
          error instanceof Error
            ? `docling.structured_mapping_failed:${error.message}`
            : 'docling.structured_mapping_failed',
        );
      }
    }

    const normalizedStoredStructuredOutput =
      typeof input.rawStructuredOutput === 'object'
      && input.rawStructuredOutput !== null
      && !Array.isArray(input.rawStructuredOutput)
        ? input.rawStructuredOutput as Record<string, unknown>
        : undefined;

    const rawValidation = parserOutputSchema.safeParse({
      engine: input.engine,
      engineVersion: input.engineVersion,
      text: input.rawText,
      markdown: input.rawMarkdown,
      rawStructuredOutput: normalizedStoredStructuredOutput,
      structuredElements: rebuiltStructuredElements,
      embeddedImages: rebuiltEmbeddedImages,
      warnings: rebuiltWarnings,
    } satisfies ParserOutput);

    if (!rawValidation.success) {
      throw new ParserValidationError(
        `Stored parser artifacts produced an invalid ParserOutput for ${input.documentId}`,
        input.engine,
        { issues: rawValidation.error.issues },
      );
    }

    return buildParsedDocumentFromRawOutput(
      rawValidation.data,
      input.documentId,
      {
        text: input.rawText,
        markdown: input.rawMarkdown,
        structuredOutput: normalizedStoredStructuredOutput,
      },
      hooks,
    );
  }

  return { run, reprocessStored };
}
