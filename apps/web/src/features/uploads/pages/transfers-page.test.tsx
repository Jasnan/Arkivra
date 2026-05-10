import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransfersPage } from '@/features/uploads/pages/transfers-page';
import { renderWithProviders } from '@/test/utils';
import { uploadManager } from '../upload-manager';

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

vi.mock('../upload-manager', () => ({
  uploadManager: {
    addFiles: vi.fn(),
    reconcileVault: vi.fn().mockResolvedValue(undefined),
    clearAll: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../use-upload-manager', () => ({
  useUploadManagerState: () => ({
    items: [],
    activeCount: 0,
    queuedCount: 0,
    failedCount: 0,
    completedCount: 0,
    isPaused: false,
    hydratedFromStorage: false,
  }),
}));

vi.mock('@/features/vaults/vaults.queries', () => ({
  useVaultsQuery: () => ({
    data: {
      vaults: [{ id: 'vlt_1', name: 'Personal' }],
    },
  }),
}));

describe('transfers page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds files from dropped directories to the upload queue', async () => {
    const report = new File(['report'], 'report.pdf', { type: 'application/pdf' });
    const note = new File(['note'], 'note.txt', { type: 'text/plain' });
    const button = await renderPage();

    fireEvent.drop(button, {
      dataTransfer: {
        files: [],
        items: [
          {
            kind: 'file',
            getAsFile: () => null,
            webkitGetAsEntry: () => createDirectoryEntry([
              createFileEntry(report),
              createDirectoryEntry([createFileEntry(note)]),
            ]),
          },
        ],
      },
    });

    await waitFor(() => {
      expect(uploadManager.addFiles).toHaveBeenCalledWith({
        vaultId: 'vlt_1',
        folderId: null,
        files: [
          { file: report, relativePath: 'report.pdf' },
          { file: note, relativePath: 'note.txt' },
        ],
      });
    });
  });
});

async function renderPage() {
  await renderWithProviders(<TransfersPage />, {
    initialEntries: ['/transfers'],
    routePath: '/transfers',
  });

  return screen.getByRole('button', { name: /drag and drop files or folders here/i });
}

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
