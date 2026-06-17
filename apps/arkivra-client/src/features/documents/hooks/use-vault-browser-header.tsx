import type { Dispatch, DragEvent, MouseEvent, SetStateAction } from 'react';
import { useMemo } from 'react';
import { Box, Flex, HStack, Menu, Portal } from '@chakra-ui/react';
import { ChevronDown, FileUp, FolderUp, Upload } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { Button } from '@/components/ui/button';
import { FileSortMenu } from '@/features/documents/components/file-sort-menu';
import { FileBrowserViewToggle } from '@/features/file-browser/components/file-browser-view-toggle';
import { VaultRouteBreadcrumbs } from '@/features/file-browser/components/vault-browser-components';
import type { VaultBreadcrumbEntry } from '@/features/file-browser/components/vault-browser-components';
import type {
  BrowserDropTarget,
  FileBrowserSort,
  FileBrowserView,
} from '@/features/file-browser/components/vault-browser.types';
import type { FolderBreadcrumb } from '@/features/file-browser/file-browser.types';

const uploadMenuItemProps = {
  cursor: 'default',
  color: 'fg.muted',
  _highlighted: { bg: 'bg.muted', color: 'fg' },
} as const;

export function useVaultBrowserHeader({
  vaultId,
  vaultName,
  currentFolderId,
  breadcrumbs,
  selectedCount,
  showBrowserActions = true,
  browserSort,
  onBrowserSortChange,
  browserView,
  setBrowserView,
  dropTarget,
  onClearSelection,
  onNavigateFolder,
  onOpenRootContextMenu,
  onOpenUploadFiles,
  onOpenUploadDirectory,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
}: {
  vaultId: string;
  vaultName: string;
  currentFolderId: string | null;
  breadcrumbs: FolderBreadcrumb[];
  selectedCount: number;
  showBrowserActions?: boolean;
  browserSort?: FileBrowserSort;
  onBrowserSortChange?: (value: FileBrowserSort) => void;
  browserView: FileBrowserView;
  setBrowserView: Dispatch<SetStateAction<FileBrowserView>>;
  dropTarget: BrowserDropTarget | null;
  onClearSelection: () => void;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenRootContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onOpenUploadFiles: () => void;
  onOpenUploadDirectory: () => void;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
}) {
  const breadcrumbEntries = useMemo<VaultBreadcrumbEntry[]>(
    () => [
      { key: 'vaults', label: 'Vaults', to: ROUTES.vaults },
      {
        key: `vault-${vaultId}`,
        label: vaultName || 'Vault',
        to: ROUTES.vaultRoot(vaultId),
        onClick: currentFolderId === null ? undefined : () => onNavigateFolder(null),
        onContextMenu: onOpenRootContextMenu,
        dropFolderId: null,
      },
      ...breadcrumbs.map((folder, index) => {
        const isCurrent = index === breadcrumbs.length - 1;

        return {
          key: `folder-${folder.id}`,
          label: folder.name,
          onClick: isCurrent ? undefined : () => onNavigateFolder(folder.id),
          onContextMenu: undefined,
          dropFolderId: folder.id,
        };
      }),
    ],
    [breadcrumbs, currentFolderId, onNavigateFolder, onOpenRootContextMenu, vaultId, vaultName],
  );

  const browserActions = useMemo(
    () =>
      showBrowserActions ? (
        <HStack gap="2" justify="flex-end">
          {selectedCount > 0 ? (
            <Button type="button" size="sm" variant="outline" onClick={onClearSelection}>
              Clear
            </Button>
          ) : null}
          <Menu.Root
            lazyMount
            unmountOnExit
            typeahead={false}
            positioning={{ placement: 'bottom-end' }}
          >
            <Menu.Trigger asChild>
              <Button type="button" size="sm" px="3" colorPalette="teal" rounded="md" shadow="none">
                <Upload size={15} />
                <ChevronDown size={13} />
              </Button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content
                  minW="48"
                  overflow="hidden"
                  rounded="lg"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  p="1.5"
                  shadow="lg"
                >
                  <Menu.Item
                    value="upload-files"
                    {...uploadMenuItemProps}
                    onClick={onOpenUploadFiles}
                  >
                    <FileUp size={16} />
                    Upload
                  </Menu.Item>
                  <Menu.Item
                    value="upload-folder"
                    {...uploadMenuItemProps}
                    onClick={onOpenUploadDirectory}
                  >
                    <FolderUp size={16} />
                    Upload folder
                  </Menu.Item>
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
          {browserSort && onBrowserSortChange ? (
            <Box flexShrink={0}>
              <FileSortMenu
                hideLabel
                size="sm"
                value={browserSort}
                onValueChange={onBrowserSortChange}
              />
            </Box>
          ) : null}
          <FileBrowserViewToggle value={browserView} onValueChange={setBrowserView} size="sm" />
        </HStack>
      ) : null,
    [
      browserSort,
      browserView,
      onBrowserSortChange,
      onClearSelection,
      onOpenUploadDirectory,
      onOpenUploadFiles,
      selectedCount,
      setBrowserView,
      showBrowserActions,
    ],
  );

  const workspaceHeader = useMemo(
    () => ({
      left: (
        <VaultRouteBreadcrumbs
          entries={breadcrumbEntries}
          dropTarget={dropTarget}
          onDragOverFolder={onDragOverFolder}
          onDragLeaveFolder={onDragLeaveFolder}
          onDropOnFolder={onDropOnFolder}
        />
      ),
      actions: browserActions,
    }),
    [
      breadcrumbEntries,
      browserActions,
      dropTarget,
      onDragLeaveFolder,
      onDragOverFolder,
      onDropOnFolder,
    ],
  );

  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);

  const contentsToolbar = useMemo(
    () =>
      isInWorkspaceShell || browserActions === null ? null : (
        <Flex
          align="center"
          justify="space-between"
          gap="3"
          borderBottomWidth="1px"
          borderColor="border.surface"
          bg="bg.workspace"
          px={{ base: '4', lg: '6' }}
          py="3"
        >
          <Box flex="1" />
          {browserActions}
        </Flex>
      ),
    [browserActions, isInWorkspaceShell],
  );

  return {
    contentsToolbar,
    isInWorkspaceShell,
    workspaceHeader,
  };
}
