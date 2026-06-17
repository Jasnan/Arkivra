import { describe, expect, test } from 'vitest';
import { normalizeDocumentFileName } from './documents.services.js';

describe('document service filename normalization', () => {
  test('preserves the complete filename including extension', () => {
    expect(normalizeDocumentFileName('whoami.txt')).toBe('whoami.txt');
    expect(normalizeDocumentFileName('whoami.md')).toBe('whoami.md');
    expect(normalizeDocumentFileName('archive.tar.gz')).toBe('archive.tar.gz');
  });

  test('normalizes edge cases without stripping extension identity', () => {
    expect(normalizeDocumentFileName(' report.PDF ')).toBe('report.PDF');
    expect(normalizeDocumentFileName('notes.txt   ')).toBe('notes.txt');
    expect(normalizeDocumentFileName('cafe\u0301.md')).toBe('café.md');
    expect(normalizeDocumentFileName('   ')).toBe('untitled');
  });
});
