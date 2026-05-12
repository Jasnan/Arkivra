import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { getDocumentDownloadUrl, moveDocument, renameDocument, softDeleteDocument } from '@/features/documents/documents.api';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import type { DocumentSummary } from '@/features/documents/documents.types';
import {
  getBrowserItemParentId,
} from '@/features/file-browser/components/vault-browser.types';
import type { BrowserItem } from '@/features/file-browser/components/vault-browser.types';
import { createFolder, moveFolder, renameFolder, softDeleteFolder } from '@/features/file-browser/file-browser.api';
import { fileBrowserQueryKeys } from '@/features/file-browser/file-browser.queries';
import type { FolderSummary } from '@/features/file-browser/file-browser.types';
import { searchQueryKeys } from '@/features/search/search.queries';

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
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
    ]);
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
    onSuccess: async (_data, documents) => {
      toast.success(
        documents.length === 1
          ? 'Document moved to trash.'
          : `${documents.length} documents moved to trash.`,
      );
      onClearSelection();
      await invalidateBrowserData();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
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
    onSuccess: async () => {
      toast.success('Folder moved to trash.');
      onClearSelection();
      await invalidateBrowserData();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete folder.');
    },
  });

  function deleteDocument(document: DocumentSummary) {
    deleteMutation.mutate([{ vaultId, documentId: document.id }]);
  }

  return {
    deleteMutation,
    createFolderMutation,
    renameMutation,
    moveMutation,
    moveItemsMutation,
    deleteFolderMutation,
    deleteDocument,
    downloadDocuments,
    itemMutationPending: deleteMutation.isPending
      || deleteFolderMutation.isPending
      || renameMutation.isPending
      || moveMutation.isPending
      || moveItemsMutation.isPending,
  };
}
