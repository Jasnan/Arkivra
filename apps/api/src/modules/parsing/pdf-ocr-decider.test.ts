import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, test } from 'vitest';
import { classifyPdfForProcessing, decidePdfDoOcr } from './pdf-ocr-decider.js';

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
          `Digital text page ${pageNumber} line ${line} with enough content to classify this as a digital PDF page.`,
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

describe('pdf OCR classifier', () => {
  test('classifies PDFs whose sampled pages are digital', async () => {
    const classification = await classifyPdfForProcessing({
      documentId: 'doc_digital',
      fileName: 'digital.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdf({
        pages: 4,
        textPages: [1, 2, 3, 4],
      }),
    }, {
      maxSampledPages: 4,
    });

    expect(classification.path).toBe('digital');
    expect(classification.doclingDoOcr).toBe(false);
    expect(classification.digitalPageRatio).toBe(1);
    expect(classification.scannedPageRatio).toBe(0);
  });

  test('classifies PDFs with a minority of scanned-like pages as mixed', async () => {
    const classification = await classifyPdfForProcessing({
      documentId: 'doc_mixed',
      fileName: 'mixed.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdf({
        pages: 4,
        textPages: [1, 2, 3],
      }),
    }, {
      maxSampledPages: 4,
      mixedScannedPageRatio: 0.2,
      scanHeavyScannedPageRatio: 0.7,
    });

    expect(classification.path).toBe('mixed');
    expect(classification.doclingDoOcr).toBe(true);
    expect(classification.scannedPageRatio).toBe(0.25);
  });

  test('classifies PDFs without a meaningful text layer as scan-heavy', async () => {
    const classification = await classifyPdfForProcessing({
      documentId: 'doc_scan',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdf({
        pages: 3,
      }),
    }, {
      maxSampledPages: 3,
    });

    expect(classification.path).toBe('scan-heavy');
    expect(classification.doclingDoOcr).toBe(false);
    expect(classification.scannedPageRatio).toBe(1);
    expect(classification.pageStats).toHaveLength(3);
  });

  test('keeps the legacy do-OCR wrapper available for unknown PDFs', async () => {
    const doOcr = await decidePdfDoOcr({
      documentId: 'doc_bad',
      fileName: 'bad.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('not a pdf'),
    });

    expect(doOcr).toBe(true);
  });
});
