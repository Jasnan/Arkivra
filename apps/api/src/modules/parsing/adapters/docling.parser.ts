import type { DoclingClient, DoclingConvertOptions } from '../../docling/docling.client.js';
import type { DocumentParser, ParseInput, ParserCapabilities } from '../parser.types.js';
import type { ParsedChunk, ParserOutput } from '../parsed-document.schema.js';
import type { ImageCaptioner } from '../image-captioner.js';
import type { DoclingChunkResponse } from './docling.schema.js';
import { PDFDocument } from 'pdf-lib';
import { ParserValidationError } from '../parser.types.js';
import { parserOutputSchema } from '../parsed-document.schema.js';
import type { PdfScanClassifierConfig, PdfScanClassification } from '../pdf-ocr-decider.js';
import {
  classifyPdfForProcessing,
  DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG,
} from '../pdf-ocr-decider.js';
import {
  deriveDoclingPlainText,
  extractDataUriImages,
  sanitizeDoclingMarkdown,
  sanitizeDoclingText,
} from './docling.text.js';
import { mergeEmbeddedImages } from './docling.mapper.js';
import { extractDoclingStructuredContent } from './docling.structured.js';
import { mapDoclingChunksToParsedChunks } from './docling.chunk-mapper.js';
import { buildDoclingRetrievalRepresentations } from './docling.retrieval-representations.js';

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

const DEFAULT_SCAN_HEAVY_OCR_PRESET = 'auto';
const DEFAULT_VLM_ENABLED = false;
const DEFAULT_VLM_PIPELINE_PRESET = 'default';

export type DoclingParserOptions = {
  engineVersion?: string;
  splitPdfPageThreshold?: number;
  splitPdfChunkPages?: number;
  scanClassifier?: Partial<PdfScanClassifierConfig>;
  scanHeavyOcrPreset?: string;
  vlmEnabled?: boolean;
  vlmPipelinePreset?: string;
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
  processingContext: DoclingProcessingContext;
};

type DoclingParsedChunker = 'hybrid';
type DoclingChunkInput = 'original_file' | 'ocr_layout_sidecar';

type DoclingProcessingContext = {
  classification: PdfScanClassification;
  doclingOcrEnabled?: boolean;
  ocrPreset?: string;
  pipeline?: DoclingConvertOptions['pipeline'];
  vlmPipelinePreset?: string;
  vlmPipelineCustomConfig?: string;
  fallbackReason?: string;
};

function shouldBuildFineGrainedCitationChunks({
  input,
  processingContext,
}: {
  input: ParseInput;
  processingContext: DoclingProcessingContext;
}) {
  return (
    isImageFile(input) ||
    processingContext.classification.path === 'scan-heavy' ||
    processingContext.classification.path === 'mixed'
  );
}

function isPdfMimeType(mimeType: string) {
  return mimeType.toLowerCase() === 'application/pdf';
}

function isImageFile(input: Pick<ParseInput, 'mimeType' | 'fileName'>) {
  const normalizedMimeType = input.mimeType.toLowerCase();
  const normalizedFileName = input.fileName.toLowerCase();

  return (
    normalizedMimeType.startsWith('image/') ||
    ['.gif', '.jpeg', '.jpg', '.png', '.webp'].some((extension) =>
      normalizedFileName.endsWith(extension),
    )
  );
}

function splitFileName(fileName: string, partIndex: number, partCount: number) {
  const suffix = `.part-${String(partIndex + 1).padStart(3, '0')}-of-${String(partCount).padStart(3, '0')}`;
  const dotIndex = fileName.toLowerCase().endsWith('.pdf') ? fileName.length - 4 : -1;

  return dotIndex >= 0 ? `${fileName.slice(0, dotIndex)}${suffix}.pdf` : `${fileName}${suffix}.pdf`;
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

  return elements.map((element) => ({
    ...element,
    elementId: partCount === 1 ? element.elementId : `part-${partIndex + 1}:${element.elementId}`,
    parentId:
      element.parentId === null || partCount === 1
        ? element.parentId
        : `part-${partIndex + 1}:${element.parentId}`,
    pageNumber: element.pageNumber === null ? null : element.pageNumber + pageOffset,
  }));
}

function offsetElementIdForPart(value: string, part: DoclingInputPart) {
  return part.partCount === 1 ? value : `part-${part.partIndex + 1}:${value}`;
}

