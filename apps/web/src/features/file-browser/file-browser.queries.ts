import { useQuery } from '@tanstack/react-query';
import { listFolderItems } from './file-browser.api';

export const fileBrowserQueryKeys = {
  all: ['file-browser'] as const,
  folderItems: (vaultId: string, folderId: string | null) =>
    [...fileBrowserQueryKeys.all, 'folder-items', vaultId, folderId ?? 'root'] as const,
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
