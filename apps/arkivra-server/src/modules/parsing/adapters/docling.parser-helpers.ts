import type { DoclingConvertOptions } from '../../docling/docling.client.js';
import type { ImageCaptioner } from '../image-captioner.js';
import type { ParseInput } from '../parser.types.js';
import type { ParsedChunk, ParserOutput } from '../parsed-document.schema.js';
import type { PdfScanClassification } from '../pdf-ocr-decider.js';
import type { BinaryDiagnostic } from '../binary-diagnostics.js';
import { PDFDocument } from 'pdf-lib';
import {
  buildBinaryDiagnostic,
  sha256Hex,
  toExactUint8Array,
} from '../binary-diagnostics.js';

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

export type DoclingInputPart = {
  fileName: string;
  fileData: Buffer;
  pageOffset: number;
  pageCount: number;
  partIndex: number;
  partCount: number;
  preprocessing: 'none' | 'pdf_split';
  diagnostics: BinaryDiagnostic;
  sourceDiagnostics: BinaryDiagnostic;
};

export type DoclingParsedPart = {
  text: string;
  markdown: string;
  embeddedImages?: ParserOutput['embeddedImages'];
  rawStructuredOutput?: ParserOutput['rawStructuredOutput'];
  structuredElements?: ParserOutput['structuredElements'];
  chunks: ParsedChunk[];
  warnings: string[];
  processingContext: DoclingProcessingContext;
};

export type DoclingParsedChunker = 'hybrid';
export type DoclingChunkInput = 'original_file' | 'ocr_layout_sidecar';

export type DoclingProcessingContext = {
  classification: PdfScanClassification;
  binaryDiagnostics?: {
    source: BinaryDiagnostic;
    parts: Array<{
      fileName: string;
      pageOffset: number;
      pageCount: number;
      partIndex: number;
      partCount: number;
      preprocessing: DoclingInputPart['preprocessing'];
      diagnostics: BinaryDiagnostic;
    }>;
  };
  doclingOcrEnabled?: boolean;
  ocrPreset?: string;
  pipeline?: DoclingConvertOptions['pipeline'];
  vlmPipelinePreset?: string;
  vlmPipelineCustomConfig?: string;
  fallbackReason?: string;
};

function isPdfMimeType(mimeType: string) {
  return mimeType.toLowerCase() === 'application/pdf';
}

function splitFileName(fileName: string, partIndex: number, partCount: number) {
  const suffix = `.part-${String(partIndex + 1).padStart(3, '0')}-of-${String(partCount).padStart(3, '0')}`;
  const dotIndex = fileName.toLowerCase().endsWith('.pdf') ? fileName.length - 4 : -1;

  return dotIndex >= 0 ? `${fileName.slice(0, dotIndex)}${suffix}.pdf` : `${fileName}${suffix}.pdf`;
}

