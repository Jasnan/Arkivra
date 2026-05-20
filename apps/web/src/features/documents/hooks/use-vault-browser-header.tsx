import type { Dispatch, DragEvent, MouseEvent, SetStateAction } from 'react';
import { useMemo } from 'react';
import { Box, Flex, HStack, Menu, Portal } from '@chakra-ui/react';
import { ChevronDown, FileUp, FolderPlus, FolderUp, Upload } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { Button } from '@/components/ui/button';
import { FileBrowserViewToggle } from '@/features/file-browser/components/file-browser-view-toggle';
import { VaultRouteBreadcrumbs } from '@/features/file-browser/components/vault-browser-components';
import type { VaultBreadcrumbEntry } from '@/features/file-browser/components/vault-browser-components';
import type { BrowserDropTarget, FileBrowserView } from '@/features/file-browser/components/vault-browser.types';
import type { FolderBreadcrumb } from '@/features/file-browser/file-browser.types';

const uploadMenuItemProps = {
  cursor: 'default',
  color: 'fg.muted',
  _highlighted: { bg: 'bg.muted', color: 'fg' },
} as const;

const toolbarControlStyles = {
  h: '10',
  rounded: 'md',
  borderColor: 'border.surface',
  bg: 'bg.surface',
  shadow: 'none',
  _hover: { borderColor: 'fg/30', bg: 'bg.surface' },
  _focusVisible: {
    borderColor: 'teal.solid',
    outline: '2px solid',
    outlineColor: 'teal.focusRing',
    outlineOffset: '1px',
  },
} as const;

export function useVaultBrowserHeader({
  vaultId,
  vaultName,
  currentFolderId,
  breadcrumbs,
  selectedCount,
  browserView,
  setBrowserView,
  dropTarget,
  onClearSelection,
  onNavigateFolder,
  onOpenRootContextMenu,
  onOpenCreateFolderDialog,
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
  browserView: FileBrowserView;
  setBrowserView: Dispatch<SetStateAction<FileBrowserView>>;
  dropTarget: BrowserDropTarget | null;
  onClearSelection: () => void;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenRootContextMenu: (event: MouseEvent<HTMLElement>) => void;
  onOpenCreateFolderDialog: (parentId: string | null) => void;
  onOpenUploadFiles: () => void;
  onOpenUploadDirectory: () => void;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
}) {
  const breadcrumbEntries = useMemo<VaultBreadcrumbEntry[]>(() => [
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
  ], [
    breadcrumbs,
    currentFolderId,
    onNavigateFolder,
    onOpenRootContextMenu,
    vaultId,
    vaultName,
  ]);

  const browserActions = useMemo(() => (
    <HStack gap="2" justify="flex-end">
        {selectedCount > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={onClearSelection}>
            Clear
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          px="3"
          {...toolbarControlStyles}
          onClick={() => onOpenCreateFolderDialog(currentFolderId)}
        >
          <FolderPlus size={16} />
          New
        </Button>
        <Menu.Root lazyMount unmountOnExit typeahead={false} positioning={{ placement: 'bottom-end' }}>
          <Menu.Trigger asChild>
            <Button
              type="button"
              size="sm"
              px="3"
              colorPalette="teal"
              h="10"
              rounded="md"
              shadow="none"
            >
              <Upload size={16} />
              Upload
              <ChevronDown size={14} />
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
                <Menu.Item value="upload-files" {...uploadMenuItemProps} onClick={onOpenUploadFiles}>
                  <FileUp size={16} />
                  Upload
                </Menu.Item>
                <Menu.Item value="upload-folder" {...uploadMenuItemProps} onClick={onOpenUploadDirectory}>
                  <FolderUp size={16} />
                  Upload folder
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
        <FileBrowserViewToggle value={browserView} onValueChange={setBrowserView} />
      </HStack>
  ), [
    browserView,
    currentFolderId,
    onClearSelection,
    onOpenCreateFolderDialog,
    onOpenUploadDirectory,
    onOpenUploadFiles,
    selectedCount,
    setBrowserView,
  ]);

  const workspaceHeader = useMemo(() => ({
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
  }), [
    breadcrumbEntries,
    browserActions,
    dropTarget,
    onDragLeaveFolder,
    onDragOverFolder,
    onDropOnFolder,
  ]);

  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);

  const contentsToolbar = useMemo(() => isInWorkspaceShell ? null : (
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
  ), [
    browserActions,
    isInWorkspaceShell,
  ]);

  return {
    contentsToolbar,
    isInWorkspaceShell,
    workspaceHeader,
  };
}
