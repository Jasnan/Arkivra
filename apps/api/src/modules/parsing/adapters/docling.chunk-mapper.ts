import type { DoclingChunkResponse } from '../../docling/docling.client.js';
import type {
  ChunkBoundingBox,
  CitationPrecision,
  ParsedChunk,
  ParsedChunkType,
} from '../parsed-document.schema.js';

type JsonObject = Record<string, unknown>;
type EmbeddedImage = { mimeType: string; data: Buffer };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function buildBboxLookup(doclingDocument: JsonObject): Map<string, ChunkBoundingBox[]> {
  const lookup = new Map<string, ChunkBoundingBox[]>();

  const pages = isObject(doclingDocument.pages) ? doclingDocument.pages : null;

  function getPageSize(pageNumber: number): { width: number; height: number } | null {
    if (pages === null) return null;
    const page = pages[String(pageNumber)];
    if (!isObject(page)) return null;
    const size = isObject(page.size) ? page.size : null;
    if (size === null) return null;
    const w = asNumber(size.width);
    const h = asNumber(size.height);
    if (w === null || h === null) return null;
    return { width: w, height: h };
  }

  function extractBboxes(item: JsonObject): ChunkBoundingBox[] {
    const bboxes: ChunkBoundingBox[] = [];
    for (const prov of asArray(item.prov)) {
      if (!isObject(prov)) continue;
      const pageNumber = asNumber(prov.page_no);
      const bbox = isObject(prov.bbox) ? prov.bbox : null;
      if (pageNumber === null || bbox === null) continue;

      const l = asNumber(bbox.l);
      const t = asNumber(bbox.t);
      const r = asNumber(bbox.r);
      const b = asNumber(bbox.b);
      if (l === null || t === null || r === null || b === null) continue;

      const pageSize = getPageSize(pageNumber);
      const layoutWidth = pageSize?.width ?? Math.max(l, r);
      const layoutHeight = pageSize?.height ?? Math.max(t, b);
      if (layoutWidth <= 0 || layoutHeight <= 0) continue;

      const origin = (asString(bbox.coord_origin) ?? 'TOPLEFT').toUpperCase();
      const x0 = Math.min(l, r);
      const x1 = Math.max(l, r);
      const y0 = origin === 'BOTTOMLEFT' ? layoutHeight - Math.max(t, b) : Math.min(t, b);
      const y1 = origin === 'BOTTOMLEFT' ? layoutHeight - Math.min(t, b) : Math.max(t, b);

      bboxes.push({
        pageNumber,
        x0,
        y0,
        x1,
        y1,
        layoutWidth,
        layoutHeight,
        system: 'PixelSpace',
      });
    }
    return bboxes;
  }

  for (const key of ['texts', 'tables', 'pictures', 'groups'] as const) {
    for (const item of asArray(doclingDocument[key])) {
      if (!isObject(item)) continue;
      const selfRef = asString(item.self_ref);
      if (selfRef === null) continue;
      const bboxes = extractBboxes(item);
      if (bboxes.length > 0) {
        lookup.set(selfRef, bboxes);
      }
    }
  }

  return lookup;
}