export async function buildImageCaptions({
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

export async function buildDoclingInputParts({
  input,
  splitPdfPageThreshold,
  splitPdfChunkPages,
}: {
  input: ParseInput;
  splitPdfPageThreshold: number;
  splitPdfChunkPages: number;
}): Promise<DoclingInputPart[]> {
  const sourceDiagnostics = await buildBinaryDiagnostic({
    fileData: input.fileData,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  const singlePart: DoclingInputPart = {
    fileName: input.fileName,
    fileData: input.fileData,
    pageOffset: 0,
    pageCount: sourceDiagnostics.pdfPageCount ?? 0,
    partIndex: 0,
    partCount: 1,
    preprocessing: 'none',
    diagnostics: sourceDiagnostics,
    sourceDiagnostics,
  };

  if (!isPdfMimeType(input.mimeType) || splitPdfPageThreshold <= 0 || splitPdfChunkPages <= 0) {
    console.info(
      `[docling-parser] prepared input document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} part=1/1 preprocessing=none file="${singlePart.fileName}" bytes=${singlePart.diagnostics.byteLength} sha256=${singlePart.diagnostics.sha256} pdfPages=${singlePart.diagnostics.pdfPageCount ?? 'n/a'}`,
    );
    return [singlePart];
  }

  let sourcePdf: PDFDocument;
  try {
    sourcePdf = await PDFDocument.load(toExactUint8Array(input.fileData), { ignoreEncryption: true });
  } catch {
    console.info(
      `[docling-parser] prepared input document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} part=1/1 preprocessing=none pdfLoad=failed file="${singlePart.fileName}" bytes=${singlePart.diagnostics.byteLength} sha256=${singlePart.diagnostics.sha256} pdfPages=${singlePart.diagnostics.pdfPageCount ?? 'n/a'}`,
    );
    return [singlePart];
  }

  const totalPages = sourcePdf.getPageCount();
  if (totalPages <= splitPdfPageThreshold) {
    const part = { ...singlePart, pageCount: totalPages };
    console.info(
      `[docling-parser] prepared input document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} part=1/1 preprocessing=none file="${part.fileName}" bytes=${part.diagnostics.byteLength} sha256=${part.diagnostics.sha256} pdfPages=${totalPages} splitThreshold=${splitPdfPageThreshold}`,
    );
    return [part];
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
    const fileData = Buffer.from(bytes);
    const fileName = splitFileName(input.fileName, partIndex, ranges.length);
    const diagnostics = await buildBinaryDiagnostic({
      fileData,
      fileName,
      mimeType: input.mimeType,
    });
    parts.push({
      fileName,
      fileData,
      pageOffset: range.start,
      pageCount: range.end - range.start,
      partIndex,
      partCount: ranges.length,
      preprocessing: 'pdf_split',
      diagnostics,
      sourceDiagnostics,
    });
  }

  console.info(
    `[docling-parser] split input document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} sourceFile="${input.fileName}" sourceBytes=${input.fileData.length} sourceSha256=${sha256Hex(input.fileData)} sourcePdfPages=${totalPages} parts=${parts.length} pagesPerPart=${splitPdfChunkPages}`,
  );
  for (const part of parts) {
    console.info(
      `[docling-parser] prepared input document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} part=${part.partIndex + 1}/${part.partCount} preprocessing=pdf_split file="${part.fileName}" bytes=${part.diagnostics.byteLength} sha256=${part.diagnostics.sha256} pdfPages=${part.diagnostics.pdfPageCount ?? 'n/a'} pageOffset=${part.pageOffset} pageCount=${part.pageCount}`,
    );
  }

  return parts;
}

export function offsetStructuredElements(
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

export function offsetChunks({
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
  binaryDiagnostics,
}: DoclingProcessingContext) {
  const metadata: Record<string, unknown> = {
    processing_path: classification.path,
    canonical_text_source: 'docling',
    docling_ocr_enabled: doclingOcrEnabled ?? classification.doclingDoOcr,
    docling_ocr_preset: ocrPreset ?? null,
    fallback_reason: fallbackReason ?? null,
    binary_diagnostics: binaryDiagnostics === undefined
      ? undefined
      : {
          source: {
            byte_length: binaryDiagnostics.source.byteLength,
            sha256: binaryDiagnostics.source.sha256,
            pdf_page_count: binaryDiagnostics.source.pdfPageCount,
          },
          parts: binaryDiagnostics.parts.map((part) => ({
            file_name: part.fileName,
            page_offset: part.pageOffset,
            page_count: part.pageCount,
            part_index: part.partIndex,
            part_count: part.partCount,
            preprocessing: part.preprocessing,
            byte_length: part.diagnostics.byteLength,
            sha256: part.diagnostics.sha256,
            pdf_page_count: part.diagnostics.pdfPageCount,
          })),
        },
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

export function buildChunkProcessingMetadata(processingContext: DoclingProcessingContext) {
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

export function augmentRawStructuredOutput({
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

export function shouldBuildVlmLayoutSidecar({
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

export function selectLayoutSidecarChunks(chunks: ParsedChunk[]) {
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

export function reindexChunks({
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

function hasStructuredElementBbox(
  element: NonNullable<ParserOutput['structuredElements']>[number],
) {
  return element.pageNumber !== null && element.bbox !== null;
}

export function mergeStructuredElementsForLayoutSidecar({
  primary,
  sidecar,
}: {
  primary: ParserOutput['structuredElements'];
  sidecar: ParserOutput['structuredElements'];
}) {
  if (primary === undefined) return sidecar;
  if (sidecar === undefined) return primary;

  const merged = new Map<string, NonNullable<ParserOutput['structuredElements']>[number]>();
  for (const element of primary) {
    merged.set(element.elementId, element);
  }
  for (const element of sidecar) {
    const existing = merged.get(element.elementId);
    if (existing === undefined || (!hasStructuredElementBbox(existing) && hasStructuredElementBbox(element))) {
      merged.set(element.elementId, element);
    }
  }

  return [...merged.values()];
}
