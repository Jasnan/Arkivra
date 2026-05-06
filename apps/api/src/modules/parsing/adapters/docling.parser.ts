import type { DoclingClient } from '../../docling/docling.client.js';
import type { DocumentParser, ParseInput, ParserCapabilities } from '../parser.types.js';
import type { ParsedChunk, ParserOutput } from '../parsed-document.schema.js';
import type { ImageCaptioner } from '../image-captioner.js';
import type { DoclingChunkResponse } from './docling.schema.js';
import { PDFDocument } from 'pdf-lib';
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
  splitPdfPageThreshold?: number;
  splitPdfChunkPages?: number;
};

type DoclingInputPart = {
  fileName: string;
  fileData: Buffer;
  pageOffset: number;
  pageCount: number;
  partIndex: number;
  partCount: number;
};

type DoclingParsedPart = {
  text: string;
  markdown: string;
  embeddedImages?: ParserOutput['embeddedImages'];
  rawStructuredOutput?: ParserOutput['rawStructuredOutput'];
  structuredElements?: ParserOutput['structuredElements'];
  chunks: ParsedChunk[];
  warnings: string[];
};

function isPdfMimeType(mimeType: string) {
  return mimeType.toLowerCase() === 'application/pdf';
}

function splitFileName(fileName: string, partIndex: number, partCount: number) {
  const suffix = `.part-${String(partIndex + 1).padStart(3, '0')}-of-${String(partCount).padStart(3, '0')}`;
  const dotIndex = fileName.toLowerCase().endsWith('.pdf') ? fileName.length - 4 : -1;

  return dotIndex >= 0
    ? `${fileName.slice(0, dotIndex)}${suffix}.pdf`
    : `${fileName}${suffix}.pdf`;
}

async function buildDoclingInputParts({
  input,
  splitPdfPageThreshold,
  splitPdfChunkPages,
}: {
  input: ParseInput;
  splitPdfPageThreshold: number;
  splitPdfChunkPages: number;
}): Promise<DoclingInputPart[]> {
  const singlePart: DoclingInputPart = {
    fileName: input.fileName,
    fileData: input.fileData,
    pageOffset: 0,
    pageCount: 0,
    partIndex: 0,
    partCount: 1,
  };

  if (!isPdfMimeType(input.mimeType) || splitPdfPageThreshold <= 0 || splitPdfChunkPages <= 0) {
    return [singlePart];
  }

  let sourcePdf: PDFDocument;
  try {
    sourcePdf = await PDFDocument.load(input.fileData, { ignoreEncryption: true });
  } catch {
    return [singlePart];
  }

  const totalPages = sourcePdf.getPageCount();
  if (totalPages <= splitPdfPageThreshold) {
    return [{ ...singlePart, pageCount: totalPages }];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < totalPages; start += splitPdfChunkPages) {
    ranges.push({ start, end: Math.min(totalPages, start + splitPdfChunkPages) });
  }

  const parts: DoclingInputPart[] = [];
  for (const [partIndex, range] of ranges.entries()) {
    const splitPdf = await PDFDocument.create();
    const pageIndexes = Array.from(
      { length: range.end - range.start },
      (_, index) => range.start + index,
    );
    const copiedPages = await splitPdf.copyPages(sourcePdf, pageIndexes);
    for (const page of copiedPages) {
      splitPdf.addPage(page);
    }

    const bytes = await splitPdf.save();
    parts.push({
      fileName: splitFileName(input.fileName, partIndex, ranges.length),
      fileData: Buffer.from(bytes),
      pageOffset: range.start,
      pageCount: range.end - range.start,
      partIndex,
      partCount: ranges.length,
    });
  }

  return parts;
}

function offsetStructuredElements(
  elements: ParserOutput['structuredElements'],
  pageOffset: number,
  partIndex: number,
  partCount: number,
): ParserOutput['structuredElements'] {
  if (elements === undefined) return undefined;

  return elements.map(element => ({
    ...element,
    elementId: partCount === 1 ? element.elementId : `part-${partIndex + 1}:${element.elementId}`,
    parentId: element.parentId === null || partCount === 1 ? element.parentId : `part-${partIndex + 1}:${element.parentId}`,
    pageNumber: element.pageNumber === null ? null : element.pageNumber + pageOffset,
  }));
}

