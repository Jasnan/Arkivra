import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { isAbsolute, sep } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';
import { PDF_STANDARD_FONT_DATA_URL } from './pdfjs-runtime.js';

describe('pdf.js runtime', () => {
  test('resolves standard fonts under the development tsx loader', async () => {
    const runtimeUrl = new URL('./pdfjs-runtime.ts', import.meta.url).href;
    const script = `
      import { access } from 'node:fs/promises';
      import { PDF_STANDARD_FONT_DATA_URL } from ${JSON.stringify(runtimeUrl)};
      if (!PDF_STANDARD_FONT_DATA_URL.endsWith('/')) throw new Error('Missing trailing slash');
      await access(PDF_STANDARD_FONT_DATA_URL + 'LiberationSans-Regular.ttf');
    `;
    await expect(
      promisify(execFile)(process.execPath, [
        '--import',
        'tsx',
        '--input-type=module',
        '--eval',
        script,
      ]),
    ).resolves.toMatchObject({ stderr: '' });
  });

  test('provides a readable standard-font filesystem directory', async () => {
    expect(isAbsolute(PDF_STANDARD_FONT_DATA_URL)).toBe(true);
    expect(PDF_STANDARD_FONT_DATA_URL.endsWith(sep)).toBe(true);
    expect(PDF_STANDARD_FONT_DATA_URL.startsWith('file:')).toBe(false);

    await expect(
      access(`${PDF_STANDARD_FONT_DATA_URL}LiberationSans-Regular.ttf`),
    ).resolves.toBeUndefined();
  });
});