function offsetProvenanceForPart(value: unknown, part: DoclingInputPart) {
  if (!Array.isArray(value) || part.partCount === 1) {
    return value;
  }

  return value.map((entry) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      Array.isArray(entry) ||
      typeof (entry as { elementId?: unknown }).elementId !== 'string'
    ) {
      return entry;
    }

    const pageNumber = (entry as { pageNumber?: unknown }).pageNumber;
    const bbox = (entry as { bbox?: unknown }).bbox;
    const offsetEntry: Record<string, unknown> = {
      ...entry,
      elementId: offsetElementIdForPart((entry as { elementId: string }).elementId, part),
    };

    if (typeof pageNumber === 'number') {
      offsetEntry.pageNumber = pageNumber + part.pageOffset;
    }

    if (
      typeof bbox === 'object' &&
      bbox !== null &&
      !Array.isArray(bbox) &&
      typeof (bbox as { pageNumber?: unknown }).pageNumber === 'number'
    ) {
      offsetEntry.bbox = {
        ...(bbox as Record<string, unknown>),
        pageNumber: (bbox as { pageNumber: number }).pageNumber + part.pageOffset,
      };
    }

    return offsetEntry;
  });
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
    const metadata: ParsedChunk['metadata'] = {
      ...chunk.metadata,
      index,
      doclingSplitPart: part.partIndex + 1,
      doclingSplitPartCount: part.partCount,
      doclingSplitPageOffset: part.pageOffset,
      doclingSplitPageCount: part.pageCount,
    };
    const tableProvenance = offsetProvenanceForPart(chunk.metadata.tableProvenance, part);
    const imageProvenance = offsetProvenanceForPart(chunk.metadata.imageProvenance, part);

    if (tableProvenance !== undefined) {
      metadata.tableProvenance = tableProvenance;
    }
    if (imageProvenance !== undefined) {
      metadata.imageProvenance = imageProvenance;
    }

    return {
      ...chunk,
      id: `${documentId}:${index}`,
      pageNumber: chunk.pageNumber === null ? null : chunk.pageNumber + pageOffset,
      pageStart: chunk.pageStart === null ? null : chunk.pageStart + pageOffset,
      pageEnd: chunk.pageEnd === null ? null : chunk.pageEnd + pageOffset,
      boundingBoxes: chunk.boundingBoxes.map((box) => ({
        ...box,
        pageNumber: box.pageNumber + pageOffset,
      })),
      sourceElementIds: chunk.sourceElementIds.map((sourceElementId) =>
        offsetElementIdForPart(sourceElementId, part),
      ),
      parentElementId:
        chunk.parentElementId === null ? null : offsetElementIdForPart(chunk.parentElementId, part),
      metadata,
    };
  });
}

function buildProcessingMetadata({
  classification,
  doclingOcrEnabled,
  ocrPreset,
  pipeline,
  vlmPipelinePreset,
  vlmPipelineCustomConfig,
  fallbackReason,
}: DoclingProcessingContext) {
  const metadata: Record<string, unknown> = {
    processing_path: classification.path,
    canonical_text_source: 'docling',
    docling_ocr_enabled: doclingOcrEnabled ?? classification.doclingDoOcr,
    docling_ocr_preset: ocrPreset ?? null,
    fallback_reason: fallbackReason ?? null,
    scan_classifier: {
      is_pdf: classification.isPdf,
      total_pages: classification.totalPages,
      sampled_pages: classification.sampledPages,
      digital_page_ratio: classification.digitalPageRatio,
      scanned_page_ratio: classification.scannedPageRatio,
      text_item_count: classification.textItemCount,
      alphanumeric_char_count: classification.alphanumericCharCount,
      image_object_count: classification.imageObjectCount,
      reason: classification.reason,
      thresholds: classification.thresholds,
      pages: classification.pageStats.map((page) => ({
        page_number: page.pageNumber,
        text_item_count: page.textItemCount,
        alphanumeric_char_count: page.alphanumericCharCount,
        image_object_count: page.imageObjectCount,
        is_digital: page.isDigital,
        is_scanned_like: page.isScannedLike,
      })),
    },
  };

  if (pipeline !== undefined) {
    metadata.docling_pipeline = pipeline;
  }
  if (vlmPipelinePreset !== undefined) {
    metadata.docling_vlm_pipeline_preset = vlmPipelinePreset;
  }
  if (vlmPipelineCustomConfig !== undefined) {
    metadata.docling_vlm_pipeline_custom_config_enabled = true;
  }

  return metadata;
}

