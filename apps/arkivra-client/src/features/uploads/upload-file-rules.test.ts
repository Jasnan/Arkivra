import { describe, expect, it } from 'vitest';
import { filterAllowedUploadFiles, getUploadSourceRootName, normalizeUploadFileName, UPLOAD_ACCEPT_ATTRIBUTE } from './upload-file-rules';

describe('upload file rules', () => {
  it('keeps supported document, image, json, and text files', () => {
    const files = [
      new File(['pdf'], 'statement.pdf', { type: 'application/pdf' }),
      new File(['doc'], 'contract.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      new File(['sheet'], 'budget.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      new File(['csv'], 'export.csv', { type: 'text/csv' }),
      new File(['json'], 'data.json', { type: 'application/json' }),
      new File(['text'], 'notes.md', { type: 'text/markdown' }),
      new File(['image'], 'photo.png', { type: 'image/png' }),
      new File(['binary'], 'archive.zip', { type: 'application/zip' }),
    ];

    expect(filterAllowedUploadFiles(files.map(file => ({ file, relativePath: null }))).map(item => item.file.name)).toEqual([
      'statement.pdf',
      'contract.docx',
      'budget.xlsx',
      'export.csv',
      'data.json',
      'notes.md',
      'photo.png',
    ]);
  });

  it('rejects file types outside the explicit file icon families', () => {
    const files = [
      new File(['image'], 'scan.tiff', { type: 'image/tiff' }),
      new File(['rich'], 'notes.rtf', { type: 'application/rtf' }),
      new File(['html'], 'page.html', { type: 'text/html' }),
      new File(['binary'], 'archive.zip', { type: 'application/zip' }),
    ];

    expect(filterAllowedUploadFiles(files.map(file => ({ file, relativePath: null })))).toEqual([]);
  });

  it('exposes an accept attribute for supported upload pickers', () => {
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('.pdf');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('.xlsx');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('application/pdf');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).toContain('text/plain');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).not.toContain('image/*');
    expect(UPLOAD_ACCEPT_ATTRIBUTE).not.toContain('text/*');
  });

  it('drops hidden files and files inside hidden directories', () => {
    const visible = new File(['ok'], 'report.pdf', { type: 'application/pdf' });
    const hiddenFile = new File(['hidden'], '.report.pdf', { type: 'application/pdf' });
    const hiddenDirectoryFile = new File(['hidden'], 'secret.pdf', { type: 'application/pdf' });

    const accepted = filterAllowedUploadFiles([
      { file: visible, relativePath: 'work/report.pdf' },
      { file: hiddenFile, relativePath: 'work/.report.pdf' },
      { file: hiddenDirectoryFile, relativePath: 'work/.cache/secret.pdf' },
    ]);

    expect(accepted).toEqual([{ file: visible, relativePath: 'work/report.pdf' }]);
  });

  it('identifies the directory root for grouped transfer display', () => {
    const file = new File(['ok'], 'report.pdf', { type: 'application/pdf' });

    expect(getUploadSourceRootName({ file, relativePath: 'Clients/2026/report.pdf' })).toBe('Clients');
    expect(getUploadSourceRootName({ file, relativePath: null })).toBeNull();
  });

  it('normalizes upload filenames without stripping extensions', () => {
    expect(normalizeUploadFileName(' whoami.txt ')).toBe('whoami.txt');
    expect(normalizeUploadFileName('whoami.md')).toBe('whoami.md');
    expect(normalizeUploadFileName('archive.tar.gz')).toBe('archive.tar.gz');
    expect(normalizeUploadFileName('cafe\u0301.PDF')).toBe('café.PDF');
  });
});