function buildImageLookup(doclingDocument: JsonObject): Map<string, EmbeddedImage> {
  const lookup = new Map<string, EmbeddedImage>();

  for (const picture of asArray(doclingDocument.pictures)) {
    if (!isObject(picture)) continue;
    const selfRef = asString(picture.self_ref);
    if (selfRef === null) continue;

    const image = isObject(picture.image) ? picture.image : null;
    if (image === null) continue;

    const uri = asString(image.uri);
    if (uri === null) continue;

    const match = uri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (match === null) continue;

    const mimeType = match[1] ?? asString(image.mimetype) ?? 'image/png';
    const base64 = match[2] ?? '';
    if (base64.length === 0) continue;

    const data = Buffer.from(base64, 'base64');
    if (data.length > 0) {
      lookup.set(selfRef, { mimeType, data });
    }
  }

  return lookup;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function inferChunkType(docItems: string[]): ParsedChunkType {
  if (docItems.length === 0) {
    return 'paragraph';
  }

  const lowerItems = docItems.map(item => item.toLowerCase());

  if (lowerItems.some(item => item.includes('table') || item.includes('/tables/'))) {
    return 'table';
  }

  if (lowerItems.some(item => item.includes('list'))) {
    return 'list';
  }

  if (lowerItems.some(item =>
    item.includes('title') ||
    item.includes('section_header') ||
    item.includes('document_title') ||
    item.includes('heading'),
  )) {
    return 'heading';
  }

  return 'paragraph';
}

function deriveCitationPrecision(bboxes: ChunkBoundingBox[], pageNumbers: number[]): CitationPrecision {
  if (bboxes.length > 0) {
    return 'box';
  }

  if (pageNumbers.length > 0) {
    return 'page';
  }

  return 'document';
}

export function mapDoclingChunksToParsedChunks({
  response,
  documentId,
  doclingDocument,
  imageCaptions,
}: {
  response: DoclingChunkResponse;
  documentId: string;
  doclingDocument?: JsonObject;
  imageCaptions?: Map<string, string>;
}): ParsedChunk[] {
  const bboxLookup = doclingDocument !== undefined
    ? buildBboxLookup(doclingDocument)
    : new Map<string, ChunkBoundingBox[]>();

  const imageLookup = doclingDocument !== undefined
    ? buildImageLookup(doclingDocument)
    : new Map<string, EmbeddedImage>();

  return response.chunks.map((chunk) => {
    const headings = chunk.headings ?? [];
    const pageNumbers = chunk.page_numbers ?? [];
    const docItems = chunk.doc_items;

    const boundingBoxes: ChunkBoundingBox[] = [];
    const images: EmbeddedImage[] = [];
    const captions: string[] = [];
    for (const ref of docItems) {
      const refBboxes = bboxLookup.get(ref);
      if (refBboxes !== undefined) {
        boundingBoxes.push(...refBboxes);
      }

      const refImage = imageLookup.get(ref);
      if (refImage !== undefined) {
        images.push(refImage);
        const caption = imageCaptions?.get(ref) ?? null;
        if (caption !== null) {
          captions.push(caption);
        }
      }
    }

    const section = headings.length > 0 ? (headings[headings.length - 1] ?? null) : null;
    const sectionPath = headings;
    const pageStart = pageNumbers.length > 0 ? Math.min(...pageNumbers) : null;
    const pageEnd = pageNumbers.length > 0 ? Math.max(...pageNumbers) : null;
    const sourceElementIds = docItems;
    const parentElementId = null;
    const citationPrecision = deriveCitationPrecision(boundingBoxes, pageNumbers);
    const type = inferChunkType(docItems);
    const tokenCount = chunk.num_tokens ?? estimateTokens(chunk.text);

    let text = chunk.text;
    if (captions.length > 0) {
      text = `${text}\n\n[Image descriptions: ${captions.join('; ')}]`;
    }

    return {
      id: `${documentId}:${chunk.chunk_index}`,
      text,
      section,
      sectionPath,
      pageNumber: pageStart,
      pageStart,
      pageEnd,
      boundingBoxes,
      sourceElementIds,
      parentElementId,
      originalText: chunk.raw_text ?? chunk.text,
      tablesHtml: [],
      images,
      citationPrecision,
      enhancedContent: null,
      type,
      metadata: {
        index: chunk.chunk_index,
        tokenCount,
        elementCount: docItems.length,
        doclingHeadings: headings,
        doclingCaptions: chunk.captions ?? [],
        doclingFilename: chunk.filename,
        imageCaptions: captions.length > 0 ? captions : undefined,
        ...chunk.metadata,
      },
    };
  });
}
