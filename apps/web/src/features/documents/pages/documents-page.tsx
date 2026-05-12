import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, HStack, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { Download, Eye, Folder, FolderPlus, Home, Info, MoveRight, Pencil, Tags, Trash2, Upload } from 'lucide-react';
import { useParams, useSearch } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { useBrowserDragDrop } from '@/features/documents/hooks/use-browser-drag-drop';
import { useBrowserSelection } from '@/features/documents/hooks/use-browser-selection';
import { useFileBrowserMutations } from '@/features/documents/hooks/use-file-browser-mutations';
import { useFolderNavigation } from '@/features/documents/hooks/use-folder-navigation';
import { useVaultBrowserHeader } from '@/features/documents/hooks/use-vault-browser-header';
import {
  BrowserContextMenu,
  BrowserItemGrid,
  BrowserItemList,
  ItemInfoDialog,
  MoveItemDialog,
  RenameItemDialog,
} from '@/features/file-browser/components/vault-browser-components';
import {
  FILE_BROWSER_SORT_STORAGE_KEY,
  FILE_BROWSER_VIEW_STORAGE_KEY,
  getBrowserItemKey,
  getInitialBrowserSort,
  getInitialBrowserView,
  getItemName,
  getMoveDestinations,
} from '@/features/file-browser/components/vault-browser.types';
import type {
  BrowserAction,
  BrowserContextItem,
  BrowserItem,
  ContextMenuState,
  FileBrowserSort,
  FileBrowserView,
  InfoDialogTarget,
  ItemDialogTarget,
} from '@/features/file-browser/components/vault-browser.types';
import { fileBrowserQueryKeys, useFolderItemsQuery, useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { useVaultQuery } from '@/features/vaults/vaults.queries';
import type { VaultMemberPermission } from '@/features/vaults/vaults.types';

function hasVaultPermission({
  vault,
  permission,
}: {
  vault: { role: 'owner' | 'member' | null; permissions: VaultMemberPermission[]; isGlobalAdmin: boolean } | null | undefined;
  permission: VaultMemberPermission;
}) {
  return Boolean(
    vault?.isGlobalAdmin
    || vault?.role === 'owner'
    || vault?.permissions.includes(permission),
  );
}

function getBrowserItemUpdatedTime(item: BrowserItem) {
  const value = item.type === 'folder' ? item.folder.updatedAt : item.document.updatedAt;
  return new Date(value).getTime();
}

function getBrowserItemSize(item: BrowserItem) {
  return item.type === 'folder' ? 0 : item.document.originalSize;
}

function compareBrowserItems(left: BrowserItem, right: BrowserItem, sortBy: FileBrowserSort) {
  if (left.type !== right.type) {
    return left.type === 'folder' ? -1 : 1;
  }

  if (sortBy === 'updated_desc') {
    return getBrowserItemUpdatedTime(right) - getBrowserItemUpdatedTime(left)
      || getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' });
  }

  if (sortBy === 'updated_asc') {
    return getBrowserItemUpdatedTime(left) - getBrowserItemUpdatedTime(right)
      || getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' });
  }

  if (sortBy === 'size_desc') {
    return getBrowserItemSize(right) - getBrowserItemSize(left)
      || getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' });
  }

  if (sortBy === 'size_asc') {
    return getBrowserItemSize(left) - getBrowserItemSize(right)
      || getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' });
  }

  if (sortBy === 'name_desc') {
    return getItemName(right).localeCompare(getItemName(left), undefined, { sensitivity: 'base' });
  }

  return getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' });
}

export function DocumentsPage() {
  const params = useParams({ strict: false }) as { vaultId?: string };
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const vaultId = params.vaultId ?? '';
  const currentFolderId = search.folderId ?? null;
  const queryClient = useQueryClient();

  const [browserView, setBrowserView] = useState<FileBrowserView>(getInitialBrowserView);
  const [browserSort, setBrowserSort] = useState<FileBrowserSort>(getInitialBrowserSort);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<ItemDialogTarget>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<ItemDialogTarget>(null);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null);
  const [infoTarget, setInfoTarget] = useState<InfoDialogTarget>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const folderItemsQuery = useFolderItemsQuery({
    vaultId,
    folderId: currentFolderId,
  });
  const folderTreeQuery = useFolderTreeQuery({
    vaultId,
    enabled: true,
  });
  const vaultQuery = useVaultQuery({ vaultId });

  const browserItems = useMemo<BrowserItem[]>(
    () => [...(folderItemsQuery.data?.items ?? [])].sort((left, right) => compareBrowserItems(left, right, browserSort)),
    [browserSort, folderItemsQuery.data?.items],
  );
  const activeResultCount = browserItems.length;
  const activeIsLoading = folderItemsQuery.isLoading;
  const activeIsError = folderItemsQuery.isError;
  const emptyState =
    !activeIsLoading &&
    !activeIsError &&
    browserItems.length === 0;
  const canUpdateItems = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'documents.update' });
  const canDeleteItems = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'documents.delete' });
  const canDownloadItems = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'documents.download' });
  const canManageTags = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'tags.manage' });
  const canCreateItems = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'documents.create' });
  const {
    selectedItemKeys,
    selectedItems,
    selectedCount,
    clearSelection,
    selectSingleItem,
    selectBrowserItem,
  } = useBrowserSelection({
    currentFolderId,
    browserItems,
    onBeforeSelect: () => setContextMenu(null),
  });
  const {
    deleteMutation,
    createFolderMutation,
    renameMutation,
    moveMutation,
    moveItemsMutation,
    deleteFolderMutation,
    deleteDocument,
    downloadDocuments,
    itemMutationPending,
  } = useFileBrowserMutations({
    vaultId,
    createFolderParentId,
    folderName,
    onClearSelection: clearSelection,
    onCreateFolderSuccess: () => {
      setFolderName('');
      setCreateFolderParentId(null);
      setIsCreateFolderOpen(false);
    },
    onRenameSuccess: () => {
      setRenameTarget(null);
      setRenameValue('');
    },
    onMoveSuccess: () => {
      setMoveTarget(null);
      setMoveDestinationId(null);
    },
  });
  const {
    dropTarget,
    draggedItemKeys,
    resetDragState,
    handleItemDragStart,
    handleItemDragEnd,
    handleDragOverFolder,
    handleDragLeaveFolder,
    handleDropOnFolder,
  } = useBrowserDragDrop({
    canUpdateItems,
    itemMutationPending,
    selectedItemKeys,
    selectedItems,
    selectSingleItem,
    folders: folderTreeQuery.data?.folders,
    onMoveItems: moveItemsMutation.mutate,
  });
  const {
    navigateToFolder,
    navigateToDocument,
    navigateToUpload,
    openItem,
  } = useFolderNavigation({
    vaultId,
    onBeforeFolderNavigate: () => {
      clearSelection();
      resetDragState();
    },
  });
  const moveDestinations = useMemo(
    () => getMoveDestinations({ folders: folderTreeQuery.data?.folders ?? [], target: moveTarget }),
    [folderTreeQuery.data?.folders, moveTarget],
  );
  const infoFolderPath = useMemo(() => {
    if (infoTarget === null) {
      return 'Vault root';
    }

    if (infoTarget.type === 'root') {
      return 'Vault root';
    }

    if (infoTarget.type === 'document') {
      if (infoTarget.document.folderId === null) {
        return 'Vault root';
      }

      return folderTreeQuery.data?.folders.find(folder => folder.id === infoTarget.document.folderId)?.path ?? 'Folder';
    }

    return folderTreeQuery.data?.folders.find(folder => folder.id === infoTarget.folder.id)?.path ?? 'Folder';
  }, [folderTreeQuery.data?.folders, infoTarget]);

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string }>).detail;

      if (!detail?.vaultId || detail.vaultId !== vaultId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
      ]);
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, [queryClient, vaultId]);

  useEffect(() => {
    try {
      window.localStorage?.setItem?.(FILE_BROWSER_VIEW_STORAGE_KEY, browserView);
    } catch {
    }
  }, [browserView]);

  useEffect(() => {
    try {
      window.localStorage?.setItem?.(FILE_BROWSER_SORT_STORAGE_KEY, browserSort);
    } catch {
    }
  }, [browserSort]);

  function openCreateFolderDialog(parentId: string | null) {
    setCreateFolderParentId(parentId);
    setIsCreateFolderOpen(true);
  }

  function openRenameDialog(item: BrowserItem) {
    setContextMenu(null);
    setRenameTarget(item);
    setRenameValue(getItemName(item));
  }

  function openMoveDialog(item: BrowserItem) {
    setContextMenu(null);
    setMoveTarget(item);
    setMoveDestinationId(item.type === 'folder' ? item.folder.parentId : item.document.folderId);
  }

  function openInfoDialog(item: BrowserContextItem) {
    setContextMenu(null);
    setInfoTarget(item);
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, item: BrowserContextItem) {
    const actions = getItemActions(item).filter(action => !action.disabled);

    if (actions.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (item.type !== 'root' && !selectedItemKeys.has(getBrowserItemKey(item))) {
      selectSingleItem(item);
    }
    setContextMenu({
      item,
      x: Math.min(event.clientX, window.innerWidth - 224),
      y: Math.min(event.clientY, window.innerHeight - 320),
    });
  }

  function getItemActions(item: BrowserContextItem): BrowserAction[] {
    if (item.type === 'root') {
      return [
        { key: 'open', label: 'Open root', icon: Home, disabled: currentFolderId === null, onSelect: () => openItem(item) },
        { key: 'new-folder', label: 'New folder', icon: FolderPlus, disabled: !canCreateItems, onSelect: () => openCreateFolderDialog(null) },
        {
          key: 'upload',
          label: 'Upload',
          icon: Upload,
          disabled: !canCreateItems,
          onSelect: () => navigateToUpload(null),
        },
        { key: 'info', label: 'Info', icon: Info, onSelect: () => openInfoDialog(item) },
      ];
    }

    if (item.type === 'folder') {
      return [
        { key: 'open', label: 'Open', icon: Folder, onSelect: () => openItem(item) },
        { key: 'rename', label: 'Rename', icon: Pencil, disabled: !canUpdateItems, onSelect: () => openRenameDialog(item) },
        { key: 'move', label: 'Move to', icon: MoveRight, disabled: !canUpdateItems, onSelect: () => openMoveDialog(item) },
        { key: 'info', label: 'Info', icon: Info, onSelect: () => openInfoDialog(item) },
        {
          key: 'trash',
          label: 'Move to trash',
          icon: Trash2,
          tone: 'destructive',
          disabled: !canDeleteItems || deleteFolderMutation.isPending,
          onSelect: () => deleteFolderMutation.mutate(item.folder),
        },
      ];
    }

    return [
      { key: 'open', label: 'Preview/open', icon: Eye, onSelect: () => openItem(item) },
      {
        key: 'download',
        label: 'Download',
        icon: Download,
        disabled: !canDownloadItems,
        onSelect: () => downloadDocuments([{ vaultId, documentId: item.document.id }]),
      },
      { key: 'rename', label: 'Rename', icon: Pencil, disabled: !canUpdateItems, onSelect: () => openRenameDialog(item) },
      { key: 'move', label: 'Move to', icon: MoveRight, disabled: !canUpdateItems, onSelect: () => openMoveDialog(item) },
      {
        key: 'tags',
        label: 'Tags',
        icon: Tags,
        disabled: !canManageTags,
        onSelect: () => navigateToDocument(item.document.id),
      },
      { key: 'info', label: 'Info', icon: Info, onSelect: () => openInfoDialog(item) },
      {
        key: 'trash',
        label: 'Move to trash',
        icon: Trash2,
        tone: 'destructive',
        disabled: !canDeleteItems || deleteMutation.isPending,
        onSelect: () => deleteDocument(item.document),
      },
    ];
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (renameTarget === null || renameValue.trim().length === 0) {
      return;
    }

    renameMutation.mutate({ target: renameTarget, name: renameValue });
  }

  function handleMoveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (moveTarget === null) {
      return;
    }

    const currentDestinationId = moveTarget.type === 'folder' ? moveTarget.folder.parentId : moveTarget.document.folderId;
    if (moveDestinationId === currentDestinationId) {
      return;
    }

    moveMutation.mutate({ target: moveTarget, destinationId: moveDestinationId });
  }

  function handleCreateFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (folderName.trim().length === 0) {
      return;
    }

    createFolderMutation.mutate();
  }

  const browserHeader = useVaultBrowserHeader({
    vaultId,
    currentFolderId,
    breadcrumbs: folderItemsQuery.data?.breadcrumbs ?? [],
    activeResultCount,
    selectedCount,
    browserView,
    setBrowserView,
    browserSort,
    setBrowserSort,
    dropTarget,
    onClearSelection: clearSelection,
    onNavigateFolder: navigateToFolder,
    onOpenRootContextMenu: event => openContextMenu(event, { type: 'root', vaultId }),
    onOpenCreateFolderDialog: openCreateFolderDialog,
    onDragOverFolder: handleDragOverFolder,
    onDragLeaveFolder: handleDragLeaveFolder,
    onDropOnFolder: handleDropOnFolder,
  });

  if (!vaultId) {
    return <Text fontSize="sm" color="fg.error">Invalid vault id.</Text>;
  }

  return (
    <Flex as="section" h="full" minH="0" direction="column" overflow="hidden">
      {!browserHeader.isInWorkspaceShell ? (
        <Flex
          align="center"
          gap="4"
          borderBottomWidth="1px"
          borderColor="border.subtle"
          px={{ base: '4', lg: '6' }}
          py="3"
        >
          <Box minW="0" flex="1">
            {browserHeader.workspaceHeader.left}
          </Box>
          <HStack gap="3" flexShrink={0}>
            {browserHeader.workspaceHeader.meta}
            {browserHeader.workspaceHeader.actions}
          </HStack>
        </Flex>
      ) : null}
      {activeIsLoading ? (
        <Box borderBottomWidth="1px" borderColor="border.subtle" px="6" py="4">
          <Text fontSize="sm" color="fg.muted">
            Loading folder...
          </Text>
        </Box>
      ) : null}
      {activeIsError ? (
        <Box borderBottomWidth="1px" borderColor="border.subtle" px="6" py="4">
          <Text fontSize="sm" color="fg.error">
            Unable to load this folder.
          </Text>
        </Box>
      ) : null}

      {!activeIsLoading && emptyState ? (
        <Flex flex="1" minH="0" direction="column" align="center" justify="center" gap="3" color="fg.muted">
          <Folder size={28} />
          <Text fontWeight="medium" color="fg">This folder is empty</Text>
          <Text fontSize="sm">Create a folder or upload documents here.</Text>
          <HStack gap="2">
            <Button type="button" variant="outline" onClick={() => openCreateFolderDialog(currentFolderId)}>
              <FolderPlus size={16} />
              New folder
            </Button>
          </HStack>
        </Flex>
      ) : null}

      {!activeIsLoading && !activeIsError && !emptyState ? (
        browserView === 'list' ? (
          <BrowserItemList
            items={browserItems}
            vaultId={vaultId}
            selectedItemKeys={selectedItemKeys}
            draggedItemKeys={draggedItemKeys}
            dropTarget={dropTarget}
            onOpenItem={openItem}
            onSelectItem={selectBrowserItem}
            getItemActions={getItemActions}
            onDragStartItem={handleItemDragStart}
            onDragEndItem={handleItemDragEnd}
            onDragOverFolder={handleDragOverFolder}
            onDragLeaveFolder={handleDragLeaveFolder}
            onDropOnFolder={handleDropOnFolder}
            onOpenContextMenu={openContextMenu}
            isMutating={itemMutationPending}
          />
        ) : (
          <BrowserItemGrid
            items={browserItems}
            vaultId={vaultId}
            selectedItemKeys={selectedItemKeys}
            draggedItemKeys={draggedItemKeys}
            dropTarget={dropTarget}
            onOpenItem={openItem}
            onSelectItem={selectBrowserItem}
            getItemActions={getItemActions}
            onDragStartItem={handleItemDragStart}
            onDragEndItem={handleItemDragEnd}
            onDragOverFolder={handleDragOverFolder}
            onDragLeaveFolder={handleDragLeaveFolder}
            onDropOnFolder={handleDropOnFolder}
            onOpenContextMenu={openContextMenu}
            isMutating={itemMutationPending}
          />
        )
      ) : null}

      <ChakraDialog.Root
        open={isCreateFolderOpen}
        onOpenChange={(event) => {
          setIsCreateFolderOpen(event.open);
          if (!event.open) {
            setFolderName('');
            setCreateFolderParentId(null);
          }
        }}
        size={{ mdDown: 'full', md: 'md' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <form onSubmit={handleCreateFolderSubmit}>
                <ChakraDialog.Header>
                  <ChakraDialog.Title>New folder</ChakraDialog.Title>
                  <ChakraDialog.CloseTrigger asChild>
                    <CloseButton size="sm" />
                  </ChakraDialog.CloseTrigger>
                </ChakraDialog.Header>
                <ChakraDialog.Body>
                  <Stack gap="2">
                    <chakra.label htmlFor="folder-name" fontSize="sm" fontWeight="medium" color="fg">
                      Name
                    </chakra.label>
                    <Input
                      id="folder-name"
                      value={folderName}
                      onChange={(event) => setFolderName(event.target.value)}
                      autoFocus
                    />
                  </Stack>
                </ChakraDialog.Body>
                <ChakraDialog.Footer>
                  <ChakraDialog.ActionTrigger asChild>
                    <Button type="button" variant="outline" disabled={createFolderMutation.isPending}>
                      Cancel
                    </Button>
                  </ChakraDialog.ActionTrigger>
                  <Button type="submit" disabled={folderName.trim().length === 0 || createFolderMutation.isPending}>
                    {createFolderMutation.isPending ? 'Creating...' : 'Create folder'}
                  </Button>
                </ChakraDialog.Footer>
              </form>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

      <RenameItemDialog
        target={renameTarget}
        value={renameValue}
        isPending={renameMutation.isPending}
        onValueChange={setRenameValue}
        onClose={() => {
          setRenameTarget(null);
          setRenameValue('');
        }}
        onSubmit={handleRenameSubmit}
      />

      <MoveItemDialog
        target={moveTarget}
        value={moveDestinationId}
        destinations={moveDestinations}
        isPending={moveMutation.isPending}
        isLoading={folderTreeQuery.isLoading}
        onValueChange={setMoveDestinationId}
        onClose={() => {
          setMoveTarget(null);
          setMoveDestinationId(null);
        }}
        onSubmit={handleMoveSubmit}
      />

      <ItemInfoDialog
        target={infoTarget}
        folderPath={infoFolderPath}
        onClose={() => setInfoTarget(null)}
      />

      {contextMenu !== null ? (
        <BrowserContextMenu
          state={contextMenu}
          actions={getItemActions(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </Flex>
  );
}
