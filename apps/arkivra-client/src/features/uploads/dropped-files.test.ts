import { describe, expect, it } from 'vitest';
import { getDroppedFiles } from './dropped-files';

interface MockFileEntry {
  isDirectory: false;
  isFile: true;
  name: string;
  fullPath: string;
  file: (successCallback: (value: File) => void) => void;
}

interface MockDirectoryEntry {
  isDirectory: true;
  isFile: false;
  name: string;
  fullPath: string;
  createReader: () => {
    readEntries: (successCallback: (value: MockEntry[]) => void) => void;
  };
}

type MockEntry = MockFileEntry | MockDirectoryEntry;

function createFileEntry(file: File, fullPath = `/${file.name}`): MockFileEntry {
  return {
    isDirectory: false,
    isFile: true,
    name: file.name,
    fullPath,
    file: (successCallback: (value: File) => void) => {
      successCallback(file);
    },
  };
}

function createDirectoryEntry(entries: MockEntry[], name = 'folder'): MockDirectoryEntry {
  return {
    isDirectory: true,
    isFile: false,
    name,
    fullPath: `/${name}`,
    createReader: () => {
      let isRead = false;
      return {
        readEntries: (successCallback: (value: MockEntry[]) => void) => {
          if (isRead) {
            successCallback([]);
            return;
          }

          isRead = true;
          successCallback(entries);
        },
      };
    },
  };
}

describe('getDroppedFiles', () => {
  it('recursively expands directory drops into files', async () => {
    const rootFile = new File(['root'], 'root.txt', { type: 'text/plain' });
    const nestedFile = new File(['nested'], 'nested.txt', { type: 'text/plain' });
    const nestedDirectory = createDirectoryEntry([createFileEntry(nestedFile, '/folder/nested/nested.txt')]);
    const rootDirectory = createDirectoryEntry([
      createFileEntry(rootFile, '/folder/root.txt'),
      nestedDirectory,
    ]);

    const droppedFiles = await getDroppedFiles({
      files: [],
      items: [
        {
          kind: 'file',
          getAsFile: () => null,
          webkitGetAsEntry: () => rootDirectory,
        },
      ],
    } as unknown as DataTransfer);

    expect(droppedFiles.map(item => item.file.name)).toEqual(['root.txt', 'nested.txt']);
    expect(droppedFiles.map(item => item.relativePath)).toEqual([
      'folder/root.txt',
      'folder/nested/nested.txt',
    ]);
  });

  it('falls back to plain file drops when directory APIs are unavailable', async () => {
    const droppedFile = new File(['content'], 'fallback.txt', { type: 'text/plain' });

    const files = await getDroppedFiles({
      files: [droppedFile],
      items: [],
    } as unknown as DataTransfer);

    expect(files).toEqual([{ file: droppedFile, relativePath: null }]);
  });

  it('preserves webkitRelativePath values from folder picker files', async () => {
    const file = new File(['content'], 'statement.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'Inbox/2026/statement.pdf',
    });

    const files = await getDroppedFiles({
      files: [file],
      items: [],
    } as unknown as DataTransfer);

    expect(files).toEqual([{ file, relativePath: 'Inbox/2026/statement.pdf' }]);
  });

  it('skips hidden dropped files and directories while expanding folders', async () => {
    const visibleFile = new File(['visible'], 'visible.txt', { type: 'text/plain' });
    const hiddenFile = new File(['hidden'], '.hidden.txt', { type: 'text/plain' });
    const hiddenNestedFile = new File(['secret'], 'secret.txt', { type: 'text/plain' });
    const rootDirectory = createDirectoryEntry([
      createFileEntry(visibleFile, '/folder/visible.txt'),
      createFileEntry(hiddenFile, '/folder/.hidden.txt'),
      createDirectoryEntry([createFileEntry(hiddenNestedFile, '/folder/.cache/secret.txt')], '.cache'),
    ]);

    const droppedFiles = await getDroppedFiles({
      files: [],
      items: [
        {
          kind: 'file',
          getAsFile: () => null,
          webkitGetAsEntry: () => rootDirectory,
        },
      ],
    } as unknown as DataTransfer);

    expect(droppedFiles).toEqual([{ file: visibleFile, relativePath: 'folder/visible.txt' }]);
  });
});