function buildChunkProcessingMetadata(processingContext: DoclingProcessingContext) {
  return {
    doclingOcrEnabled:
      processingContext.doclingOcrEnabled ?? processingContext.classification.doclingDoOcr,
    doclingOcrPreset: processingContext.ocrPreset ?? null,
    processingPath: processingContext.classification.path,
    canonicalTextSource: 'docling',
    ...(processingContext.pipeline !== undefined
      ? { doclingPipeline: processingContext.pipeline }
      : {}),
    ...(processingContext.vlmPipelinePreset !== undefined
      ? { doclingVlmPipelinePreset: processingContext.vlmPipelinePreset }
      : {}),
    ...(processingContext.vlmPipelineCustomConfig !== undefined
      ? { doclingVlmPipelineCustomConfigEnabled: true }
      : {}),
  };
}

function augmentRawStructuredOutput({
  rawStructuredOutput,
  processingContext,
}: {
  rawStructuredOutput: ParserOutput['rawStructuredOutput'];
  processingContext: DoclingProcessingContext;
}): ParserOutput['rawStructuredOutput'] {
  const base = rawStructuredOutput ?? {
    schema_name: 'ArkivraDoclingProcessingDocument',
  };

  return {
    ...base,
    arkivra_processing: buildProcessingMetadata(processingContext),
  };
}

function deriveTextFromDoclingChunks(response: DoclingChunkResponse) {
  return response.chunks
    .map((chunk) => sanitizeDoclingText(chunk.raw_text ?? chunk.text))
    .filter((text) => text.length > 0)
    .join('\n\n');
}

function hasRenderableBoundingBoxes(chunks: ParsedChunk[]) {
  return chunks.some((chunk) =>
    chunk.boundingBoxes.some(
      (box) =>
        box.layoutWidth > 0 &&
        box.layoutHeight > 0 &&
        box.x1 > box.x0 &&
        box.y1 > box.y0,
    ),
  );
}

function shouldBuildVlmLayoutSidecar({
  processingContext,
  parsedPart,
}: {
  processingContext: DoclingProcessingContext;
  parsedPart: DoclingParsedPart;
}) {
  return (
    processingContext.classification.isPdf &&
    processingContext.pipeline === 'vlm' &&
    processingContext.classification.path === 'scan-heavy' &&
    !hasRenderableBoundingBoxes(parsedPart.chunks)
  );
}

function selectLayoutSidecarChunks(chunks: ParsedChunk[]) {
  const fineGrainedChunks = chunks.filter(
    (chunk) =>
      (chunk.metadata.retrievalRepresentation === 'docling_element' ||
        chunk.metadata.retrievalRepresentation === 'docling_element_pair') &&
      chunk.citationPrecision === 'box' &&
      chunk.boundingBoxes.length > 0,
  );

  return fineGrainedChunks.length > 0
    ? fineGrainedChunks
    : chunks.filter((chunk) => chunk.citationPrecision === 'box' && chunk.boundingBoxes.length > 0);
}

