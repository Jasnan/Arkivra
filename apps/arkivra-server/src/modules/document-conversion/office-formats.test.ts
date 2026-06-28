import { describe, expect, test } from 'vitest';
import { isOfficeDocumentConvertible, previewPdfFileName } from './office-formats.js';

describe('office format detection', () => {
  test.each([
    ['contract.doc', 'application/octet-stream'],
    ['contract.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['budget.xlsx', 'application/octet-stream'],
    ['slides.pptx', 'application/octet-stream'],
    ['notes.odt', 'application/octet-stream'],
    ['sheet.ods', 'application/octet-stream'],
    ['deck.odp', 'application/octet-stream'],
  ])('treats %s as convertible', (fileName, mimeType) => {
    expect(isOfficeDocumentConvertible({ fileName, mimeType })).toBe(true);
  });

  test.each([
    ['contract.pdf', 'application/pdf'],
    ['image.png', 'image/png'],
    ['notes.txt', 'text/plain'],
  ])('does not treat %s as convertible', (fileName, mimeType) => {
    expect(isOfficeDocumentConvertible({ fileName, mimeType })).toBe(false);
  });

  test('builds a version preview filename without replacing the original', () => {
    expect(previewPdfFileName('Contract.docx')).toBe('Contract.preview.pdf');
  });
});
