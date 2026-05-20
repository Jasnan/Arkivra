import type { ChangeEvent, FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActionBar, Box, CloseButton, Dialog as ChakraDialog, EmptyState, Flex, Grid, HStack, Portal, Skeleton, Stack, Text, chakra } from '@chakra-ui/react';
import { Download, Eye, FileUp, Folder, FolderOpen, FolderPlus, FolderUp, History, Home, Info, MessageSquare, MoveRight, Pencil, Settings, Tags, Trash2, Users } from 'lucide-react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/action-buttons';
import type { SecondaryNavIcon } from '@/components/layout/secondary-nav-link';
import { useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { ROUTES } from '@/app/routes';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSortMenu } from '@/features/documents/components/file-sort-menu';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { useBrowserDragDrop } from '@/features/documents/hooks/use-browser-drag-drop';
import { useBrowserSelection } from '@/features/documents/hooks/use-browser-selection';
import { useFileBrowserMutations } from '@/features/documents/hooks/use-file-browser-mutations';
import { useFolderNavigation } from '@/features/documents/hooks/use-folder-navigation';
import { useVaultBrowserHeader } from '@/features/documents/hooks/use-vault-browser-header';
import { filesToDroppedFiles } from '@/features/uploads/dropped-files';
import { filterAllowedUploadFiles } from '@/features/uploads/upload-file-rules';
import { uploadManager } from '@/features/uploads/upload-manager';
import {
  BrowserContextMenu,
  BrowserItemGrid,
  BrowserItemList,
  ItemInfoDialog,
  MoveItemDialog,
  RenameItemDialog,
} from '@/features/file-browser/components/vault-browser-components';
import { usePreferredFileBrowserView } from '@/features/file-browser/components/use-preferred-file-browser-view';
import {
  FILE_BROWSER_SORT_STORAGE_KEY,
  getBrowserItemKey,
  getInitialBrowserSort,
  getItemName,
  getMoveDestinations,
} from '@/features/file-browser/components/vault-browser.types';
import type {
  BrowserAction,
  BrowserContextItem,
  BrowserItem,
  ContextMenuState,
  FileBrowserSort,
  InfoDialogTarget,
  ItemDialogTarget,
} from '@/features/file-browser/components/vault-browser.types';
import { fileBrowserQueryKeys, useFolderItemsQuery, useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { VaultMembersPanel } from '@/features/vaults/components/vault-members-panel';
import { VaultSettingsPanel } from '@/features/vaults/components/vault-settings-panel';
import { joinVaultAsAdmin } from '@/features/vaults/vaults.api';
import { useVaultQuery, vaultQueryKeys } from '@/features/vaults/vaults.queries';
import type { AiAccessLevel, VaultDetail, VaultRole } from '@/features/vaults/vaults.types';

type VaultPageTab = 'contents' | 'members' | 'activity' | 'settings';
type VaultAdminPageTab = VaultPageTab;

function canMutateVaultDocuments(vault: VaultDetail | null | undefined) {
  return Boolean(vault?.role === 'owner' || vault?.role === 'editor');
}

function canReadVault(vault: VaultDetail | null | undefined) {
  return Boolean(vault?.role === 'owner' || vault?.role === 'editor' || vault?.role === 'viewer');
}

const adminJoinRoleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const adminJoinAiAccessOptions: Array<{ value: AiAccessLevel; label: string }> = [
  { value: 'none', label: 'No AI access' },
  { value: 'document_chat', label: 'Document chat' },
  { value: 'full', label: 'Full AI access' },
];

const vaultAdminTabs = ['contents', 'members', 'activity', 'settings'] satisfies VaultAdminPageTab[];

const vaultPageTabs = [
  { value: 'contents', label: 'Contents', description: 'Documents & folders', icon: FolderOpen, route: 'root' },
  { value: 'members', label: 'Members', description: 'Access & permissions', icon: Users, route: 'root' },
  { value: 'activity', label: 'Activity', description: 'Vault events & history', icon: History, route: 'root' },
  { value: 'settings', label: 'Settings', description: 'Vault configuration', icon: Settings, route: 'settings' },
] satisfies Array<{ value: VaultPageTab; label: string; description: string; icon: SecondaryNavIcon; route: 'root' | 'settings' }>;
const placeholderSkeletonKeys = ['summary', 'primary', 'secondary', 'tertiary', 'quaternary', 'final'];

const vaultTabTriggerStyles = {
  h: '11',
  roundedTop: 'md',
  roundedBottom: '0',
  borderBottomWidth: '2px',
  borderColor: 'transparent',
  px: '3',
  pb: '3',
  pt: '2',
  color: 'fg.muted',
  _hover: { bg: 'teal.subtle', color: 'fg' },
  _selected: {
    bg: 'teal.subtle',
    borderColor: 'teal.solid',
    color: 'teal.fg',
    shadow: 'none',
  },
} as const;

function VaultPlaceholderTab() {
  return (
    <Flex
      aria-label="Loading tab preview"
      flex="1"
      minH="0"
      direction="column"
      gap="5"
      px={{ base: '4', lg: '6' }}
      pt="0"
      pb="6"
    >
      <HStack gap="3">
        <Skeleton boxSize="10" rounded="lg" />
        <Stack gap="2" flex="1" maxW="28rem">
          <Skeleton h="4" w="64%" />
          <Skeleton h="3" w="42%" />
        </Stack>
      </HStack>
      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }}>
        {placeholderSkeletonKeys.map((key) => (
          <Stack key={key} gap="3" rounded="lg" borderWidth="1px" borderColor="border.surface" p="4">
            <Skeleton h="4" w="45%" />
            <Skeleton h="3" w="100%" />
            <Skeleton h="3" w="86%" />
            <Skeleton h="3" w="58%" />
          </Stack>
        ))}
      </Grid>
    </Flex>
  );
}

