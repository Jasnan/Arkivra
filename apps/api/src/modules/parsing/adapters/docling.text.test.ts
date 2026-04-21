import { describe, expect, test } from 'vitest';
import { sanitizeDoclingMarkdown, sanitizeDoclingText } from './docling.text.js';

describe('docling text sanitizers', () => {
  test('removes markdown images and embedded data URIs from text', () => {
    const input = 'Heading\n![Image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)\nParagraph';
    const output = sanitizeDoclingText(input);

    expect(output).toBe('Heading\n\nParagraph');
  });

  test('removes markdown images and keeps surrounding text readable', () => {
    const input = '# Heading\n\nBefore\n\n![Chart](data:image/png;base64,AAAA)\n\nAfter';
    const output = sanitizeDoclingMarkdown(input);

    expect(output).toBe('# Heading\n\nBefore\n\nAfter');
  });
});
