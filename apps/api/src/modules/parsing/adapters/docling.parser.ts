import type { DoclingClient } from '../../docling/docling.client.js';
import type { DocumentParser, ParseInput, ParserCapabilities } from '../parser.types.js';
import type { ParserOutput } from '../parsed-document.schema.js';
import type { ImageCaptioner } from '../image-captioner.js';
import { ParserValidationError } from '../parser.types.js';
import { parserOutputSchema } from '../parsed-document.schema.js';
import {
  deriveDoclingPlainText,
  extractDataUriImages,
  sanitizeDoclingMarkdown,
  sanitizeDoclingText,
} from './docling.text.js';
import { mergeEmbeddedImages } from './docling.mapper.js';
import { extractDoclingStructuredContent } from './docling.structured.js';
import { mapDoclingChunksToParsedChunks } from './docling.chunk-mapper.js';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function buildImageCaptions({
  doclingDocument,
  imageCaptioner,
  warnings,
}: {
  doclingDocument: unknown;
  imageCaptioner?: ImageCaptioner;
  warnings: string[];
}): Promise<Map<string, string> | undefined> {
  if (imageCaptioner === undefined) return undefined;
  if (!isObject(doclingDocument)) return undefined;

  const captions = new Map<string, string>();
  const pictures = asArray(doclingDocument.pictures);

  for (const picture of pictures) {
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
    if (data.length === 0) continue;

    try {
      const caption = await imageCaptioner.caption({ mimeType, data });
      if (caption !== null) {
        captions.set(selfRef, caption);
      } else {
        warnings.push(`image_captioning_failed:${selfRef}`);
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `image_captioner.failed:${selfRef}:${error.message}`
          : `image_captioner.failed:${selfRef}`,
      );
    }
  }

  return captions.size > 0 ? captions : undefined;
}

const DOCLING_CAPABILITIES: ParserCapabilities = {
  ocr: true,
  tables: true,
  supportedMimeTypes: 'any',
};

export type DoclingParserOptions = {
  engineVersion?: string;
};

export function createDoclingParser({
  doclingClient,
  engineVersion = 'v1',
  imageCaptioner,
}: {
  doclingClient: DoclingClient;
  imageCaptioner?: ImageCaptioner;
} & DoclingParserOptions): DocumentParser {
  async function parse(input: ParseInput): Promise<ParserOutput> {
    const response = await doclingClient.chunkFile({
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileData: input.fileData,
      convertOptions: {
        doOcr: false,
      },
    });

    const docContent = response.documents[0]?.content;
    const rawMarkdown = docContent?.md_content ?? '';
    const rawText = docContent?.text_content ?? '';
    const markdownImages = extractDataUriImages(rawMarkdown);
    const markdown = sanitizeDoclingMarkdown(rawMarkdown);
    let structuredElements: ParserOutput['structuredElements'];
    let embeddedImages = markdownImages;
    let rawStructuredOutput: ParserOutput['rawStructuredOutput'];
    const warnings: string[] = [];

    try {
      if (docContent?.json_content !== undefined && docContent?.json_content !== null) {
        const structured = extractDoclingStructuredContent(docContent.json_content);
        rawStructuredOutput = structured.rawStructuredOutput;
        structuredElements = structured.structuredElements;
        embeddedImages = mergeEmbeddedImages(markdownImages, structured.embeddedImages) ?? markdownImages;
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `docling.structured_mapping_failed:${error.message}`
          : 'docling.structured_mapping_failed',
      );
    }

    const structuredText = structuredElements
      ?.map(element => element.text.trim())
      .filter(textPart => textPart.length > 0)
      .join('\n\n') ?? '';
    const text = deriveDoclingPlainText({
      text: sanitizeDoclingText(rawText),
      markdown,
    }) || structuredText;

    const docStatus = response.documents[0]?.status ?? '';
    if (docStatus.toLowerCase() === 'partial_success') {
      warnings.push('docling.partial_success');
    }
    const docErrors = response.documents[0]?.errors;
    if (Array.isArray(docErrors)) {
      warnings.push(...docErrors);
    }

    const chunks = mapDoclingChunksToParsedChunks({
      response,
      documentId: input.documentId,
      doclingDocument: docContent?.json_content !== undefined && docContent?.json_content !== null
        ? docContent.json_content as Record<string, unknown>
        : undefined,
      imageCaptions: await buildImageCaptions({
        doclingDocument: docContent?.json_content,
        imageCaptioner,
        warnings,
      }),
    });

    const output: ParserOutput = {
      engine: 'docling',
      engineVersion,
      text,
      markdown,
      embeddedImages,
      rawStructuredOutput,
      structuredElements,
      chunks,
      warnings,
    };

    const validation = parserOutputSchema.safeParse(output);
    if (!validation.success) {
      throw new ParserValidationError(
        `Docling adapter produced an invalid ParserOutput for ${input.documentId}`,
        'docling',
        { issues: validation.error.issues },
      );
    }

    return validation.data;
  }

  return {
    engine: 'docling',
    engineVersion,
    capabilities: DOCLING_CAPABILITIES,
    parse,
  };
}
