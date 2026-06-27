import type { DoclingClient, DoclingConvertOptions } from '../../docling/docling.client.js';
import type { DocumentParser, ParseInput, ParserCapabilities } from '../parser.types.js';
import type { ParserOutput } from '../parsed-document.schema.js';
import type { ImageCaptioner } from '../image-captioner.js';
import type { DoclingChunkResponse } from './docling.schema.js';
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
import type {
  DoclingChunkInput,
  DoclingInputPart,
  DoclingParsedChunker,
  DoclingParsedPart,
  DoclingProcessingContext,
} from './docling.parser-helpers.js';
import {
  augmentRawStructuredOutput,
  buildChunkProcessingMetadata,
  buildDoclingInputParts,
  buildImageCaptions,
  mergeStructuredElementsForLayoutSidecar,
  offsetChunks,
  offsetStructuredElements,
  reindexChunks,
  selectLayoutSidecarChunks,
  shouldBuildVlmLayoutSidecar,
} from './docling.parser-helpers.js';

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

function deriveTextFromDoclingChunks(response: DoclingChunkResponse) {
  return response.chunks
    .map((chunk) => sanitizeDoclingText(chunk.raw_text ?? chunk.text))
    .filter((text) => text.length > 0)
    .join('\n\n');
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
      fineGrainedCitationChunks: false,
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

    const parts = await buildDoclingInputParts({
      input,
      splitPdfPageThreshold,
      splitPdfChunkPages,
    });
    const sourceDiagnostics = parts[0]?.sourceDiagnostics;
    if (sourceDiagnostics === undefined) {
      throw new ParserValidationError(
        `Docling adapter could not build source binary diagnostics for ${input.documentId}`,
        'docling',
      );
    }
    const binaryDiagnostics: DoclingProcessingContext['binaryDiagnostics'] = {
      source: sourceDiagnostics,
      parts: parts.map((part) => ({
        fileName: part.fileName,
        pageOffset: part.pageOffset,
        pageCount: part.pageCount,
        partIndex: part.partIndex,
        partCount: part.partCount,
        preprocessing: part.preprocessing,
        diagnostics: part.diagnostics,
      })),
    };
    const processingContext: DoclingProcessingContext = {
      classification,
      binaryDiagnostics,
      doclingOcrEnabled: convertOptions.doOcr,
      ocrPreset: convertOptions.ocrPreset,
      pipeline: convertOptions.pipeline,
      vlmPipelinePreset: convertOptions.vlmPipelinePreset,
      vlmPipelineCustomConfig: convertOptions.vlmPipelineCustomConfig,
    };

    if (parts.length > 1) {
      console.info(
        `[docling-parser] splitting large PDF file="${input.fileName}" pages=${parts.reduce((sum, part) => sum + part.pageCount, 0)} parts=${parts.length} pagesPerPart=${splitPdfChunkPages}`,
      );
    }

    const parsedParts: DoclingParsedPart[] = [];
    let chunkStartIndex = 0;

    for (const part of parts) {
      console.info(
        `[docling-parser] submitting original_file document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} part=${part.partIndex + 1}/${part.partCount} file="${part.fileName}" bytes=${part.fileData.length} sha256=${part.diagnostics.sha256} pdfPages=${part.diagnostics.pdfPageCount ?? 'n/a'} preprocessing=${part.preprocessing}`,
      );
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
        console.info(
          `[docling-parser] submitting ocr_layout_sidecar document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} part=${part.partIndex + 1}/${part.partCount} file="${part.fileName}" bytes=${part.fileData.length} sha256=${part.diagnostics.sha256} pdfPages=${part.diagnostics.pdfPageCount ?? 'n/a'} preprocessing=${part.preprocessing}`,
        );
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
          structuredElements: mergeStructuredElementsForLayoutSidecar({
            primary: parsedPart.structuredElements,
            sidecar: sidecarPart.structuredElements,
          }),
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
