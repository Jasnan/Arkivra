import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParseInput } from './parser.types.js';
import { sha256Hex, toExactUint8Array } from './binary-diagnostics.js';
import { PDF_STANDARD_FONT_DATA_URL } from './pdfjs-runtime.js';

export type PdfProcessingPath = 'digital' | 'mixed' | 'scan-heavy' | 'unknown';

export type PdfScanClassifierConfig = {
  maxSampledPages: number;
  minTextItemsPerDigitalPage: number;
  minAlnumCharsPerDigitalPage: number;
  scanHeavyScannedPageRatio: number;
  mixedScannedPageRatio: number;
};

export const DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG: PdfScanClassifierConfig = {
  maxSampledPages: 8,
  minTextItemsPerDigitalPage: 20,
  minAlnumCharsPerDigitalPage: 120,
  scanHeavyScannedPageRatio: 0.7,
  mixedScannedPageRatio: 0.2,
};

export type PdfScanPageStats = {
  pageNumber: number;
  textItemCount: number;
  alphanumericCharCount: number;
  imageObjectCount: number;
  isDigital: boolean;
  isScannedLike: boolean;
};

export type PdfScanClassification = {
  isPdf: boolean;
  path: PdfProcessingPath;
  doclingDoOcr: boolean;
  totalPages: number;
  sampledPages: number[];
  digitalPageRatio: number;
  scannedPageRatio: number;
  textItemCount: number;
  alphanumericCharCount: number;
  imageObjectCount: number;
  pageStats: PdfScanPageStats[];
  thresholds: PdfScanClassifierConfig;
  reason: string;
};

