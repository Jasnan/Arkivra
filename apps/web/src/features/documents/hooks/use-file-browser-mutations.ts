import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toaster-store';
import { ApiError } from '@/lib/api';
import { adminQueryKeys } from '@/features/admin/admin.queries';
import { chatQueryKeys } from '@/features/chat/chat.queries';
import { getDocumentDownloadUrl, moveDocument, renameDocument, softDeleteDocument } from '@/features/documents/documents.api';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import type { DocumentSummary } from '@/features/documents/documents.types';
import {
  getBrowserItemParentId,
} from '@/features/file-browser/components/vault-browser.types';
import type { BrowserItem } from '@/features/file-browser/components/vault-browser.types';
import { createFolder, moveFolder, renameFolder, softDeleteFolder } from '@/features/file-browser/file-browser.api';
import { fileBrowserQueryKeys } from '@/features/file-browser/file-browser.queries';
import type { FolderItemsResponse, FolderSummary, FolderTreeResponse } from '@/features/file-browser/file-browser.types';
import { searchQueryKeys } from '@/features/search/search.queries';

export type FileBrowserTrashTarget =
  | { type: 'document'; vaultId: string; id: string }
  | { type: 'folder'; vaultId: string; id: string };

interface FileBrowserCacheSnapshotEntry {
  queryKey: QueryKey;
  data: unknown;
}

function isFileBrowserVaultQuery(queryKey: QueryKey, vaultIds: Set<string>) {
  return Array.isArray(queryKey)
    && queryKey[0] === fileBrowserQueryKeys.all[0]
    && typeof queryKey[2] === 'string'
    && vaultIds.has(queryKey[2]);
}

function getRemovedFolderIds(folders: FolderTreeResponse['folders'], folderIds: Set<string>) {
  const removedFolderIds = new Set(folderIds);
  let removedChild = true;

  while (removedChild) {
    removedChild = false;
    for (const folder of folders) {
      if (
        !removedFolderIds.has(folder.id)
        && folder.parentId !== null
        && removedFolderIds.has(folder.parentId)
      ) {
        removedFolderIds.add(folder.id);
        removedChild = true;
      }
    }
  }

  return removedFolderIds;
}

function removeTrashTargetsFromFolderItems(
  data: FolderItemsResponse,
  documentIds: Set<string>,
  removedFolderIds: Set<string>,
): FolderItemsResponse {
  return {
    ...data,
    folders: data.folders.filter(folder => !removedFolderIds.has(folder.id)),
    documents: data.documents.filter(document =>
      !documentIds.has(document.id)
      && (document.folderId === null || !removedFolderIds.has(document.folderId)),
    ),
    items: data.items.filter((item) => {
      if (item.type === 'folder') {
        return !removedFolderIds.has(item.folder.id);
      }

      return !documentIds.has(item.document.id)
        && (item.document.folderId === null || !removedFolderIds.has(item.document.folderId));
    }),
  };
}

function removeTrashTargetsFromFolderTree(
  data: FolderTreeResponse,
  documentIds: Set<string>,
  removedFolderIds: Set<string>,
): FolderTreeResponse {
  return {
    ...data,
    folders: data.folders.filter(folder => !removedFolderIds.has(folder.id)),
    documents: data.documents.filter(document =>
      !documentIds.has(document.id)
      && (document.folderId === null || !removedFolderIds.has(document.folderId)),
    ),
  };
}

export function removeTrashTargetsFromFileBrowserCache(
  queryClient: QueryClient,
  targets: FileBrowserTrashTarget[],
) {
  const targetsByVaultId = new Map<string, FileBrowserTrashTarget[]>();

  for (const target of targets) {
    targetsByVaultId.set(target.vaultId, [...(targetsByVaultId.get(target.vaultId) ?? []), target]);
  }

  for (const [targetVaultId, vaultTargets] of targetsByVaultId) {
    const documentIds = new Set(vaultTargets.filter(target => target.type === 'document').map(target => target.id));
    const folderIds = new Set(vaultTargets.filter(target => target.type === 'folder').map(target => target.id));
    const treeQueryKey = fileBrowserQueryKeys.folderTree(targetVaultId);
    const treeData = queryClient.getQueryData<FolderTreeResponse>(treeQueryKey);
    const removedFolderIds = getRemovedFolderIds(treeData?.folders ?? [], folderIds);
    const vaultIds = new Set([targetVaultId]);

    queryClient.setQueriesData<FolderItemsResponse>(
      {
        queryKey: fileBrowserQueryKeys.all,
        predicate: query => isFileBrowserVaultQuery(query.queryKey, vaultIds) && query.queryKey[1] === 'folder-items',
      },
      data => data ? removeTrashTargetsFromFolderItems(data, documentIds, removedFolderIds) : data,
    );

    queryClient.setQueryData<FolderTreeResponse>(
      treeQueryKey,
      data => data ? removeTrashTargetsFromFolderTree(data, documentIds, removedFolderIds) : data,
    );
  }
}

