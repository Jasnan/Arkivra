import { access } from 'node:fs/promises';
import { isAbsolute, sep } from 'node:path';
import { describe, expect, test } from 'vitest';
import { PDF_STANDARD_FONT_DATA_URL } from './pdfjs-runtime.js';

describe('pdf.js runtime', () => {
  test('provides a readable standard-font filesystem directory', async () => {
    expect(isAbsolute(PDF_STANDARD_FONT_DATA_URL)).toBe(true);
    expect(PDF_STANDARD_FONT_DATA_URL.endsWith(sep)).toBe(true);
    expect(PDF_STANDARD_FONT_DATA_URL.startsWith('file:')).toBe(false);

    await expect(
      access(`${PDF_STANDARD_FONT_DATA_URL}LiberationSans-Regular.ttf`),
    ).resolves.toBeUndefined();
  });
});
