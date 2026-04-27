import { z } from 'zod';

export const PARSED_CHUNK_TYPES = ['heading', 'paragraph', 'table', 'list', 'other'] as const;
export type ParsedChunkType = (typeof PARSED_CHUNK_TYPES)[number];

export const parserEmbeddedImageSchema = z.object({
  mimeType: z.string().min(1),
  data: z.instanceof(Buffer),
});

export const STRUCTURED_ELEMENT_TYPES = [
  'title',
  'narrative',
  'list',
  'table',
  'image',
  'other',
] as const;
export type StructuredElementType = (typeof STRUCTURED_ELEMENT_TYPES)[number];

/**
 * Bounding box for a structured element. `x0/y0/x1/y1` are in the
 * coordinate system named by `system` (e.g. `'PixelSpace'`); the layout
 * dimensions describe the rendered page so consumers can map the box
 * onto an arbitrary viewport without losing precision.
 */
export const structuredElementBboxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
  layoutWidth: z.number(),
  layoutHeight: z.number(),
  system: z.string(),
});

export type StructuredElementBbox = z.infer<typeof structuredElementBboxSchema>;

/**
 * Provenance-preserving representation of a single document element.
 * Emitted by parsers that surface element metadata (Unstructured, the
 * vision fallback) and consumed by the element-aware chunker introduced
 * in Phase 2 of the multimodal RAG ingestion plan.
 *
 * Parsers without provenance (e.g. legacy markdown emitters) may omit
 * this array entirely; the pipeline falls back to markdown chunking in
 * that case.
 */
export const structuredElementSchema = z.object({
  elementId: z.string().min(1),
  parentId: z.string().nullable(),
  type: z.enum(STRUCTURED_ELEMENT_TYPES),
  text: z.string(),
  tableHtml: z.string().nullable(),
  image: parserEmbeddedImageSchema.nullable(),
  pageNumber: z.number().int().min(1).nullable(),
  bbox: structuredElementBboxSchema.nullable(),
  section: z.string().nullable(),
});

export type StructuredElement = z.infer<typeof structuredElementSchema>;

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
  embeddedImages: z.array(parserEmbeddedImageSchema).optional(),
  /**
   * Optional provenance-preserving element list. Parsers that can emit
   * page numbers, bounding boxes, and element ids (e.g. Unstructured
   * `hi_res`) populate this so downstream stages can produce
   * citation-grade chunks. Parsers that cannot supply provenance leave
   * it `undefined`; the pipeline keeps the legacy markdown-only path.
   */
  structuredElements: z.array(structuredElementSchema).optional(),
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