function snapshotFileBrowserCache(
  queryClient: QueryClient,
  targets: FileBrowserTrashTarget[],
): FileBrowserCacheSnapshotEntry[] {
  const vaultIds = new Set(targets.map(target => target.vaultId));

  return queryClient
    .getQueryCache()
    .findAll({ queryKey: fileBrowserQueryKeys.all })
    .filter(query => isFileBrowserVaultQuery(query.queryKey, vaultIds))
    .map(query => ({
      queryKey: query.queryKey,
      data: query.state.data,
    }));
}

function restoreFileBrowserCache(
  queryClient: QueryClient,
  snapshot: FileBrowserCacheSnapshotEntry[] | undefined,
) {
  for (const entry of snapshot ?? []) {
    queryClient.setQueryData(entry.queryKey, entry.data);
  }
}

function documentTrashTargets(documents: Array<{ vaultId: string; documentId: string }>): FileBrowserTrashTarget[] {
  return documents.map(document => ({
    type: 'document',
    vaultId: document.vaultId,
    id: document.documentId,
  }));
}

function browserItemTrashTargets(vaultId: string, items: BrowserItem[]): FileBrowserTrashTarget[] {
  return items.map((item) => {
    if (item.type === 'folder') {
      return {
        type: 'folder',
        vaultId,
        id: item.folder.id,
      };
    }

    return {
      type: 'document',
      vaultId,
      id: item.document.id,
    };
  });
}

function getMoveErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'You do not have permission to move this item.';
    }

    if (error.status === 404) {
      return 'The item or destination folder is no longer available.';
    }

    return error.message;
  }

  return error instanceof Error ? error.message : 'Could not move item.';
}