function offsetChunks({
  chunks,
  documentId,
  pageOffset,
  part,
  startIndex,
}: {
  chunks: ParsedChunk[];
  documentId: string;
  pageOffset: number;
  part: DoclingInputPart;
  startIndex: number;
}): ParsedChunk[] {
  return chunks.map((chunk, localIndex) => {
    const index = startIndex + localIndex;

    return {
      ...chunk,
      id: `${documentId}:${index}`,
      pageNumber: chunk.pageNumber === null ? null : chunk.pageNumber + pageOffset,
      pageStart: chunk.pageStart === null ? null : chunk.pageStart + pageOffset,
      pageEnd: chunk.pageEnd === null ? null : chunk.pageEnd + pageOffset,
      boundingBoxes: chunk.boundingBoxes.map(box => ({
        ...box,
        pageNumber: box.pageNumber + pageOffset,
      })),
      metadata: {
        ...chunk.metadata,
        index,
        doclingSplitPart: part.partIndex + 1,
        doclingSplitPartCount: part.partCount,
        doclingSplitPageOffset: part.pageOffset,
        doclingSplitPageCount: part.pageCount,
      },
    };
  });
}

export function createDoclingParser({
  doclingClient,
  engineVersion = 'v1',
  imageCaptioner,
  splitPdfPageThreshold = 10,
  splitPdfChunkPages = 10,
}: {
  doclingClient: DoclingClient;
  imageCaptioner?: ImageCaptioner;
} & DoclingParserOptions): DocumentParser {
  async function parseDoclingResponse({
    response,
    input,
    part,
    chunkStartIndex,
  }: {
    response: DoclingChunkResponse;
    input: ParseInput;
    part: DoclingInputPart;
    chunkStartIndex: number;
  }): Promise<DoclingParsedPart> {
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

    return {
      text,
      markdown,
      embeddedImages,
      rawStructuredOutput,
      structuredElements: offsetStructuredElements(
        structuredElements,
        part.pageOffset,
        part.partIndex,
        part.partCount,
      ),
      chunks: offsetChunks({
        chunks,
        documentId: input.documentId,
        pageOffset: part.pageOffset,
        part,
        startIndex: chunkStartIndex,
      }),
      warnings,
    };
  }

  async function parse(input: ParseInput): Promise<ParserOutput> {
    const parts = await buildDoclingInputParts({
      input,
      splitPdfPageThreshold,
      splitPdfChunkPages,
    });

    if (parts.length > 1) {
      console.info(
        `[docling-parser] splitting large PDF file="${input.fileName}" pages=${parts.reduce((sum, part) => sum + part.pageCount, 0)} parts=${parts.length} pagesPerPart=${splitPdfChunkPages}`,
      );
    }

    const parsedParts: DoclingParsedPart[] = [];
    let chunkStartIndex = 0;

    for (const part of parts) {
      const response = await doclingClient.chunkFile({
        fileName: part.fileName,
        mimeType: input.mimeType,
        fileData: part.fileData,
        convertOptions: {
          doOcr: false,
        },
      });

      const parsedPart = await parseDoclingResponse({
        response,
        input,
        part,
        chunkStartIndex,
      });

      parsedParts.push(parsedPart);
      chunkStartIndex += parsedPart.chunks.length;
    }

    const text = parsedParts.map(part => part.text).filter(value => value.length > 0).join('\n\n');
    const markdown = parsedParts.map(part => part.markdown).filter(value => value.length > 0).join('\n\n');
    const embeddedImages = parsedParts.flatMap(part => part.embeddedImages ?? []);
    const structuredElements = parsedParts.flatMap(part => part.structuredElements ?? []);
    const chunks = parsedParts.flatMap(part => part.chunks);
    const warnings = parsedParts.flatMap(part => part.warnings);
    const rawStructuredOutput = parts.length === 1
      ? parsedParts[0]?.rawStructuredOutput
      : {
          schema_name: 'ArkivraDoclingSplitDocument',
          split: {
            page_threshold: splitPdfPageThreshold,
            pages_per_part: splitPdfChunkPages,
            part_count: parts.length,
            parts: parts.map(part => ({
              file_name: part.fileName,
              page_offset: part.pageOffset,
              page_count: part.pageCount,
            })),
          },
          parts: parsedParts
            .map(part => part.rawStructuredOutput)
            .filter((value): value is Record<string, unknown> => value !== undefined),
        };

    const output: ParserOutput = {
      engine: 'docling',
      engineVersion,
      text,
      markdown,
      embeddedImages: embeddedImages.length > 0 ? embeddedImages : undefined,
      rawStructuredOutput,
      structuredElements: structuredElements.length > 0 ? structuredElements : undefined,
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