function isPdfFile({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  return mimeType.toLowerCase() === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
}

function clampPositiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

function clampRatio(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function resolveConfig(config: Partial<PdfScanClassifierConfig> = {}): PdfScanClassifierConfig {
  return {
    maxSampledPages: clampPositiveInteger(
      config.maxSampledPages ?? DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.maxSampledPages,
      DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.maxSampledPages,
    ),
    minTextItemsPerDigitalPage: clampPositiveInteger(
      config.minTextItemsPerDigitalPage ?? DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.minTextItemsPerDigitalPage,
      DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.minTextItemsPerDigitalPage,
    ),
    minAlnumCharsPerDigitalPage: clampPositiveInteger(
      config.minAlnumCharsPerDigitalPage ?? DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.minAlnumCharsPerDigitalPage,
      DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.minAlnumCharsPerDigitalPage,
    ),
    scanHeavyScannedPageRatio: clampRatio(
      config.scanHeavyScannedPageRatio ?? DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.scanHeavyScannedPageRatio,
      DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.scanHeavyScannedPageRatio,
    ),
    mixedScannedPageRatio: clampRatio(
      config.mixedScannedPageRatio ?? DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.mixedScannedPageRatio,
      DEFAULT_PDF_SCAN_CLASSIFIER_CONFIG.mixedScannedPageRatio,
    ),
  };
}

function buildSamplePageNumbers(totalPages: number, sampleSize: number) {
  if (sampleSize >= totalPages) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>();

  for (let index = 0; index < sampleSize; index += 1) {
    const position = index / Math.max(1, sampleSize - 1);
    const pageNumber = Math.round(position * (totalPages - 1)) + 1;
    pages.add(Math.min(totalPages, Math.max(1, pageNumber)));
  }

  return Array.from(pages).sort((left, right) => left - right);
}

function countAlphanumericChars(text: string) {
  const matches = text.match(/[a-z0-9]/gi);
  return matches?.length ?? 0;
}

function textFragmentsFromItems(items: unknown[]) {
  return items
    .map((item) => {
      if (typeof item !== 'object' || item === null || !('str' in item)) {
        return '';
      }

      const value = item.str;
      return typeof value === 'string' ? value.trim() : '';
    })
    .filter(fragment => fragment.length > 0);
}

function countImageOperators(fnArray: unknown[]) {
  return fnArray.filter(fn =>
    fn === OPS.paintImageXObject
    || fn === OPS.paintInlineImageXObject
    || fn === OPS.paintImageMaskXObject,
  ).length;
}

function emptyClassification({
  isPdf,
  path,
  doclingDoOcr,
  thresholds,
  reason,
}: {
  isPdf: boolean;
  path: PdfProcessingPath;
  doclingDoOcr: boolean;
  thresholds: PdfScanClassifierConfig;
  reason: string;
}): PdfScanClassification {
  return {
    isPdf,
    path,
    doclingDoOcr,
    totalPages: 0,
    sampledPages: [],
    digitalPageRatio: 0,
    scannedPageRatio: 0,
    textItemCount: 0,
    alphanumericCharCount: 0,
    imageObjectCount: 0,
    pageStats: [],
    thresholds,
    reason,
  };
}

export async function classifyPdfForProcessing(
  input: ParseInput,
  config: Partial<PdfScanClassifierConfig> = {},
): Promise<PdfScanClassification> {
  const thresholds = resolveConfig(config);

  if (!isPdfFile(input)) {
    return emptyClassification({
      isPdf: false,
      path: 'digital',
      doclingDoOcr: true,
      thresholds,
      reason: 'not_pdf',
    });
  }

  try {
    const loadingTask = getDocument({
      data: toExactUint8Array(input.fileData),
      standardFontDataUrl: PDF_STANDARD_FONT_DATA_URL,
    });

    try {
      const document = await loadingTask.promise;
      const sampledPages = buildSamplePageNumbers(
        document.numPages,
        Math.min(thresholds.maxSampledPages, document.numPages),
      );
      const pageStats: PdfScanPageStats[] = [];

      for (const pageNumber of sampledPages) {
        const page = await document.getPage(pageNumber);

        try {
          const [textContent, operatorList] = await Promise.all([
            page.getTextContent(),
            page.getOperatorList(),
          ]);
          const textFragments = textFragmentsFromItems(textContent.items);
          const textItemCount = textFragments.length;
          const alphanumericCharCount = countAlphanumericChars(textFragments.join(' '));
          const imageObjectCount = countImageOperators(operatorList.fnArray);
          const isDigital = (
            textItemCount >= thresholds.minTextItemsPerDigitalPage
            || alphanumericCharCount >= thresholds.minAlnumCharsPerDigitalPage
          );

          pageStats.push({
            pageNumber,
            textItemCount,
            alphanumericCharCount,
            imageObjectCount,
            isDigital,
            isScannedLike: !isDigital,
          });
        } finally {
          page.cleanup();
        }
      }

      const digitalPageCount = pageStats.filter(page => page.isDigital).length;
      const scannedPageCount = pageStats.filter(page => page.isScannedLike).length;
      const digitalPageRatio = pageStats.length === 0 ? 0 : digitalPageCount / pageStats.length;
      const scannedPageRatio = pageStats.length === 0 ? 0 : scannedPageCount / pageStats.length;
      const path: PdfProcessingPath = scannedPageRatio >= thresholds.scanHeavyScannedPageRatio
        ? 'scan-heavy'
        : scannedPageRatio >= thresholds.mixedScannedPageRatio
          ? 'mixed'
          : 'digital';

      const result = {
        isPdf: true,
        path,
        doclingDoOcr: path === 'mixed',
        totalPages: document.numPages,
        sampledPages,
        digitalPageRatio,
        scannedPageRatio,
        textItemCount: pageStats.reduce((sum, page) => sum + page.textItemCount, 0),
        alphanumericCharCount: pageStats.reduce((sum, page) => sum + page.alphanumericCharCount, 0),
        imageObjectCount: pageStats.reduce((sum, page) => sum + page.imageObjectCount, 0),
        pageStats,
        thresholds,
        reason: `sampled_pages:${sampledPages.length};scanned_ratio:${scannedPageRatio.toFixed(3)}`,
      };

      console.info(
        `[pdf-scan-classifier] document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} file="${input.fileName}" bytes=${input.fileData.length} sha256=${sha256Hex(input.fileData)} pdfPages=${document.numPages} sampledPages=${sampledPages.join(',')} path=${path} reason=${result.reason}`,
      );

      return result;
    } finally {
      await loadingTask.destroy();
    }
  } catch (error) {
    console.info(
      `[pdf-scan-classifier] document=${input.documentId} version=${input.documentVersionId ?? 'unknown'} file="${input.fileName}" bytes=${input.fileData.length} sha256=${sha256Hex(input.fileData)} pdfPages=unknown path=unknown reason=${error instanceof Error ? `classification_failed:${error.message}` : 'classification_failed'}`,
    );
    return emptyClassification({
      isPdf: true,
      path: 'unknown',
      doclingDoOcr: true,
      thresholds,
      reason: error instanceof Error ? `classification_failed:${error.message}` : 'classification_failed',
    });
  }
}

export async function decidePdfDoOcr(
  input: ParseInput,
  config: Partial<PdfScanClassifierConfig> = {},
): Promise<boolean> {
  return (await classifyPdfForProcessing(input, config)).doclingDoOcr;
}
