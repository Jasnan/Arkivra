import type { ParserOutput } from './parsed-document.schema.js';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

type EmbeddedImage = NonNullable<ParserOutput['embeddedImages']>[number];

export type PdfPageRenderOptions = {
  fileData: Buffer;
  fileName: string;
  mimeType: string;
  maxPages?: number;
  scale?: number;
  maxDimension?: number;
};

function isPdfFile({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  return mimeType.toLowerCase() === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

function installPdfJsCanvasGlobals() {
  const scope = globalThis as typeof globalThis & {
    DOMMatrix?: typeof DOMMatrix;
    ImageData?: typeof ImageData;
    Path2D?: typeof Path2D;
  };

  scope.DOMMatrix ??= DOMMatrix;
  scope.ImageData ??= ImageData;
  scope.Path2D ??= Path2D;
}

function clampPositiveInteger(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(value));
}

function resolveScale({
  width,
  height,
  scale,
  maxDimension,
}: {
  width: number;
  height: number;
  scale: number;
  maxDimension: number;
}) {
  const dimensionScale = Math.min(maxDimension / width, maxDimension / height);
  return Math.max(0.25, Math.min(scale, dimensionScale));
}

export async function renderPdfPagesToImages({
  fileData,
  fileName,
  mimeType,
  maxPages = 8,
  scale = 2,
  maxDimension = 1800,
}: PdfPageRenderOptions): Promise<EmbeddedImage[]> {
  if (!isPdfFile({ mimeType, fileName })) {
    return [];
  }

  installPdfJsCanvasGlobals();

  const loadingTask = getDocument({
    data: new Uint8Array(fileData),
  });
  const document = await loadingTask.promise;

  try {
    const pageLimit = Math.min(document.numPages, clampPositiveInteger(maxPages, 8));
    const images: EmbeddedImage[] = [];

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const effectiveScale = resolveScale({
        width: baseViewport.width,
        height: baseViewport.height,
        scale,
        maxDimension: clampPositiveInteger(maxDimension, 1800),
      });
      const viewport = page.getViewport({ scale: effectiveScale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      } as unknown as Parameters<typeof page.render>[0]).promise;

      images.push({
        mimeType: 'image/png',
        data: Buffer.from(await canvas.encode('png')),
      });

      page.cleanup();
    }

    return images;
  } finally {
    await document.destroy();
  }
}
