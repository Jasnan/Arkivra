import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';

// Resolve an existing file: tsx can rewrite directory specifiers to index.json.
const require = createRequire(import.meta.url);
export const PDF_STANDARD_FONT_DATA_URL =
  join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + sep;
