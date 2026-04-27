import type { UnstructuredClient, UnstructuredElement } from '../../unstructured/unstructured.client.js';
import type { DocumentParser, ParseInput, ParserCapabilities } from '../parser.types.js';
import type {
  ParserOutput,
  StructuredElement,
  StructuredElementBbox,
  StructuredElementType,
} from '../parsed-document.schema.js';
import { ParserValidationError } from '../parser.types.js';
import { parserOutputSchema } from '../parsed-document.schema.js';

const UNSTRUCTURED_CAPABILITIES: ParserCapabilities = {
  ocr: true,
  tables: true,
  supportedMimeTypes: 'any',
};

export type UnstructuredParserOptions = {
  engineVersion?: string;
};

function normalizeWhitespace(value: string) {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function isHeadingElement(element: UnstructuredElement) {
  return element.type === 'Title';
}

function isListElement(element: UnstructuredElement) {
  return element.type === 'ListItem';
}

function isTableElement(element: UnstructuredElement) {
  return element.type === 'Table';
}

/**
 * Map an Unstructured element type label onto Arkivra's structured
 * element taxonomy. Unrecognised types fall back to `'other'` so future
 * Unstructured releases never crash ingestion.
 */
function mapStructuredElementType(type: string): StructuredElementType {
  switch (type) {
    case 'Title': {
      return 'title';
    }
    case 'NarrativeText': {
      return 'narrative';
    }
    case 'ListItem': {
      return 'list';
    }
    case 'Table': {
      return 'table';
    }
    case 'Image':
    case 'Figure':
    case 'FigureCaption': {
      return 'image';
    }
    default: {
      return 'other';
    }
  }
}

function normalisePageNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return null;
  }

  return Math.trunc(value);
}

/**
 * Convert Unstructured's polygon (`points: [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]`)
 * into an axis-aligned bounding box. Returns `null` when any required
 * field (points, layout dimensions, system) is missing or malformed so
 * downstream stages can degrade `citation_precision` to `'page'`.
 */
function extractBbox(element: UnstructuredElement): StructuredElementBbox | null {
  const coordinates = element.metadata.coordinates;
  if (coordinates === null || coordinates === undefined) {
    return null;
  }

  const points = coordinates.points;
  if (points === undefined || points.length === 0) {
    return null;
  }

  const layoutWidth = coordinates.layout_width;
  const layoutHeight = coordinates.layout_height;
  const system = coordinates.system;
  if (
    typeof layoutWidth !== 'number'
    || typeof layoutHeight !== 'number'
    || typeof system !== 'string'
    || system.length === 0
  ) {
    return null;
  }

  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);

  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
    layoutWidth,
    layoutHeight,
    system,
  };
}

function extractElementImage(element: UnstructuredElement): StructuredElement['image'] {
  const imageBase64 = asString(element.metadata.image_base64);
  if (imageBase64.length === 0) {
    return null;
  }

  const data = Buffer.from(imageBase64, 'base64');
  if (data.length === 0) {
    return null;
  }

  return {
    mimeType: asString(element.metadata.image_mime_type) || 'image/jpeg',
    data,
  };
}

function synthesiseElementId(element: UnstructuredElement, fallbackIndex: number) {
  const candidate = asString(element.element_id).trim();
  if (candidate.length > 0) {
    return candidate;
  }
  return `unstructured-${fallbackIndex}`;
}

/**
 * Walk Unstructured elements top-to-bottom and emit a provenance-rich
 * StructuredElement[]. Section heading carry-over is computed here so
 * the chunker can group elements without re-walking the tree.
 */
function buildStructuredElements(elements: UnstructuredElement[]): StructuredElement[] {
  const result: StructuredElement[] = [];
  let currentSection: string | null = null;

  for (const [index, element] of elements.entries()) {
    const text = element.text;
    const type = mapStructuredElementType(element.type);

    if (type === 'title') {
      const trimmed = text.trim();
      currentSection = trimmed.length > 0 ? trimmed : currentSection;
    }

    const tableHtml = type === 'table'
      ? (asString(element.metadata.text_as_html).trim() || null)
      : null;

    const image = type === 'image' ? extractElementImage(element) : null;

    result.push({
      elementId: synthesiseElementId(element, index),
      parentId: asString(element.metadata.parent_id) || null,
      type,
      text,
      tableHtml,
      image,
      pageNumber: normalisePageNumber(element.metadata.page_number),
      bbox: extractBbox(element),
      section: currentSection,
    });
  }

  return result;
}

function buildMarkdownBlock(element: UnstructuredElement) {
  const text = element.text.trim();
  const tableHtml = asString(element.metadata.text_as_html).trim();

  if (isTableElement(element)) {
    return tableHtml.length > 0 ? tableHtml : text;
  }

  if (text.length === 0) {
    return '';
  }

  if (isHeadingElement(element)) {
    return `# ${text}`;
  }

  if (isListElement(element)) {
    return `- ${text}`;
  }

  return text;
}

function extractEmbeddedImages(elements: UnstructuredElement[]) {
  const images: Array<{ mimeType: string; data: Buffer<ArrayBufferLike> }> = [];

  for (const element of elements) {
    const imageBase64 = asString(element.metadata.image_base64);
    if (imageBase64.length === 0) {
      continue;
    }

    const data = Buffer.from(imageBase64, 'base64');
    if (data.length === 0) {
      continue;
    }

    images.push({
      mimeType: asString(element.metadata.image_mime_type) || 'image/jpeg',
      data,
    });
  }

  return images;
}

function deriveWarnings(elements: UnstructuredElement[]) {
  const warnings: string[] = [];
  if (elements.length === 0) {
    warnings.push('unstructured.no_elements');
  }
  return warnings;
}

/**
 * Adapter for Unstructured's partition endpoint. It mirrors the notebook's
 * `partition_pdf(..., strategy="hi_res", infer_table_structure=True, ...)`
 * step, but returns Arkivra's parser-neutral ParserOutput instead of chunks.
 */
export function createUnstructuredParser({
  unstructuredClient,
  engineVersion = 'api-v1',
}: {
  unstructuredClient: UnstructuredClient;
} & UnstructuredParserOptions): DocumentParser {
  async function parse(input: ParseInput): Promise<ParserOutput> {
    const elements = await unstructuredClient.partitionFile({
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileData: input.fileData,
    });

    const text = normalizeWhitespace(
      elements
        .map(element => element.text.trim())
        .filter(Boolean)
        .join('\n\n'),
    );
    const markdown = normalizeWhitespace(
      elements
        .map(buildMarkdownBlock)
        .filter(Boolean)
        .join('\n\n'),
    );

    const output: ParserOutput = {
      engine: 'unstructured',
      engineVersion,
      text,
      markdown,
      embeddedImages: extractEmbeddedImages(elements),
      structuredElements: buildStructuredElements(elements),
      warnings: deriveWarnings(elements),
    };

    const validation = parserOutputSchema.safeParse(output);
    if (!validation.success) {
      throw new ParserValidationError(
        `Unstructured adapter produced an invalid ParserOutput for ${input.documentId}`,
        'unstructured',
        { issues: validation.error.issues },
      );
    }

    return validation.data;
  }

  return {
    engine: 'unstructured',
    engineVersion,
    capabilities: UNSTRUCTURED_CAPABILITIES,
    parse,
  };
}