function reindexChunks({
  chunks,
  documentId,
  startIndex,
}: {
  chunks: ParsedChunk[];
  documentId: string;
  startIndex: number;
}) {
  return chunks.map((chunk, index) => {
    const nextIndex = startIndex + index;

    return {
      ...chunk,
      id: `${documentId}:${nextIndex}`,
      metadata: {
        ...chunk.metadata,
        index: nextIndex,
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
  scanClassifier = DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG,
  scanHeavyOcrPreset = DEFAULT_SCAN_HEAVY_OCR_PRESET,
  vlmEnabled = DEFAULT_VLM_ENABLED,
  vlmPipelinePreset = DEFAULT_VLM_PIPELINE_PRESET,
}: {
  doclingClient: DoclingClient;
  imageCaptioner?: ImageCaptioner;
} & DoclingParserOptions): DocumentParser {
  function buildConvertOptions({
    input,
    classification,
  }: {
    input: ParseInput;
    classification: PdfScanClassification;
  }): Partial<DoclingConvertOptions> {
    const canUseVlm =
      vlmEnabled && (classification.path === 'scan-heavy' || isImageFile(input));

    if (canUseVlm) {
      return {
        doOcr: false,
        pipeline: 'vlm',
        vlmPipelinePreset,
      };
    }

    if (classification.path === 'scan-heavy') {
      return {
        doOcr: true,
        ocrPreset: scanHeavyOcrPreset,
      };
    }

    return {
      doOcr: classification.doclingDoOcr,
    };
  }

  async function parseDoclingResponse({
    response,
    input,
    part,
    chunkStartIndex,
    chunker,
    processingContext,
    chunkInput = 'original_file',
  }: {
    response: DoclingChunkResponse;
    input: ParseInput;
    part: DoclingInputPart;
    chunkStartIndex: number;
    chunker: DoclingParsedChunker;
    processingContext: DoclingProcessingContext;
    chunkInput?: DoclingChunkInput;
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
        embeddedImages =
          mergeEmbeddedImages(markdownImages, structured.embeddedImages) ?? markdownImages;
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `docling.structured_mapping_failed:${error.message}`
          : 'docling.structured_mapping_failed',
      );
    }

    const structuredText =
      structuredElements
        ?.map((element) => element.text.trim())
        .filter((textPart) => textPart.length > 0)
        .join('\n\n') ?? '';
    const text =
      deriveDoclingPlainText({
        text: sanitizeDoclingText(rawText),
        markdown,
      }) ||
      structuredText ||
      deriveTextFromDoclingChunks(response);

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
      doclingDocument:
        docContent?.json_content !== undefined && docContent?.json_content !== null
          ? (docContent.json_content as Record<string, unknown>)
          : undefined,
      imageCaptions: await buildImageCaptions({
        doclingDocument: docContent?.json_content,
        imageCaptioner,
        warnings,
      }),
    }).map((chunk) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        doclingChunker: chunker,
        doclingChunkInput: chunkInput,
        ...buildChunkProcessingMetadata(processingContext),
      },
    }));
    const offsetStructured = offsetStructuredElements(
      structuredElements,
      part.pageOffset,
      part.partIndex,
      part.partCount,
    );
    const offsetDoclingChunks = offsetChunks({
      chunks,
      documentId: input.documentId,
      pageOffset: part.pageOffset,
      part,
      startIndex: chunkStartIndex,
    });
    const retrievalRepresentations = buildDoclingRetrievalRepresentations({
      documentId: input.documentId,
      fileName: input.fileName,
      text,
      structuredElements: offsetStructured,
      doclingChunks: offsetDoclingChunks,
      startIndex: chunkStartIndex,
      fineGrainedCitationChunks: shouldBuildFineGrainedCitationChunks({
        input,
        processingContext,
      }),
    });
    warnings.push(...retrievalRepresentations.warnings);
    const chunksWithProcessingMetadata = retrievalRepresentations.chunks.map((chunk) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        doclingChunker: chunker,
        doclingChunkInput: chunkInput,
        ...buildChunkProcessingMetadata(processingContext),
        doclingSplitPart: part.partIndex + 1,
        doclingSplitPartCount: part.partCount,
        doclingSplitPageOffset: part.pageOffset,
        doclingSplitPageCount: part.pageCount,
      },
    }));

    return {
      text,
      markdown,
      embeddedImages,
      rawStructuredOutput,
      structuredElements: offsetStructured,
      chunks: chunksWithProcessingMetadata,
      warnings,
      processingContext,
    };
  }

  async function parse(input: ParseInput): Promise<ParserOutput> {
    const classification = await classifyPdfForProcessing(input, scanClassifier);
    const preParseWarnings: string[] = [];
    const convertOptions = buildConvertOptions({ input, classification });

    if (convertOptions.pipeline === 'vlm') {
      preParseWarnings.push('docling.pipeline:vlm');
      if (convertOptions.vlmPipelinePreset !== undefined) {
        preParseWarnings.push(`docling.vlm_pipeline_preset:${convertOptions.vlmPipelinePreset}`);
      }
      if (convertOptions.vlmPipelineCustomConfig !== undefined) {
        preParseWarnings.push('docling.vlm_pipeline_custom_config:enabled');
      }
    } else {
      if (classification.path === 'scan-heavy') {
        preParseWarnings.push(`docling.ocr_preset:${scanHeavyOcrPreset}`);
      }
    }

    const processingContext: DoclingProcessingContext = {
      classification,
      doclingOcrEnabled: convertOptions.doOcr,
      ocrPreset: convertOptions.ocrPreset,
      pipeline: convertOptions.pipeline,
      vlmPipelinePreset: convertOptions.vlmPipelinePreset,
      vlmPipelineCustomConfig: convertOptions.vlmPipelineCustomConfig,
    };
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
      const hybridResponse = await doclingClient.chunkFile({
        fileName: part.fileName,
        mimeType: input.mimeType,
        fileData: part.fileData,
        chunker: 'hybrid',
        convertOptions,
      });

      const parsedPart = await parseDoclingResponse({
        response: hybridResponse,
        input,
        part,
        chunkStartIndex,
        chunker: 'hybrid',
        processingContext,
      });

      let effectivePart = parsedPart;

      if (shouldBuildVlmLayoutSidecar({ processingContext, parsedPart })) {
        const sidecarProcessingContext: DoclingProcessingContext = {
          ...processingContext,
          doclingOcrEnabled: true,
          ocrPreset: scanHeavyOcrPreset,
          pipeline: undefined,
          vlmPipelinePreset: undefined,
          vlmPipelineCustomConfig: undefined,
          fallbackReason: 'vlm_layout_sidecar',
        };
        const sidecarResponse = await doclingClient.chunkFile({
          fileName: part.fileName,
          mimeType: input.mimeType,
          fileData: part.fileData,
          chunker: 'hybrid',
          convertOptions: {
            doOcr: true,
            ocrPreset: scanHeavyOcrPreset,
          },
        });
        const sidecarPart = await parseDoclingResponse({
          response: sidecarResponse,
          input,
          part,
          chunkStartIndex: chunkStartIndex + parsedPart.chunks.length,
          chunker: 'hybrid',
          processingContext: sidecarProcessingContext,
          chunkInput: 'ocr_layout_sidecar',
        });
        const sidecarChunks = reindexChunks({
          chunks: selectLayoutSidecarChunks(sidecarPart.chunks),
          documentId: input.documentId,
          startIndex: chunkStartIndex + parsedPart.chunks.length,
        });

        effectivePart = {
          ...parsedPart,
          structuredElements:
            parsedPart.structuredElements ?? sidecarPart.structuredElements,
          embeddedImages:
            parsedPart.embeddedImages ?? sidecarPart.embeddedImages,
          chunks: [...parsedPart.chunks, ...sidecarChunks],
          warnings: [
            ...parsedPart.warnings,
            'docling.vlm_layout_sidecar:ocr',
            ...sidecarPart.warnings,
          ],
        };
      }

      parsedParts.push(effectivePart);
      chunkStartIndex += effectivePart.chunks.length;
    }

    const text = parsedParts
      .map((part) => part.text)
      .filter((value) => value.length > 0)
      .join('\n\n');
    const markdown = parsedParts
      .map((part) => part.markdown)
      .filter((value) => value.length > 0)
      .join('\n\n');
    const embeddedImages = parsedParts.flatMap((part) => part.embeddedImages ?? []);
    const structuredElements = parsedParts.flatMap((part) => part.structuredElements ?? []);
    const chunks = parsedParts.flatMap((part) => part.chunks);
    const warnings = parsedParts.flatMap((part) => part.warnings);
    const rawStructuredOutputBase =
      parts.length === 1
        ? parsedParts[0]?.rawStructuredOutput
        : {
            schema_name: 'ArkivraDoclingSplitDocument',
            split: {
              page_threshold: splitPdfPageThreshold,
              pages_per_part: splitPdfChunkPages,
              part_count: parts.length,
              parts: parts.map((part) => ({
                file_name: part.fileName,
                page_offset: part.pageOffset,
                page_count: part.pageCount,
              })),
            },
            parts: parsedParts
              .map((part) => part.rawStructuredOutput)
              .filter((value): value is Record<string, unknown> => value !== undefined),
          };
    const effectiveProcessingContext =
      parsedParts.length === 1
        ? (parsedParts[0]?.processingContext ?? processingContext)
        : parsedParts.some((part) => part.processingContext.fallbackReason !== undefined)
          ? {
              ...processingContext,
              fallbackReason: parsedParts
                .map((part) => part.processingContext.fallbackReason)
                .filter((reason): reason is string => reason !== undefined)
                .join(';'),
            }
          : processingContext;
    const rawStructuredOutput = augmentRawStructuredOutput({
      rawStructuredOutput: rawStructuredOutputBase,
      processingContext: effectiveProcessingContext,
    });

    const output: ParserOutput = {
      engine: 'docling',
      engineVersion,
      text,
      markdown,
      embeddedImages: embeddedImages.length > 0 ? embeddedImages : undefined,
      rawStructuredOutput,
      structuredElements: structuredElements.length > 0 ? structuredElements : undefined,
      chunks,
      warnings: [...preParseWarnings, ...warnings],
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
