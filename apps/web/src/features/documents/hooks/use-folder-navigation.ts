import { useNavigate } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import type { BrowserContextItem } from '@/features/file-browser/components/vault-browser.types';

export function useFolderNavigation({
  vaultId,
  onBeforeFolderNavigate,
}: {
  vaultId: string;
  onBeforeFolderNavigate?: () => void;
}) {
  const navigate = useNavigate();

  function navigateToFolder(folderId: string | null) {
    onBeforeFolderNavigate?.();
    void navigate({
      to: ROUTES.vaultRoot(vaultId),
      search: folderId === null ? {} : { folderId },
      replace: false,
    } as any);
  }

  function navigateToDocument(documentId: string) {
    void navigate({ to: ROUTES.vaultDocument(vaultId, documentId) } as any);
  }

  function navigateToUpload(folderId: string | null) {
    void navigate({ to: ROUTES.transfersWithLock(vaultId, folderId) } as any);
  }

  function openItem(item: BrowserContextItem) {
    if (item.type === 'root') {
      navigateToFolder(null);
      return;
    }

    if (item.type === 'background') {
      navigateToFolder(item.folderId);
      return;
    }

    if (item.type === 'folder') {
      navigateToFolder(item.folder.id);
      return;
    }

    navigateToDocument(item.document.id);
  }

  return {
    navigateToFolder,
    navigateToDocument,
    navigateToUpload,
    openItem,
  };
}
