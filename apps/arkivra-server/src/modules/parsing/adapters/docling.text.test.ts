import { describe, expect, test } from 'vitest';
import {
  deriveDoclingPlainText,
  extractDataUriImages,
  sanitizeDoclingMarkdown,
  sanitizeDoclingText,
} from './docling.text.js';

describe('docling text sanitizers', () => {
  test('extracts embedded data URI images before sanitization strips them', () => {
    const images = extractDataUriImages('![Image](data:image/png;base64,aGVsbG8=)');

    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe('image/png');
    expect(images[0]?.data.toString('utf8')).toBe('hello');
  });

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

  test('falls back to markdown-derived plain text when text_content is empty', () => {
    const output = deriveDoclingPlainText({
      text: '',
      markdown: '# Heading\n\nBefore **bold** text\n\n- Item one\n- Item two',
    });

    expect(output).toBe('Heading\n\nBefore bold text\n\nItem one\nItem two');
  });
});
