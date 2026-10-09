import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { DocumentParser, ParseInput } from '../parser.types.js';
import { ParserValidationError } from '../parser.types.js';
import { parserOutputSchema } from '../parsed-document.schema.js';
import type { ImageCaptioner } from '../image-captioner.js';
import { renderPdfPageToImage } from '../pdf-page-renderer.js';
import { glmOcrResponseSchema, mapGlmOcrOutput } from './glm-ocr.mapper.js';

export function createGlmOcrParser({
  baseUrl,
  engineVersion = 'sdk',
  maxChunkCharacters = 4000,
  timeoutMs = 300_000,
  imageCaptioner,
  fetchImpl = fetch,
}: {
  baseUrl: string;
  engineVersion?: string;
  maxChunkCharacters?: number;
  timeoutMs?: number;
  imageCaptioner?: ImageCaptioner;
  fetchImpl?: typeof fetch;
}): DocumentParser {
  async function parse(input: ParseInput) {
    const isText = input.mimeType.startsWith('text/') || /\.(?:txt|md|csv)$/i.test(input.fileName);
    if (isText) {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(input.fileData);
      const output = mapGlmOcrOutput({
        response: {
          json_result: [[{ index: 0, label: 'text', content, bbox_2d: null }]],
          markdown_result: content,
        },
        documentId: input.documentId,
        engineVersion,
        maxChunkCharacters,
        plainText: true,
      });
      output.text = content;
      // Plain text has no physical pages; text locators are attached by the pipeline.
      for (const element of output.structuredElements ?? []) element.pageNumber = null;
      for (const chunk of output.chunks ?? []) {
        chunk.pageNumber = null;
        chunk.pageStart = null;
        chunk.pageEnd = null;
        chunk.citationPrecision = 'document';
      }
      return parserOutputSchema.parse(output);
    }
    const isPdf = input.mimeType === 'application/pdf' || /\.pdf$/i.test(input.fileName);
    if (
      !isPdf &&
      !['image/png', 'image/jpeg', 'image/webp', 'image/tiff', 'image/gif'].includes(input.mimeType)
    ) {
      throw new ParserValidationError(
        'GLM ingestion supports PDFs, UTF-8 text, and raster images',
        'glm-ocr',
      );
    }
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/glmocr/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        images: [
          `data:${isPdf ? 'application/pdf' : input.mimeType};base64,${input.fileData.toString('base64')}`,
        ],
      }),
    });
    // Do not include upstream response bodies, which may contain document contents.
    if (!response.ok)
      throw new ParserValidationError(`GLM SDK request failed (${response.status})`, 'glm-ocr');
    const sdkOutput = glmOcrResponseSchema.parse(await response.json());
    if (!isPdf && sdkOutput.json_result.length !== 1) {
      throw new ParserValidationError(
        'Convert multi-page raster images to PDF before GLM ingestion',
        'glm-ocr',
      );
    }
    const output = mapGlmOcrOutput({
      response: sdkOutput,
      documentId: input.documentId,
      engineVersion,
      maxChunkCharacters,
    });
    let cachedPage = 0;
    let pageImage: Awaited<ReturnType<typeof loadImage>> | null = null;
    for (const element of output.structuredElements ?? []) {
      if (element.type !== 'image' || !element.bbox || !element.pageNumber) continue;
      if (cachedPage !== element.pageNumber) {
        const rendered = isPdf
          ? await renderPdfPageToImage({ ...input, pageNumber: element.pageNumber })
          : { data: input.fileData };
        pageImage = rendered ? await loadImage(rendered.data) : null;
        cachedPage = element.pageNumber;
      }
      if (!pageImage) continue;
      const b = element.bbox;
      const x = (b.x0 / 1000) * pageImage.width;
      const y = (b.y0 / 1000) * pageImage.height;
      const width = ((b.x1 - b.x0) / 1000) * pageImage.width;
      const height = ((b.y1 - b.y0) / 1000) * pageImage.height;
      const canvas = createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
      canvas
        .getContext('2d')
        .drawImage(pageImage, x, y, width, height, 0, 0, canvas.width, canvas.height);
      element.image = { mimeType: 'image/png', data: Buffer.from(await canvas.encode('png')) };
      let caption: string | null = null;
      try {
        caption = imageCaptioner ? await imageCaptioner.caption(element.image) : null;
      } catch {
        output.warnings.push('glm.image_caption_failed');
      }
      element.text = typeof caption === 'string' ? caption : '';
      for (const chunk of output.chunks ?? []) {
        if (!chunk.sourceElementIds.includes(element.elementId)) continue;
        chunk.images = [element.image];
        chunk.text =
          element.text ||
          `Figure on page ${element.pageNumber}${element.section ? ` in ${element.section}` : ''}`;
        chunk.originalText = chunk.text;
      }
    }
    return parserOutputSchema.parse(output);
  }
  return {
    engine: 'glm-ocr',
    engineVersion,
    capabilities: { ocr: true, tables: true, supportedMimeTypes: 'any' },
    parse,
  };
}
