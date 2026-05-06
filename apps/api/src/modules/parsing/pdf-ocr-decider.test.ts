import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, test } from 'vitest';
import { decidePdfDoOcr } from './pdf-ocr-decider.js';

async function createPdf({
  pages,
  textPages = [],
}: {
  pages: number;
  textPages?: number[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const textPageSet = new Set(textPages);

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = pdf.addPage([612, 792]);

    if (textPageSet.has(pageNumber)) {
      for (let line = 0; line < 8; line += 1) {
        page.drawText(
          `Digital text page ${pageNumber} line ${line} with enough content to trigger OCR skipping.`,
          {
            x: 72,
            y: 720 - line * 24,
            size: 12,
            font,
          },
        );
      }
    }
  }

  return Buffer.from(await pdf.save());
}

describe('pdf OCR decider', () => {
  test('keeps OCR enabled for small PDFs even when they are digital', async () => {
    const doOcr = await decidePdfDoOcr({
      documentId: 'doc_small',
      fileName: 'small.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdf({
        pages: 10,
        textPages: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      }),
    });

    expect(doOcr).toBe(true);
  });

  test('disables OCR for large PDFs whose sampled pages are mostly digital', async () => {
    const doOcr = await decidePdfDoOcr({
      documentId: 'doc_large_digital',
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdf({
        pages: 40,
        textPages: Array.from({ length: 40 }, (_, index) => index + 1),
      }),
    });

    expect(doOcr).toBe(false);
  });

  test('keeps OCR enabled for large PDFs without a meaningful text layer', async () => {
    const doOcr = await decidePdfDoOcr({
      documentId: 'doc_large_scanned',
      fileName: 'large-scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdf({
        pages: 40,
      }),
    });

    expect(doOcr).toBe(true);
  });
});