function downloadDocuments(documents: Array<{ vaultId: string; documentId: string }>) {
  for (const document of documents) {
    const link = window.document.createElement('a');
    link.href = getDocumentDownloadUrl(document);
    link.download = '';
    link.rel = 'noopener';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

export function useFileBrowserMutations({
  vaultId,
  createFolderParentId,
  folderName,
  onClearSelection,
  onCreateFolderSuccess,
  onRenameSuccess,
  onMoveSuccess,
}: {
  vaultId: string;
  createFolderParentId: string | null;
  folderName: string;
  onClearSelection: () => void;
  onCreateFolderSuccess: () => void;
  onRenameSuccess: () => void;
  onMoveSuccess: () => void;
}) {
  const queryClient = useQueryClient();

  async function invalidateBrowserData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiStatus() }),
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
    ]);
  }

  async function prepareTrashMutation(targets: FileBrowserTrashTarget[]) {
    await queryClient.cancelQueries({ queryKey: fileBrowserQueryKeys.all });
    const browserSnapshot = snapshotFileBrowserCache(queryClient, targets);
    removeTrashTargetsFromFileBrowserCache(queryClient, targets);

    return { browserSnapshot };
  }

  async function moveBrowserItem({
    target,
    destinationId,
  }: {
    target: BrowserItem;
    destinationId: string | null;
  }) {
    if (target.type === 'folder') {
      return moveFolder({ vaultId, folderId: target.folder.id, parentId: destinationId });
    }

    return moveDocument({ vaultId, documentId: target.document.id, folderId: destinationId });
  }

  const deleteMutation = useMutation({
    mutationFn: async (documents: Array<{ vaultId: string; documentId: string }>) =>
      Promise.all(documents.map((document) => softDeleteDocument(document))),
    onMutate: documents => prepareTrashMutation(documentTrashTargets(documents)),
    onSuccess: (_data, documents) => {
      toast.success(
        documents.length === 1
          ? 'Document moved to trash.'
          : `${documents.length} documents moved to trash.`,
      );
      onClearSelection();
    },
    onError: (error, _documents, context) => {
      restoreFileBrowserCache(queryClient, context?.browserSnapshot);
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
    onSettled: () => invalidateBrowserData(),
  });
  const deleteItemsMutation = useMutation({
    mutationFn: async (items: BrowserItem[]) =>
      Promise.all(items.map((item) => {
        if (item.type === 'folder') {
          return softDeleteFolder({ vaultId, folderId: item.folder.id });
        }

        return softDeleteDocument({ vaultId, documentId: item.document.id });
      })),
    onMutate: items => prepareTrashMutation(browserItemTrashTargets(vaultId, items)),
    onSuccess: (_data, items) => {
      toast.success(
        items.length === 1
          ? 'Item moved to trash.'
          : `${items.length} items moved to trash.`,
      );
      onClearSelection();
    },
    onError: (error, _items, context) => {
      restoreFileBrowserCache(queryClient, context?.browserSnapshot);
      toast.error(error instanceof Error ? error.message : 'Could not delete selected items.');
    },
    onSettled: () => invalidateBrowserData(),
  });
  const createFolderMutation = useMutation({
    mutationFn: () => createFolder({
      vaultId,
      parentId: createFolderParentId,
      name: folderName,
    }),
    onSuccess: async () => {
      toast.success('Folder created.');
      onCreateFolderSuccess();
      await queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create folder.');
    },
  });
  const renameMutation = useMutation({
    mutationFn: async ({ target, name }: { target: BrowserItem; name: string }) => {
      if (target.type === 'folder') {
        return renameFolder({ vaultId, folderId: target.folder.id, name });
      }

      return renameDocument({ vaultId, documentId: target.document.id, name });
    },
    onSuccess: async (_data, variables) => {
      toast.success(`${variables.target.type === 'folder' ? 'Folder' : 'Document'} renamed.`);
      onRenameSuccess();
      await invalidateBrowserData();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename item.');
    },
  });
  const moveMutation = useMutation({
    mutationFn: moveBrowserItem,
    onSuccess: async (_data, variables) => {
      toast.success(`${variables.target.type === 'folder' ? 'Folder' : 'Document'} moved.`);
      onMoveSuccess();
      onClearSelection();
      await invalidateBrowserData();
    },
    onError: (error) => {
      toast.error(getMoveErrorMessage(error));

      if (error instanceof ApiError && error.status === 404) {
        void queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all });
      }
    },
  });
  const moveItemsMutation = useMutation({
    mutationFn: async ({ targets, destinationId }: { targets: BrowserItem[]; destinationId: string | null }) => {
      const targetsToMove = targets.filter(target => getBrowserItemParentId(target) !== destinationId);
      await Promise.all(targetsToMove.map(target => moveBrowserItem({ target, destinationId })));
      return { movedCount: targetsToMove.length };
    },
    onSuccess: async ({ movedCount }) => {
      if (movedCount > 0) {
        toast.success(movedCount === 1 ? 'Item moved.' : `${movedCount} items moved.`);
      }
      onMoveSuccess();
      onClearSelection();
      await invalidateBrowserData();
    },
    onError: (error) => {
      toast.error(getMoveErrorMessage(error));
      void invalidateBrowserData();
    },
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (folder: FolderSummary) => softDeleteFolder({ vaultId, folderId: folder.id }),
    onMutate: folder => prepareTrashMutation([{ type: 'folder', vaultId, id: folder.id }]),
    onSuccess: () => {
      toast.success('Folder moved to trash.');
      onClearSelection();
    },
    onError: (error, _folder, context) => {
      restoreFileBrowserCache(queryClient, context?.browserSnapshot);
      toast.error(error instanceof Error ? error.message : 'Could not delete folder.');
    },
    onSettled: () => invalidateBrowserData(),
  });

  function deleteDocument(document: DocumentSummary) {
    deleteMutation.mutate([{ vaultId, documentId: document.id }]);
  }

  return {
    deleteMutation,
    deleteItemsMutation,
    createFolderMutation,
    renameMutation,
    moveMutation,
    moveItemsMutation,
    deleteFolderMutation,
    deleteDocument,
    downloadDocuments,
    itemMutationPending: deleteMutation.isPending
      || deleteFolderMutation.isPending
      || deleteItemsMutation.isPending
      || renameMutation.isPending
      || moveMutation.isPending
      || moveItemsMutation.isPending,
  };
}
