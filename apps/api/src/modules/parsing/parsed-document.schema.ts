import { z } from 'zod';

export const PARSED_CHUNK_TYPES = ['heading', 'paragraph', 'table', 'list', 'other'] as const;
export type ParsedChunkType = (typeof PARSED_CHUNK_TYPES)[number];

export const parsedChunkSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  section: z.string().nullable(),
  pageNumber: z.number().int().min(1).nullable(),
  type: z.enum(PARSED_CHUNK_TYPES),
  metadata: z.record(z.string(), z.unknown()),
});

export type ParsedChunk = z.infer<typeof parsedChunkSchema>;

/**
 * Raw output of a {@link DocumentParser}. Engine-agnostic but NOT yet
 * cleaned or chunked. Downstream pipeline stages consume this.
 */
export const parserOutputSchema = z.object({
  engine: z.string().min(1),
  engineVersion: z.string().min(1),
  /** Raw text as emitted by the engine, after engine-specific sanitization
   *  (e.g. data-URI stripping) but BEFORE any cleanup rules. */
  text: z.string(),
  /** Raw markdown as emitted by the engine, after engine-specific sanitization. */
  markdown: z.string(),
  warnings: z.array(z.string()),
});

export type ParserOutput = z.infer<typeof parserOutputSchema>;

export const parsedDocumentSchema = z.object({
  documentId: z.string().min(1),
  engine: z.string().min(1),
  engineVersion: z.string().min(1),
  /** Cleaned text (post text-cleaner). Used for search + chunk context. */
  text: z.string(),
  /** Cleaned markdown (post text-cleaner). */
  markdown: z.string(),
  /** Raw text exactly as the engine returned it — preserved for audit. */
  rawText: z.string(),
  /** Raw markdown exactly as the engine returned it — preserved for audit. */
  rawMarkdown: z.string(),
  chunks: z.array(parsedChunkSchema),
  warnings: z.array(z.string()),
});

export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;
