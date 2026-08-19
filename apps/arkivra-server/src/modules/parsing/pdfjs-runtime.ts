import { fileURLToPath } from 'node:url';

export const PDF_STANDARD_FONT_DATA_URL = fileURLToPath(
  import.meta.resolve('pdfjs-dist/standard_fonts/'),
);