function VaultPageTabs({
  activeTab,
  browserSort,
  onSortChange,
}: {
  activeTab: VaultPageTab;
  browserSort: FileBrowserSort;
  onSortChange: (value: FileBrowserSort) => void;
}) {
  return (
    <Box
      borderColor="border.surface"
      bg="bg.workspace"
      px={{ base: '4', lg: '6' }}
      pt="2.5"
      overflowX="auto"
    >
      <Flex align="center" justify="space-between" gap="3" overflowX="auto">
        <TabsList gap="2" rounded="0" bg="transparent" p="0">
          {vaultPageTabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              aria-current={activeTab === tab.value ? 'page' : undefined}
              {...vaultTabTriggerStyles}
            >
              <tab.icon size={16} aria-hidden="true" />
              {tab.label}
            </TabsTrigger>
          ))}
          <TabsTrigger
            value="chat"
            aria-label="Chat"
            {...vaultTabTriggerStyles}
          >
            <MessageSquare size={16} aria-hidden="true" />
            Chat
          </TabsTrigger>
        </TabsList>
        <Box flexShrink={0} w={{ base: '10', sm: '10rem' }} maxW="10rem" transform="translateY(-3px)">
          <FileSortMenu value={browserSort} onValueChange={onSortChange} />
        </Box>
      </Flex>
    </Box>
  );
}

function getBrowserItemUpdatedTime(item: BrowserItem) {
  const value = item.type === 'folder' ? item.folder.updatedAt : item.document.updatedAt;
  return new Date(value).getTime();
}

function getBrowserItemSize(item: BrowserItem) {
  return item.type === 'folder' ? 0 : item.document.originalSize;
}

function getCommonBrowserItemParentId(items: BrowserItem[]) {
  if (items.length === 0) {
    return null;
  }

  const [firstItem] = items;
  const firstParentId = firstItem.type === 'folder' ? firstItem.folder.parentId : firstItem.document.folderId;

  return items.every((item) => {
    const parentId = item.type === 'folder' ? item.folder.parentId : item.document.folderId;
    return parentId === firstParentId;
  })
    ? firstParentId
    : undefined;
}

