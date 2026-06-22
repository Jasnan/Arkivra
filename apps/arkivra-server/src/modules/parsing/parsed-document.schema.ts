import { z } from 'zod';

export const PARSED_CHUNK_TYPES = ['heading', 'paragraph', 'table', 'list', 'page', 'contextual', 'other'] as const;
export type ParsedChunkType = (typeof PARSED_CHUNK_TYPES)[number];

export const parserEmbeddedImageSchema = z.object({
  mimeType: z.string().min(1),
  data: z.instanceof(Buffer),
});

export const documentLanguageMetadataSchema = z.object({
  code: z.string().min(2).max(16),
  name: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.enum(['docling', 'heuristic', 'user']),
});

export type DocumentLanguageMetadata = z.infer<typeof documentLanguageMetadataSchema>;

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
 * Emitted by parsers that surface element metadata (layout-aware parsers, the
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
  sectionPath: z.array(z.string()).optional(),
});

export type StructuredElement = z.infer<typeof structuredElementSchema>;

export const CITATION_PRECISIONS = ['box', 'page', 'document'] as const;
export type CitationPrecision = (typeof CITATION_PRECISIONS)[number];

/**
 * Bounding box for a chunk citation. Mirrors {@link structuredElementBboxSchema}
 * but adds `pageNumber` so a single chunk can carry boxes spanning
 * multiple pages (e.g. a table that wraps).
 */
export const chunkBoundingBoxSchema = z.object({
  pageNumber: z.number().int().min(1),
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
  layoutWidth: z.number(),
  layoutHeight: z.number(),
  system: z.string(),
});

export type ChunkBoundingBox = z.infer<typeof chunkBoundingBoxSchema>;

export const parsedChunkSchema = z.object({
  id: z.string().min(1),
  /**
   * Embedded text. Equals `enhancedContent` when the Phase 3 summariser
   * filled it in; otherwise equals `originalText`. The legacy markdown
   * chunker keeps this populated for back-compat (= the chunk content).
   */
  text: z.string(),
  section: z.string().nullable(),
  sectionPath: z.array(z.string()).optional(),
  /** Legacy single page number; preserved for back-compat. New chunks
   *  should also populate `pageStart` / `pageEnd`. */
  pageNumber: z.number().int().min(1).nullable(),
  /** Lowest page number among the chunk's source elements. */
  pageStart: z.number().int().min(1).nullable(),
  /** Highest page number among the chunk's source elements. */
  pageEnd: z.number().int().min(1).nullable(),
  /** Per-element bounding boxes carried for citation rendering. */
  boundingBoxes: z.array(chunkBoundingBoxSchema),
  /** Element ids the chunk was derived from (verbatim). */
  sourceElementIds: z.array(z.string()),
  /** Optional parser-specific parent id carried from the source elements. */
  parentElementId: z.string().nullable(),
  /** Verbatim concatenation of every source element's `text`. Citations
   *  always render this; never `text` (which may be a summary). */
  originalText: z.string(),
  /** HTML for every `table` element merged into this chunk. */
  tablesHtml: z.array(z.string()),
  /** Image bytes for every `image` element merged into this chunk.
   *  Persistence writes these into `document_chunk_assets`. */
  images: z.array(parserEmbeddedImageSchema),
  /** Best-available citation granularity (see {@link CITATION_PRECISIONS}). */
  citationPrecision: z.enum(CITATION_PRECISIONS),
  /** Phase 3 vision-summariser output. `null` until populated. */
  enhancedContent: z.string().nullable(),
  type: z.enum(PARSED_CHUNK_TYPES),
  metadata: z.record(z.string(), z.unknown()),
});

export type ParsedChunk = z.infer<typeof parsedChunkSchema>;

/**
 * Raw output of a {@link DocumentParser}. Engine-agnostic but NOT yet
 * chunked. Downstream pipeline stages consume this.
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
  /** Raw parser-native structured artifact preserved for reprocessing. */
  rawStructuredOutput: z.record(z.string(), z.unknown()).optional(),
  /**
   * Optional provenance-preserving element list. Parsers that can emit
   * page numbers, bounding boxes, and element ids (e.g. a layout-aware
   * `hi_res`) populate this so downstream stages can produce
   * citation-grade chunks. Parsers that cannot supply provenance leave
   * it `undefined`; the pipeline keeps the legacy markdown-only path.
   */
  structuredElements: z.array(structuredElementSchema).optional(),
  /** Pre-built chunks from the parser (e.g. Docling HybridChunker).
   *  When present the pipeline skips its own chunking stage. */
  chunks: z.array(parsedChunkSchema).optional(),
  warnings: z.array(z.string()),
});

export type ParserOutput = z.infer<typeof parserOutputSchema>;

export const parsedDocumentSchema = z.object({
  documentId: z.string().min(1),
  engine: z.string().min(1),
  engineVersion: z.string().min(1),
  /** Canonical parser text used for search and chunk context. */
  text: z.string(),
  /** Canonical parser markdown. */
  markdown: z.string(),
  /** Raw text exactly as the engine returned it — preserved for audit. */
  rawText: z.string(),
  /** Raw markdown exactly as the engine returned it — preserved for audit. */
  rawMarkdown: z.string(),
  /** Raw parser-native structured artifact preserved for reprocessing. */
  rawStructuredOutput: z.record(z.string(), z.unknown()).optional(),
  /**
   * Normalized parser-native elements with Docling provenance. Stored once per
   * version and used to resolve citation boxes from element ids.
   */
  structuredElements: z.array(structuredElementSchema).optional(),
  /** Dominant source language detected from parser metadata or normalized text. */
  language: documentLanguageMetadataSchema.nullable(),
  chunks: z.array(parsedChunkSchema),
  warnings: z.array(z.string()),
});

export type ParsedDocument = z.infer<typeof parsedDocumentSchema>;
