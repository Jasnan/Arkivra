import { useQuery } from '@tanstack/react-query';
import { listFolderItems, listFolderTree } from './file-browser.api';

export const fileBrowserQueryKeys = {
  all: ['file-browser'] as const,
  folderItems: (vaultId: string, folderId: string | null) =>
    [...fileBrowserQueryKeys.all, 'folder-items', vaultId, folderId ?? 'root'] as const,
  folderTree: (vaultId: string) =>
    [...fileBrowserQueryKeys.all, 'folder-tree', vaultId] as const,
};

export function useFolderItemsQuery({
  vaultId,
  folderId,
  enabled = true,
}: {
  vaultId: string;
  folderId: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: fileBrowserQueryKeys.folderItems(vaultId, folderId),
    queryFn: () => listFolderItems({ vaultId, folderId }),
    enabled: enabled && vaultId.length > 0,
  });
}

export function useFolderTreeQuery({
  vaultId,
  enabled = true,
}: {
  vaultId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: fileBrowserQueryKeys.folderTree(vaultId),
    queryFn: () => listFolderTree({ vaultId }),
    enabled: enabled && vaultId.length > 0,
  });
}
