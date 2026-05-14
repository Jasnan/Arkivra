import type { Dispatch, DragEvent, MouseEvent, SetStateAction } from 'react';
import { useMemo } from 'react';
import { Box, Flex, HStack, Menu, Portal, Text } from '@chakra-ui/react';
import { ArrowUpDown, Check, ChevronDown, FileUp, FolderPlus, FolderUp, Grid3X3, List, Upload } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { Button } from '@/components/ui/button';
import { VaultRouteBreadcrumbs } from '@/features/file-browser/components/vault-browser-components';
import type { VaultBreadcrumbEntry } from '@/features/file-browser/components/vault-browser-components';
import type { BrowserDropTarget, FileBrowserSort, FileBrowserView } from '@/features/file-browser/components/vault-browser.types';
import type { FolderBreadcrumb } from '@/features/file-browser/file-browser.types';

const browserSortOptions: Array<{ value: FileBrowserSort; label: string }> = [
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'updated_asc', label: 'Oldest updated' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'size_asc', label: 'Smallest first' },
];

const uploadMenuItemProps = {
  cursor: 'default',
  color: 'fg.muted',
  _highlighted: { bg: 'bg.muted', color: 'fg' },
} as const;

const toolbarControlStyles = {
  h: '10',
  rounded: 'md',
  borderColor: 'border.subtle',
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
  activeResultCount,
  selectedCount,
  browserView,
  setBrowserView,
  browserSort,
  setBrowserSort,
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
  activeResultCount: number;
  selectedCount: number;
  browserView: FileBrowserView;
  setBrowserView: Dispatch<SetStateAction<FileBrowserView>>;
  browserSort: FileBrowserSort;
  setBrowserSort: Dispatch<SetStateAction<FileBrowserSort>>;
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
  const selectedSortLabel = browserSortOptions.find((option) => option.value === browserSort)?.label ?? browserSortOptions[0].label;
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
  }), [
    breadcrumbEntries,
    dropTarget,
    onDragLeaveFolder,
    onDragOverFolder,
    onDropOnFolder,
  ]);

  const secondaryHeader = useMemo(() => (
    <Flex
      align="center"
      justify="space-between"
      gap="3"
      borderBottomWidth="1px"
      borderColor="border.subtle"
      bg="bg.workspace"
      px={{ base: '4', lg: '6' }}
      py="3"
    >
      <HStack gap="2">
        <Button
          type="button"
          size="icon"
          variant={browserView === 'grid' ? 'solid' : 'ghost'}
          aria-label="Grid view"
          onClick={() => setBrowserView('grid')}
        >
          <Grid3X3 size={17} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={browserView === 'list' ? 'solid' : 'ghost'}
          aria-label="List view"
          onClick={() => setBrowserView('list')}
        >
          <List size={17} />
        </Button>
        <Text fontSize="xs" color="fg.muted">
          {activeResultCount} item{activeResultCount === 1 ? '' : 's'}
          {selectedCount > 0 ? ` - ${selectedCount} selected` : ''}
        </Text>
      </HStack>
      <HStack gap="2">
        {selectedCount > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={onClearSelection}>
            Clear
          </Button>
        ) : null}
        <Menu.Root positioning={{ placement: 'bottom-end', offset: { mainAxis: 6, crossAxis: 0 } }}>
          <Menu.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label="Sort folder items"
              display={{ base: 'none', xl: 'inline-flex' }}
              minW="12rem"
              justifyContent="space-between"
              gap="2"
              px="3"
              {...toolbarControlStyles}
            >
              <Flex minW="0" align="center" gap="2">
                <Box color="fg.muted" aria-hidden="true">
                  <ArrowUpDown size={16} />
                </Box>
                <Text as="span" truncate fontSize="sm" fontWeight="medium">
                  {selectedSortLabel}
                </Text>
              </Flex>
              <Box flexShrink={0} color="fg.muted" aria-hidden="true">
                <ChevronDown size={16} />
              </Box>
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner zIndex="dropdown">
              <Menu.Content
                minW="12rem"
                rounded="lg"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="bg.surface"
                p="1.5"
                shadow="lg"
              >
                <Menu.RadioItemGroup
                  value={browserSort}
                  onValueChange={(event) => setBrowserSort(event.value as FileBrowserSort)}
                >
                  {browserSortOptions.map((option) => (
                    <Menu.RadioItem
                      key={option.value}
                      value={option.value}
                      position="relative"
                      minH="10"
                      rounded="md"
                      py="2"
                      ps="10"
                      pe="3"
                      fontSize="sm"
                      fontWeight="medium"
                      color="fg"
                      _checked={{ bg: 'teal.subtle', color: 'fg' }}
                      _highlighted={{ bg: browserSort === option.value ? 'teal.subtle' : 'bg.subtle' }}
                    >
                      <Box
                        position="absolute"
                        left="2.5"
                        top="50%"
                        display="flex"
                        boxSize="5"
                        alignItems="center"
                        justifyContent="center"
                        rounded="sm"
                        color="teal.solid"
                        transform="translateY(-50%)"
                      >
                        <Menu.ItemIndicator>
                          <Check size={16} strokeWidth={2.5} />
                        </Menu.ItemIndicator>
                      </Box>
                      <Menu.ItemText>{option.label}</Menu.ItemText>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioItemGroup>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
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
                borderColor="border.subtle"
                bg="bg.surface"
                p="1.5"
                shadow="lg"
              >
                <Menu.Item value="upload-files" {...uploadMenuItemProps} onClick={onOpenUploadFiles}>
                  <FileUp size={16} />
                  Upload files
                </Menu.Item>
                <Menu.Item value="upload-folder" {...uploadMenuItemProps} onClick={onOpenUploadDirectory}>
                  <FolderUp size={16} />
                  Upload folder
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>
    </Flex>
  ), [
    activeResultCount,
    browserSort,
    browserView,
    currentFolderId,
    onClearSelection,
    onOpenCreateFolderDialog,
    onOpenUploadDirectory,
    onOpenUploadFiles,
    selectedCount,
    selectedSortLabel,
    setBrowserSort,
    setBrowserView,
  ]);

  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);

  return {
    isInWorkspaceShell,
    secondaryHeader,
    workspaceHeader,
  };
}
