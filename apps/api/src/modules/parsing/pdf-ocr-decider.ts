import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParseInput } from './parser.types.js';

const SMALL_PDF_PAGE_THRESHOLD = 25;
const MAX_SAMPLED_PAGES = 8;
const MIN_TEXT_ITEMS_PER_DIGITAL_PAGE = 20;
const MIN_ALNUM_CHARS_PER_DIGITAL_PAGE = 120;
const MIN_DIGITAL_SAMPLE_RATIO = 0.8;

function isPdfFile({ mimeType, fileName }: { mimeType: string; fileName: string }) {
  return mimeType.toLowerCase() === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
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

function isMeaningfullyDigitalPage(items: unknown[]) {
  const textFragments = items
    .map((item) => {
      if (typeof item !== 'object' || item === null || !('str' in item)) {
        return '';
      }

      const value = item.str;
      return typeof value === 'string' ? value.trim() : '';
    })
    .filter(fragment => fragment.length > 0);

  const textItemCount = textFragments.length;
  const alphanumericCharCount = countAlphanumericChars(textFragments.join(' '));

  return (
    textItemCount >= MIN_TEXT_ITEMS_PER_DIGITAL_PAGE
    || alphanumericCharCount >= MIN_ALNUM_CHARS_PER_DIGITAL_PAGE
  );
}

export async function decidePdfDoOcr(input: ParseInput): Promise<boolean> {
  if (!isPdfFile(input)) {
    return true;
  }

  try {
    const loadingTask = getDocument({
      data: new Uint8Array(input.fileData),
    });
    const document = await loadingTask.promise;

    try {
      if (document.numPages <= SMALL_PDF_PAGE_THRESHOLD) {
        return true;
      }

      const sampledPages = buildSamplePageNumbers(
        document.numPages,
        Math.min(MAX_SAMPLED_PAGES, document.numPages),
      );

      let digitalPageCount = 0;

      for (const pageNumber of sampledPages) {
        const page = await document.getPage(pageNumber);

        try {
          const textContent = await page.getTextContent();
          if (isMeaningfullyDigitalPage(textContent.items)) {
            digitalPageCount += 1;
          }
        } finally {
          page.cleanup();
        }
      }

      return digitalPageCount / sampledPages.length < MIN_DIGITAL_SAMPLE_RATIO;
    } finally {
      await document.destroy();
    }
  } catch {
    return true;
  }
}
