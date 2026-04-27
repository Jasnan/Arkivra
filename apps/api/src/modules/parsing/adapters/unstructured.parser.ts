import type { UnstructuredClient, UnstructuredElement } from '../../unstructured/unstructured.client.js';
import type { DocumentParser, ParseInput, ParserCapabilities } from '../parser.types.js';
import type { ParserOutput } from '../parsed-document.schema.js';
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
