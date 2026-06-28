import { describe, expect, it } from 'vitest';
import { getDocumentFileIconMeta } from './document-file-icon.utils';

describe('getDocumentFileIconMeta', () => {
  it.each([
    ['Annual Report.pdf', 'application/octet-stream', 'pdf', 'PDF'],
    ['Contract.docx', 'application/octet-stream', 'word', 'DOCX'],
    ['Legacy Contract.doc', 'application/msword', 'word', 'DOC'],
    ['Open Contract.odt', 'application/vnd.oasis.opendocument.text', 'word', 'ODT'],
    ['Budget.xlsx', 'application/octet-stream', 'spreadsheet', 'XLSX'],
    ['Export.xls', 'application/vnd.ms-excel', 'spreadsheet', 'XLS'],
    ['Open Budget.ods', 'application/vnd.oasis.opendocument.spreadsheet', 'spreadsheet', 'ODS'],
    ['Pitch.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'file', 'PPTX'],
    ['Open Pitch.odp', 'application/vnd.oasis.opendocument.presentation', 'file', 'ODP'],
    ['Records.csv', 'text/csv', 'csv', 'CSV'],
    ['Manifest.json', 'application/json', 'json', 'JSON'],
    ['Photo.jpeg', 'application/octet-stream', 'image', 'JPEG'],
    ['Scan.webp', 'image/webp', 'image', 'WEBP'],
    ['Notes.txt', 'application/octet-stream', 'text', 'TXT'],
    ['Readme.md', 'text/markdown', 'file', 'MD'],
    ['Archive.bin', 'application/octet-stream', 'file', 'BIN'],
  ])('maps %s to a %s icon', (name, mimeType, type, label) => {
    expect(getDocumentFileIconMeta({ name, mimeType })).toMatchObject({ type, label });
  });

  it('falls back to MIME type when a known extension is missing', () => {
    expect(getDocumentFileIconMeta({ name: 'upload', mimeType: 'image/png' })).toMatchObject({
      type: 'image',
      label: 'IMG',
    });
  });
});
