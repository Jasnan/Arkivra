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

function createFileEntry(file: File): MockFileEntry {
  return {
    isDirectory: false,
    isFile: true,
    name: file.name,
    fullPath: `/${file.name}`,
    file: (successCallback: (value: File) => void) => {
      successCallback(file);
    },
  };
}

function createDirectoryEntry(entries: MockEntry[]): MockDirectoryEntry {
  return {
    isDirectory: true,
    isFile: false,
    name: 'folder',
    fullPath: '/folder',
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
    const nestedDirectory = createDirectoryEntry([createFileEntry(nestedFile)]);
    const rootDirectory = createDirectoryEntry([createFileEntry(rootFile), nestedDirectory]);

    const files = await getDroppedFiles({
      files: [],
      items: [
        {
          kind: 'file',
          getAsFile: () => null,
          webkitGetAsEntry: () => rootDirectory,
        },
      ],
    } as unknown as DataTransfer);

    expect(files.map(file => file.name)).toEqual(['root.txt', 'nested.txt']);
  });

  it('falls back to plain file drops when directory APIs are unavailable', async () => {
    const droppedFile = new File(['content'], 'fallback.txt', { type: 'text/plain' });

    const files = await getDroppedFiles({
      files: [droppedFile],
      items: [],
    } as unknown as DataTransfer);

    expect(files).toEqual([droppedFile]);
  });
});