function getDeleteConfirmTitle(items: BrowserItem[]) {
  if (items.length === 1) {
    return `Move "${getItemName(items[0]!)}" to trash?`;
  }

  return `Move ${items.length} items to trash?`;
}

function getDeleteConfirmDescription(items: BrowserItem[]) {
  const hasFolder = items.some(item => item.type === 'folder');

  if (items.length === 1) {
    return hasFolder
      ? 'This folder and its contents will be moved to Trash.'
      : 'This document will be moved to Trash.';
  }

  return hasFolder
    ? 'The selected folders, their contents, and selected documents will be moved to Trash.'
    : 'The selected documents will be moved to Trash.';
}

function DeleteItemsConfirmDialog({
  items,
  isPending,
  onClose,
  onConfirm,
}: {
  items: BrowserItem[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ChakraDialog.Root
      open={items.length > 0}
      onOpenChange={(event) => {
        if (!event.open && !isPending) {
          onClose();
        }
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{getDeleteConfirmTitle(items)}</ChakraDialog.Title>
              <CloseButton size="sm" disabled={isPending} onClick={onClose} />
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Stack gap="4">
                <Text color="fg.muted" fontSize="sm">
                  {getDeleteConfirmDescription(items)}
                </Text>
                <Stack
                  as="ul"
                  gap="2"
                  m="0"
                  maxH="56"
                  overflowY="auto"
                  rounded="md"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.subtle"
                  p="3"
                  ps="6"
                >
                  {items.map(item => (
                    <Text
                      as="li"
                      key={getBrowserItemKey(item)}
                      fontSize="sm"
                      color="fg"
                      overflowWrap="anywhere"
                    >
                      {getItemName(item)}
                    </Text>
                  ))}
                </Stack>
              </Stack>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
                Cancel
              </Button>
              <DeleteButton type="button" disabled={isPending} onClick={onConfirm}>
                {isPending ? 'Moving...' : 'Move to trash'}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
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
  const navigate = useNavigate();
  const vaultId = params.vaultId ?? '';
  const currentFolderId = search.folderId ?? null;
  const currentVaultTab = vaultAdminTabs.includes(search.tab as VaultAdminPageTab)
    ? search.tab as VaultAdminPageTab
    : 'contents';
  const queryClient = useQueryClient();
  const [browserView, setBrowserView] = usePreferredFileBrowserView();
  const [browserSort, setBrowserSort] = useState<FileBrowserSort>(getInitialBrowserSort);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<ItemDialogTarget>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTargets, setMoveTargets] = useState<BrowserItem[]>([]);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null);
  const [infoTarget, setInfoTarget] = useState<InfoDialogTarget>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pendingTrashItems, setPendingTrashItems] = useState<BrowserItem[]>([]);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [joinRole, setJoinRole] = useState<VaultRole>('owner');
  const [joinAiAccessLevel, setJoinAiAccessLevel] = useState<AiAccessLevel>('full');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetFolderIdRef = useRef<string | null>(currentFolderId);

  const vaultQuery = useVaultQuery({ vaultId });
  const isRestrictedAdminOverview = vaultQuery.data?.vault.accessMode === 'admin';
  const folderItemsQuery = useFolderItemsQuery({
    vaultId,
    folderId: currentFolderId,
    enabled: !isRestrictedAdminOverview && vaultQuery.isSuccess,
  });
  const folderTreeQuery = useFolderTreeQuery({
    vaultId,
    enabled: !isRestrictedAdminOverview && vaultQuery.isSuccess,
  });

  const browserItems = useMemo<BrowserItem[]>(
    () => [...(folderItemsQuery.data?.items ?? [])].sort((left, right) => compareBrowserItems(left, right, browserSort)),
    [browserSort, folderItemsQuery.data?.items],
  );
  const activeIsLoading = folderItemsQuery.isLoading;
  const activeIsError = folderItemsQuery.isError;
  const emptyState =
    !activeIsLoading &&
    !activeIsError &&
    browserItems.length === 0;
  const canUpdateItems = canMutateVaultDocuments(vaultQuery.data?.vault);
  const canDeleteItems = canMutateVaultDocuments(vaultQuery.data?.vault);
  const canDownloadItems = canReadVault(vaultQuery.data?.vault);
  const canManageTags = canMutateVaultDocuments(vaultQuery.data?.vault);
  const canCreateItems = canMutateVaultDocuments(vaultQuery.data?.vault);
  const {
    selectedItemKeys,
    selectedItems,
    selectedCount,
    clearSelection,
    selectSingleItem,
    toggleBrowserItem,
    toggleAllBrowserItems,
    selectBrowserItem,
  } = useBrowserSelection({
    currentFolderId,
    browserItems,
    onBeforeSelect: () => setContextMenu(null),
  });
  const contextItemKey =
    contextMenu?.item.type === 'folder' || contextMenu?.item.type === 'document'
      ? getBrowserItemKey(contextMenu.item)
      : null;
  const {
    deleteItemsMutation,
    createFolderMutation,
    renameMutation,
    moveMutation,
    moveItemsMutation,
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
      setMoveTargets([]);
      setMoveDestinationId(null);
    },
  });

  const joinVaultMutation = useMutation({
    mutationFn: joinVaultAsAdmin,
    onSuccess: async () => {
      toast.success('You joined this vault.');
      setIsJoinDialogOpen(false);
      setJoinRole('owner');
      setJoinAiAccessLevel('full');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.detail(vaultId) }),
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() }),
        queryClient.invalidateQueries({ queryKey: vaultQueryKeys.members(vaultId) }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.folderItems(vaultId, currentFolderId) }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.folderTree(vaultId) }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not join vault.');
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
    openItem,
  } = useFolderNavigation({
    vaultId,
    onBeforeFolderNavigate: () => {
      clearSelection();
      resetDragState();
    },
  });
  const moveDestinations = useMemo(
    () => getMoveDestinations({ folders: folderTreeQuery.data?.folders ?? [], target: moveTargets }),
    [folderTreeQuery.data?.folders, moveTargets],
  );
  const allItemsSelected = browserItems.length > 0 && selectedCount === browserItems.length;
  const someItemsSelected = selectedCount > 0 && !allItemsSelected;
  const infoFolderPath = useMemo(() => {
    if (infoTarget === null) {
      return 'Vault root';
    }

    if (infoTarget.type === 'root') {
      return 'Vault root';
    }

    if (infoTarget.type === 'background') {
      return infoTarget.folderId === null
        ? 'Vault root'
        : folderTreeQuery.data?.folders.find(folder => folder.id === infoTarget.folderId)?.path ?? 'Folder';
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
      window.localStorage?.setItem?.(FILE_BROWSER_SORT_STORAGE_KEY, browserSort);
    } catch {
    }
  }, [browserSort]);

  useEffect(() => {
    directoryInputRef.current?.setAttribute('webkitdirectory', '');
    directoryInputRef.current?.setAttribute('directory', '');
  }, []);

  function uploadSelectedFiles(fileList: FileList | null) {
    const files = filterAllowedUploadFiles(filesToDroppedFiles(Array.from(fileList ?? [])));
    if (files.length === 0 || !canCreateItems) {
      return;
    }

    uploadManager.addFiles({ vaultId, folderId: uploadTargetFolderIdRef.current, files });
  }

  function handleUploadInputChange(event: ChangeEvent<HTMLInputElement>) {
    uploadSelectedFiles(event.target.files);
    event.target.value = '';
  }

  function openUploadFilesPicker(folderId = currentFolderId) {
    uploadTargetFolderIdRef.current = folderId;
    fileInputRef.current?.click();
  }

  function openUploadDirectoryPicker(folderId = currentFolderId) {
    uploadTargetFolderIdRef.current = folderId;
    directoryInputRef.current?.click();
  }

  function openCreateFolderDialog(parentId: string | null) {
    setContextMenu(null);
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
    setMoveTargets([item]);
    setMoveDestinationId(item.type === 'folder' ? item.folder.parentId : item.document.folderId);
  }

  function openSelectedItemsMoveDialog() {
    if (selectedItems.length === 0) {
      return;
    }

    setContextMenu(null);
    setMoveTargets(selectedItems);
    setMoveDestinationId(getCommonBrowserItemParentId(selectedItems) ?? null);
  }

  function openInfoDialog(item: BrowserContextItem) {
    setContextMenu(null);
    setInfoTarget(item);
  }

  function openDeleteConfirm(items: BrowserItem[]) {
    if (items.length === 0) {
      return;
    }

    setContextMenu(null);
    setPendingTrashItems(items);
  }

  function confirmPendingDelete() {
    if (pendingTrashItems.length === 0) {
      return;
    }

    deleteItemsMutation.mutate(pendingTrashItems, {
      onSuccess: () => setPendingTrashItems([]),
    });
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, item: BrowserContextItem) {
    const actions = getItemActions(item).filter(action => !action.disabled);

    if (actions.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
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
          key: 'upload-files',
          label: 'Upload files',
          icon: FileUp,
          disabled: !canCreateItems,
          onSelect: () => openUploadFilesPicker(null),
        },
        {
          key: 'upload-directory',
          label: 'Upload folder',
          icon: FolderUp,
          disabled: !canCreateItems,
          onSelect: () => openUploadDirectoryPicker(null),
        },
        { key: 'info', label: 'Info', icon: Info, onSelect: () => openInfoDialog(item) },
      ];
    }

    if (item.type === 'background') {
      return [
        { key: 'new-folder', label: 'New folder', icon: FolderPlus, disabled: !canCreateItems, onSelect: () => openCreateFolderDialog(currentFolderId) },
        {
          key: 'upload-directory',
          label: 'Upload folder',
          icon: FolderUp,
          disabled: !canCreateItems,
          onSelect: () => openUploadDirectoryPicker(currentFolderId),
        },
        {
          key: 'upload-files',
          label: 'Upload files',
          icon: FileUp,
          disabled: !canCreateItems,
          onSelect: () => openUploadFilesPicker(currentFolderId),
        },
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
          disabled: !canDeleteItems || deleteItemsMutation.isPending,
          onSelect: () => openDeleteConfirm([item]),
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
        disabled: !canDeleteItems || deleteItemsMutation.isPending,
        onSelect: () => openDeleteConfirm([item]),
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

    if (moveTargets.length === 0) {
      return;
    }

    const currentDestinationId = getCommonBrowserItemParentId(moveTargets);
    if (currentDestinationId !== undefined && moveDestinationId === currentDestinationId) {
      return;
    }

    if (moveTargets.length === 1) {
      moveMutation.mutate({ target: moveTargets[0]!, destinationId: moveDestinationId });
      return;
    }

    moveItemsMutation.mutate({ targets: moveTargets, destinationId: moveDestinationId });
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
    vaultName: vaultQuery.data?.vault.name ?? 'Vault',
    currentFolderId,
    breadcrumbs: folderItemsQuery.data?.breadcrumbs ?? [],
    selectedCount,
    browserView,
    setBrowserView,
    dropTarget,
    onClearSelection: clearSelection,
    onNavigateFolder: navigateToFolder,
    onOpenRootContextMenu: event => openContextMenu(event, { type: 'root', vaultId }),
    onOpenCreateFolderDialog: openCreateFolderDialog,
    onOpenUploadFiles: () => openUploadFilesPicker(currentFolderId),
    onOpenUploadDirectory: () => openUploadDirectoryPicker(currentFolderId),
    onDragOverFolder: handleDragOverFolder,
    onDragLeaveFolder: handleDragLeaveFolder,
    onDropOnFolder: handleDropOnFolder,
  });
  useWorkspaceSecondary(null);

  if (!vaultId) {
    return <Text fontSize="sm" color="fg.error">Invalid vault id.</Text>;
  }

  if (vaultQuery.isLoading) {
    return (
      <Flex as="section" h="full" minH="0" direction="column" align="center" justify="center" color="fg.muted">
        <Text fontSize="sm">Loading vault...</Text>
      </Flex>
    );
  }

  if (vaultQuery.isError || !vaultQuery.data) {
    return (
      <Flex as="section" h="full" minH="0" direction="column" align="center" justify="center" color="fg.error">
        <Text fontSize="sm">Unable to load vault.</Text>
      </Flex>
    );
  }

  if (isRestrictedAdminOverview) {
    const vault = vaultQuery.data.vault;

    return (
      <Flex as="section" h="full" minH="0" direction="column" overflow="hidden">
        <Flex
          align="center"
          justify="space-between"
          gap="4"
          borderBottomWidth="1px"
          borderColor="border.surface"
          px={{ base: '4', lg: '6' }}
          py="4"
        >
          <Box minW="0">
            <Text fontSize="xl" fontWeight="semibold" color="fg" truncate>
              {vault.name}
            </Text>
            <Text mt="1" fontSize="sm" color="fg.muted">
              Participation status: No participation
            </Text>
          </Box>
          <Button type="button" onClick={() => setIsJoinDialogOpen(true)}>
            Join vault
          </Button>
        </Flex>

        <Flex flex="1" minH="0" align="center" justify="center" px="6">
          <Stack maxW="32rem" gap="4" textAlign="center">
            <Folder size={32} style={{ alignSelf: 'center' }} />
            <Text fontSize="2xl" fontWeight="bold" color="fg">
              Become a vault member to access documents
            </Text>
            <Text fontSize="sm" lineHeight="6" color="fg.muted">
              Admin accounts can see that this vault exists and inspect basic metadata, but document access requires visible vault membership.
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {vault.description ?? 'No description set.'}
            </Text>
            <HStack justify="center">
              <Button type="button" onClick={() => setIsJoinDialogOpen(true)}>
                Join vault
              </Button>
            </HStack>
          </Stack>
        </Flex>

        <ChakraDialog.Root
          open={isJoinDialogOpen}
          onOpenChange={(event) => {
            if (!event.open && !joinVaultMutation.isPending) {
              setIsJoinDialogOpen(false);
            }
          }}
          size={{ mdDown: 'full', md: 'lg' }}
        >
          <Portal>
            <ChakraDialog.Backdrop />
            <ChakraDialog.Positioner>
              <ChakraDialog.Content>
                <chakra.form
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    joinVaultMutation.mutate({
                      vaultId,
                      role: joinRole,
                      aiAccessLevel: joinAiAccessLevel,
                    });
                  }}
                >
                  <ChakraDialog.Header>
                    <ChakraDialog.Title>Join vault</ChakraDialog.Title>
                    <ChakraDialog.CloseTrigger asChild>
                      <CloseButton size="sm" />
                    </ChakraDialog.CloseTrigger>
                  </ChakraDialog.Header>
                  <ChakraDialog.Body>
                    <Stack gap="4">
                      <Text fontSize="sm" lineHeight="6" color="fg.muted">
                        You are about to become an explicit participant of this vault. This enables collaborative actions and AI participation under your account.
                      </Text>
                      <Grid gap="3" templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}>
                        <Field>
                          <FieldLabel>Vault role</FieldLabel>
                          <Select value={joinRole} onValueChange={(value) => setJoinRole(value as VaultRole)} disabled={joinVaultMutation.isPending}>
                            <SelectTrigger aria-label="Vault role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {adminJoinRoleOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel>AI access</FieldLabel>
                          <Select value={joinAiAccessLevel} onValueChange={(value) => setJoinAiAccessLevel(value as AiAccessLevel)} disabled={joinVaultMutation.isPending}>
                            <SelectTrigger aria-label="AI access">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {adminJoinAiAccessOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </Grid>
                    </Stack>
                  </ChakraDialog.Body>
                  <ChakraDialog.Footer>
                    <ChakraDialog.ActionTrigger asChild>
                      <Button type="button" variant="outline" disabled={joinVaultMutation.isPending} onClick={() => setIsJoinDialogOpen(false)}>
                        Cancel
                      </Button>
                    </ChakraDialog.ActionTrigger>
                    <Button type="submit" disabled={joinVaultMutation.isPending}>
                      {joinVaultMutation.isPending ? 'Joining...' : 'Join vault'}
                    </Button>
                  </ChakraDialog.Footer>
                </chakra.form>
              </ChakraDialog.Content>
            </ChakraDialog.Positioner>
          </Portal>
        </ChakraDialog.Root>
      </Flex>
    );
  }

  const backgroundContextItem: BrowserContextItem = {
    type: 'background',
    vaultId,
    folderId: currentFolderId,
    name: currentFolderId === null ? 'Vault root' : folderItemsQuery.data?.folder?.name ?? 'Folder',
  };
  return (
    <Flex as="section" h="full" minH="0" direction="column" overflow="hidden">
      {!browserHeader.isInWorkspaceShell ? (
        <Flex
          align="center"
          gap="4"
          borderBottomWidth="1px"
          borderColor="border.surface"
          px={{ base: '4', lg: '6' }}
          py="3"
        >
          <Box minW="0" flex="1">
            {browserHeader.workspaceHeader.left}
          </Box>
        </Flex>
      ) : null}
      <Tabs
        defaultValue="contents"
        value={currentVaultTab}
        onValueChange={(value) => {
          if (value === 'chat') {
            void navigate({ to: ROUTES.chat, search: { vaultId } as any });
            return;
          }

          const tab = value as VaultPageTab;

          void navigate({
            to: ROUTES.vaultRoot(vaultId),
            search: tab === 'contents' ? undefined : { tab },
          });
        }}
        display="flex"
        flex="1"
        minH="0"
        flexDirection="column"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={handleUploadInputChange}
        />
        <input
          ref={directoryInputRef}
          type="file"
          multiple
          hidden
          onChange={handleUploadInputChange}
        />

        {browserHeader.contentsToolbar}
        <VaultPageTabs
          activeTab={currentVaultTab}
          browserSort={browserSort}
          onSortChange={setBrowserSort}
        />

        <TabsContent value="contents" display="flex" flex="1" minH="0" flexDirection="column" p="0">
          <Flex flex="1" minH="0" overflow="hidden">
            <Flex minW="0" flex="1" direction="column" overflow="hidden">
              {activeIsLoading ? (
                <Box borderBottomWidth="1px" borderColor="border.surface" px="6" py="4">
                  <Text fontSize="sm" color="fg.muted">
                    Loading folder...
                  </Text>
                </Box>
              ) : null}
              {activeIsError ? (
                <Box borderBottomWidth="1px" borderColor="border.surface" px="6" py="4">
                  <Text fontSize="sm" color="fg.error">
                    Unable to load this folder.
                  </Text>
                </Box>
              ) : null}

              {!activeIsLoading && emptyState ? (
                <EmptyState.Root
                  flex="1"
                  minH="0"
                  onContextMenu={(event) => openContextMenu(event, backgroundContextItem)}
                >
                  <EmptyState.Content>
                    <EmptyState.Indicator>
                      <Folder size={28} />
                    </EmptyState.Indicator>
                    <EmptyState.Title>
                      {currentFolderId === null ? 'This vault is empty' : 'This folder is empty'}
                    </EmptyState.Title>
                    <EmptyState.Description>
                      Create a folder or upload documents here.
                    </EmptyState.Description>
                  <HStack gap="2">
                    <Button type="button" variant="outline" onClick={() => openCreateFolderDialog(currentFolderId)}>
                      <FolderPlus size={16} />
                      New folder
                    </Button>
                  </HStack>
                  </EmptyState.Content>
                </EmptyState.Root>
              ) : null}

              {!activeIsLoading && !activeIsError && !emptyState ? (
                browserView === 'list' ? (
                  <BrowserItemList
                    items={browserItems}
                    vaultId={vaultId}
                    selectedItemKeys={selectedItemKeys}
                    selectable
                    allItemsSelected={allItemsSelected}
                    someItemsSelected={someItemsSelected}
                    contextItemKey={contextItemKey}
                    draggedItemKeys={draggedItemKeys}
                    dropTarget={dropTarget}
                    onOpenItem={openItem}
                    onSelectItem={selectBrowserItem}
                    onToggleAllItems={toggleAllBrowserItems}
                    onToggleItem={toggleBrowserItem}
                    getItemActions={getItemActions}
                    onDragStartItem={handleItemDragStart}
                    onDragEndItem={handleItemDragEnd}
                    onDragOverFolder={handleDragOverFolder}
                    onDragLeaveFolder={handleDragLeaveFolder}
                    onDropOnFolder={handleDropOnFolder}
                    onOpenContextMenu={openContextMenu}
                    onOpenBackgroundContextMenu={(event) => openContextMenu(event, backgroundContextItem)}
                    isMutating={itemMutationPending}
                  />
                ) : (
                  <BrowserItemGrid
                    items={browserItems}
                    vaultId={vaultId}
                    selectedItemKeys={selectedItemKeys}
                    selectable
                    contextItemKey={contextItemKey}
                    draggedItemKeys={draggedItemKeys}
                    dropTarget={dropTarget}
                    onOpenItem={openItem}
                    onSelectItem={selectBrowserItem}
                    onToggleItem={toggleBrowserItem}
                    getItemActions={getItemActions}
                    onDragStartItem={handleItemDragStart}
                    onDragEndItem={handleItemDragEnd}
                    onDragOverFolder={handleDragOverFolder}
                    onDragLeaveFolder={handleDragLeaveFolder}
                    onDropOnFolder={handleDropOnFolder}
                    onOpenContextMenu={openContextMenu}
                    onOpenBackgroundContextMenu={(event) => openContextMenu(event, backgroundContextItem)}
                    isMutating={itemMutationPending}
                  />
                )
              ) : null}
            </Flex>
          </Flex>
        </TabsContent>
        <TabsContent value="members" display="flex" flex="1" minH="0" flexDirection="column" overflowY="auto" p="0">
          <Box px={{ base: '4', lg: '6' }} py="5">
            <VaultMembersPanel vault={vaultQuery.data.vault} vaultId={vaultId} />
          </Box>
        </TabsContent>
        <TabsContent value="activity" display="flex" flex="1" minH="0" flexDirection="column" p="0">
          <VaultPlaceholderTab />
        </TabsContent>
        <TabsContent value="settings" display="flex" flex="1" minH="0" flexDirection="column" overflowY="auto" p="0">
          <Box px={{ base: '4', lg: '6' }} py="5">
            <VaultSettingsPanel vaultId={vaultId} />
          </Box>
        </TabsContent>
      </Tabs>

      <ActionBar.Root open={selectedCount > 0}>
        <Portal>
          <ActionBar.Positioner>
            <ActionBar.Content>
              <ActionBar.SelectionTrigger>
                {selectedCount} selected
              </ActionBar.SelectionTrigger>
              <ActionBar.Separator />
              <Button
                size="sm"
                variant="outline"
                disabled={!canUpdateItems || itemMutationPending}
                onClick={openSelectedItemsMoveDialog}
              >
                <MoveRight size={16} />
                Move to
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorPalette="red"
                disabled={!canDeleteItems || itemMutationPending}
                onClick={() => openDeleteConfirm(selectedItems)}
              >
                <Trash2 size={16} />
                Delete
              </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>

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
        open={renameTarget !== null}
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
        open={moveTargets.length > 0}
        target={moveTargets}
        value={moveDestinationId}
        destinations={moveDestinations}
        isPending={moveMutation.isPending || moveItemsMutation.isPending}
        isLoading={folderTreeQuery.isLoading}
        onValueChange={setMoveDestinationId}
        onClose={() => {
          setMoveTargets([]);
          setMoveDestinationId(null);
        }}
        onSubmit={handleMoveSubmit}
      />

      <ItemInfoDialog
        open={infoTarget !== null}
        target={infoTarget}
        folderPath={infoFolderPath}
        onClose={() => setInfoTarget(null)}
      />

      <DeleteItemsConfirmDialog
        items={pendingTrashItems}
        isPending={deleteItemsMutation.isPending}
        onClose={() => setPendingTrashItems([])}
        onConfirm={confirmPendingDelete}
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
