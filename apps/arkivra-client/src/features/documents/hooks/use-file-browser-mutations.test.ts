import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { fileBrowserQueryKeys } from '@/features/file-browser/file-browser.queries';
import type { FolderItemsResponse, FolderTreeResponse } from '@/features/file-browser/file-browser.types';
import { removeTrashTargetsFromFileBrowserCache } from './use-file-browser-mutations';

const documentDefaults = {
  originalSize: 1024,
  mimeType: 'application/pdf',
  processingStatus: 'completed' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isDeleted: false,
  deletedAt: null,
};

const folderDefaults = {
  vaultId: 'vlt_1',
  createdBy: 'usr_1',
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('removeTrashTargetsFromFileBrowserCache', () => {
  it('removes deleted documents from folder items and folder tree caches', () => {
    const queryClient = new QueryClient();
    const folderItemsKey = fileBrowserQueryKeys.folderItems('vlt_1', 'fld_1');
    const treeKey = fileBrowserQueryKeys.folderTree('vlt_1');

    queryClient.setQueryData<FolderItemsResponse>(folderItemsKey, {
      folder: { id: 'fld_1', parentId: null, name: 'Insurance', ...folderDefaults },
      breadcrumbs: [{ id: 'fld_1', parentId: null, name: 'Insurance' }],
      folders: [],
      documents: [
        {
          id: 'doc_1',
          name: 'Policy.pdf',
          originalName: 'Policy.pdf',
          folderId: 'fld_1',
          ...documentDefaults,
        },
      ],
      items: [
        {
          type: 'document',
          document: {
            id: 'doc_1',
            name: 'Policy.pdf',
            originalName: 'Policy.pdf',
            folderId: 'fld_1',
            ...documentDefaults,
          },
        },
      ],
    });
    queryClient.setQueryData<FolderTreeResponse>(treeKey, {
      folders: [{ id: 'fld_1', parentId: null, name: 'Insurance', path: 'Insurance', depth: 0 }],
      documents: [
        {
          id: 'doc_1',
          name: 'Policy.pdf',
          originalName: 'Policy.pdf',
          folderId: 'fld_1',
          path: 'Insurance/Policy.pdf',
          depth: 1,
          ...documentDefaults,
        },
      ],
    });

    removeTrashTargetsFromFileBrowserCache(queryClient, [
      { type: 'document', vaultId: 'vlt_1', id: 'doc_1' },
    ]);

    expect(queryClient.getQueryData<FolderItemsResponse>(folderItemsKey)?.items).toEqual([]);
    expect(queryClient.getQueryData<FolderItemsResponse>(folderItemsKey)?.documents).toEqual([]);
    expect(queryClient.getQueryData<FolderTreeResponse>(treeKey)?.documents).toEqual([]);
    expect(queryClient.getQueryData<FolderTreeResponse>(treeKey)?.folders).toHaveLength(1);
  });

  it('removes deleted folders, descendants, and nested documents from the folder tree cache', () => {
    const queryClient = new QueryClient();
    const rootItemsKey = fileBrowserQueryKeys.folderItems('vlt_1', null);
    const childItemsKey = fileBrowserQueryKeys.folderItems('vlt_1', 'fld_2');
    const treeKey = fileBrowserQueryKeys.folderTree('vlt_1');

    queryClient.setQueryData<FolderItemsResponse>(rootItemsKey, {
      folder: null,
      breadcrumbs: [],
      folders: [
        { id: 'fld_1', parentId: null, name: 'Insurance', ...folderDefaults },
      ],
      documents: [],
      items: [
        {
          type: 'folder',
          folder: { id: 'fld_1', parentId: null, name: 'Insurance', ...folderDefaults },
        },
      ],
    });
    queryClient.setQueryData<FolderItemsResponse>(childItemsKey, {
      folder: { id: 'fld_2', parentId: 'fld_1', name: 'Policies', ...folderDefaults },
      breadcrumbs: [
        { id: 'fld_1', parentId: null, name: 'Insurance' },
        { id: 'fld_2', parentId: 'fld_1', name: 'Policies' },
      ],
      folders: [],
      documents: [
        {
          id: 'doc_1',
          name: 'Policy.pdf',
          originalName: 'Policy.pdf',
          folderId: 'fld_2',
          ...documentDefaults,
        },
      ],
      items: [
        {
          type: 'document',
          document: {
            id: 'doc_1',
            name: 'Policy.pdf',
            originalName: 'Policy.pdf',
            folderId: 'fld_2',
            ...documentDefaults,
          },
        },
      ],
    });
    queryClient.setQueryData<FolderTreeResponse>(treeKey, {
      folders: [
        { id: 'fld_1', parentId: null, name: 'Insurance', path: 'Insurance', depth: 0 },
        { id: 'fld_2', parentId: 'fld_1', name: 'Policies', path: 'Insurance/Policies', depth: 1 },
      ],
      documents: [
        {
          id: 'doc_1',
          name: 'Policy.pdf',
          originalName: 'Policy.pdf',
          folderId: 'fld_2',
          path: 'Insurance/Policies/Policy.pdf',
          depth: 2,
          ...documentDefaults,
        },
      ],
    });

    removeTrashTargetsFromFileBrowserCache(queryClient, [
      { type: 'folder', vaultId: 'vlt_1', id: 'fld_1' },
    ]);

    expect(queryClient.getQueryData<FolderItemsResponse>(rootItemsKey)?.items).toEqual([]);
    expect(queryClient.getQueryData<FolderItemsResponse>(childItemsKey)?.items).toEqual([]);
    expect(queryClient.getQueryData<FolderTreeResponse>(treeKey)).toEqual({
      folders: [],
      documents: [],
    });
  });
});
