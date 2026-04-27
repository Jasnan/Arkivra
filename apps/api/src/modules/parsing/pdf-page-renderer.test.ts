import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, test } from 'vitest';
import { renderPdfPagesToImages } from './pdf-page-renderer.js';

async function createPdf(pageCount: number) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([240, 120]);
    page.drawText(`Page ${index + 1}`, {
      x: 24,
      y: 60,
      size: 18,
      font,
    });
  }

  return Buffer.from(await pdf.save());
}

describe('PDF page renderer', () => {
  test('renders PDF pages to PNG images for vision fallback', async () => {
    const images = await renderPdfPagesToImages({
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdf(2),
      maxPages: 1,
    });

    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe('image/png');
    expect(images[0]?.data.length).toBeGreaterThan(100);
  });

  test('returns no images for non-PDF files', async () => {
    const images = await renderPdfPagesToImages({
      fileName: 'scan.txt',
      mimeType: 'text/plain',
      fileData: Buffer.from('not a pdf'),
    });

    expect(images).toEqual([]);
  });
});
