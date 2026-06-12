import type { ChangeEvent, FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ActionBar,
  Box,
  CloseButton,
  Dialog as ChakraDialog,
  Flex,
  Grid,
  HStack,
  Portal,
  Stack,
  Tabs as ChakraTabs,
  Text,
  chakra,
} from '@chakra-ui/react';
import {
  Download,
  Eye,
  FileUp,
  Folder,
  FolderPlus,
  FolderUp,
  History,
  Home,
  Info,
  MessageSquare,
  MoveRight,
  Pencil,
  Settings2,
  Tags,
  Trash2,
  Users,
} from 'lucide-react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { toast } from '@/components/ui/toaster-store';
import { ROUTES } from '@/app/routes';
import { validateVaultWorkspaceSearch } from '@/app/search-params';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/action-buttons';
import { useDialogPageLockCleanup } from '@/components/ui/dialog-page-locks';
import { useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { adminQueryKeys } from '@/features/admin/admin.queries';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  documentQueryKeys,
  useDocumentVersionsQuery,
} from '@/features/documents/documents.queries';
import { useBrowserDragDrop } from '@/features/documents/hooks/use-browser-drag-drop';
import { useBrowserSelection } from '@/features/documents/hooks/use-browser-selection';
import { useFileBrowserMutations } from '@/features/documents/hooks/use-file-browser-mutations';
import { useFolderNavigation } from '@/features/documents/hooks/use-folder-navigation';
import { useVaultBrowserHeader } from '@/features/documents/hooks/use-vault-browser-header';
import { filesToDroppedFiles } from '@/features/uploads/dropped-files';
import {
  filterAllowedUploadFiles,
  UPLOAD_ACCEPT_ATTRIBUTE,
} from '@/features/uploads/upload-file-rules';
import { uploadManager } from '@/features/uploads/upload-manager';
import {
  BrowserContextMenu,
  BrowserCurrentFolderDropZone,
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
  BrowserContextMenuEntry,
  BrowserContextItem,
  BrowserItem,
  ContextMenuState,
  FileBrowserSort,
  InfoDialogTarget,
  ItemDialogTarget,
} from '@/features/file-browser/components/vault-browser.types';
import {
  fileBrowserQueryKeys,
  useFolderItemsQuery,
  useFolderTreeQuery,
} from '@/features/file-browser/file-browser.queries';
import { DocumentVersionsDialog } from '@/features/documents/components/detail/document-versions-dialog';
import { deleteDocumentVersion, restoreDocumentVersion } from '@/features/documents/documents.api';
import type { DocumentVersionSummary } from '@/features/documents/documents.types';
import { VaultMembersPanel } from '@/features/vaults/components/vault-members-panel';
import { VaultSettingsPanel } from '@/features/vaults/components/vault-settings-panel';
import { VaultActivityPanel } from '@/features/audit/components/vault-activity-panel';
import { useMeQuery } from '@/features/me/me.queries';
import { joinVaultAsAdmin } from '@/features/vaults/vaults.api';
import {
  canManageVaultWorkspace,
  canMutateVaultDocuments,
  canReadVault,
  canUseVaultChat,
} from '@/features/vaults/vault-permissions';
import { useVaultQuery, vaultQueryKeys } from '@/features/vaults/vaults.queries';
import type { AiAccessLevel, VaultDetail, VaultRole } from '@/features/vaults/vaults.types';

export type VaultSection = 'contents' | 'members' | 'activity' | 'settings';
type VaultManagementSection = Exclude<VaultSection, 'contents'>;

const DIRECTORY_PICKER_ATTRIBUTES = {
  directory: '',
  webkitdirectory: '',
};

const vaultManagementTabs: Array<{
  value: VaultManagementSection;
  label: string;
  icon: typeof Users | typeof Settings2 | typeof History;
}> = [
  { value: 'members', label: 'Members', icon: Users },
  { value: 'settings', label: 'Settings', icon: Settings2 },
  { value: 'activity', label: 'Activity', icon: History },
];

function canViewVaultManagementSection(vault: VaultDetail, section: VaultManagementSection) {
  return section === 'activity' || canManageVaultWorkspace(vault);
}

function getVaultManagementRoute(vaultId: string, section: VaultManagementSection) {
  if (section === 'members') return ROUTES.vaultMembers(vaultId);
  if (section === 'activity') return ROUTES.vaultActivity(vaultId);
  return ROUTES.vaultSettings(vaultId);
}

function VaultManagementTabs({
  vault,
  vaultId,
  section,
  onSectionChange,
}: {
  vault: VaultDetail;
  vaultId: string;
  section: VaultManagementSection;
  onSectionChange: (section: VaultManagementSection) => void;
}) {
  const visibleTabs = vaultManagementTabs.filter((tab) =>
    canViewVaultManagementSection(vault, tab.value),
  );
  const canViewSection = canViewVaultManagementSection(vault, section);

  return (
    <ChakraTabs.Root
      value={section}
      onValueChange={(event) => {
        if (
          (event.value === 'members' || event.value === 'settings' || event.value === 'activity') &&
          canViewVaultManagementSection(vault, event.value)
        ) {
          onSectionChange(event.value);
        }
      }}
      lazyMount
      unmountOnExit
      display="flex"
      flexDirection="column"
      flex="1"
      minH="0"
      gap="0"
    >
      <ChakraTabs.List
        w="full"
        flexShrink={0}
        borderBottomWidth="1px"
        borderColor="border.surface"
        gap="8"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <ChakraTabs.Trigger
              key={tab.value}
              value={tab.value}
              position="relative"
              gap="2"
              borderBottomWidth="2px"
              borderColor="transparent"
              rounded="0"
              px="0"
              py="3"
              fontSize="sm"
              fontWeight="semibold"
              color="fg.muted"
              _selected={{ color: 'teal.fg', borderColor: 'teal.solid' }}
            >
              <Icon size={15} />
              {tab.label}
            </ChakraTabs.Trigger>
          );
        })}
      </ChakraTabs.List>

      {canViewSection ? (
        <>
          {canViewVaultManagementSection(vault, 'members') ? (
            <ChakraTabs.Content value="members" flex="1" minH="0" pt="8">
              <VaultMembersPanel vault={vault} vaultId={vaultId} />
            </ChakraTabs.Content>
          ) : null}

          {canViewVaultManagementSection(vault, 'settings') ? (
            <ChakraTabs.Content value="settings" flex="1" minH="0" pt="8">
              <VaultSettingsPanel vaultId={vaultId} />
            </ChakraTabs.Content>
          ) : null}

          <ChakraTabs.Content value="activity" flex="1" minH="0" pt="8">
            <VaultActivityPanel vaultId={vaultId} />
          </ChakraTabs.Content>
        </>
      ) : (
        <Box pt="8">
          <CenteredEmptyState
            title="Vault management is restricted"
            description="Only vault owners and admins can view members and settings."
          />
        </Box>
      )}
    </ChakraTabs.Root>
  );
}

function isBrowserAction(entry: BrowserContextMenuEntry): entry is BrowserAction {
  return !('type' in entry);
}

const adminJoinRoleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const adminJoinAiAccessOptions: Array<{ value: AiAccessLevel; label: string }> = [
  { value: 'none', label: 'Disabled' },
  { value: 'full', label: 'Enabled' },
];

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
  const firstParentId =
    firstItem.type === 'folder' ? firstItem.folder.parentId : firstItem.document.folderId;

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
  const hasFolder = items.some((item) => item.type === 'folder');

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
  useDialogPageLockCleanup(items.length > 0);

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
                  {items.map((item) => (
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
                {isPending ? 'Moving...' : 'Trash'}
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
    return (
      getBrowserItemUpdatedTime(right) - getBrowserItemUpdatedTime(left) ||
      getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' })
    );
  }

  if (sortBy === 'updated_asc') {
    return (
      getBrowserItemUpdatedTime(left) - getBrowserItemUpdatedTime(right) ||
      getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' })
    );
  }

  if (sortBy === 'size_desc') {
    return (
      getBrowserItemSize(right) - getBrowserItemSize(left) ||
      getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' })
    );
  }

  if (sortBy === 'size_asc') {
    return (
      getBrowserItemSize(left) - getBrowserItemSize(right) ||
      getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' })
    );
  }

  if (sortBy === 'name_desc') {
    return getItemName(right).localeCompare(getItemName(left), undefined, { sensitivity: 'base' });
  }

  return getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' });
}

export function DocumentsPage({ section = 'contents' }: { section?: VaultSection }) {
  const params = useParams({ strict: false }) as { vaultId?: string };
  const search = validateVaultWorkspaceSearch(useSearch({ strict: false }));
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const vaultId = params.vaultId ?? '';
  const isContentsSection = section === 'contents';
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled !== false;
  const currentFolderId = search.folderId ?? null;
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
  const [versionsTarget, setVersionsTarget] = useState<Extract<
    BrowserItem,
    { type: 'document' }
  > | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
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
    enabled: isContentsSection && !isRestrictedAdminOverview && vaultQuery.isSuccess,
  });
  const folderTreeQuery = useFolderTreeQuery({
    vaultId,
    enabled: isContentsSection && !isRestrictedAdminOverview && vaultQuery.isSuccess,
  });
  const versionsDocumentId = versionsTarget?.document.id ?? '';
  const documentVersionsQuery = useDocumentVersionsQuery({
    vaultId,
    documentId: versionsDocumentId,
    enabled: versionsTarget !== null,
  });

  const browserItems = useMemo<BrowserItem[]>(
    () =>
      [...(folderItemsQuery.data?.items ?? [])].sort((left, right) =>
        compareBrowserItems(left, right, browserSort),
      ),
    [browserSort, folderItemsQuery.data?.items],
  );
  const activeIsLoading = folderItemsQuery.isLoading;
  const activeIsError = folderItemsQuery.isError;
  const emptyState = !activeIsLoading && !activeIsError && browserItems.length === 0;
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
        queryClient.invalidateQueries({
          queryKey: fileBrowserQueryKeys.folderItems(vaultId, currentFolderId),
        }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.folderTree(vaultId) }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not join vault.');
    },
  });
  const restoreVersionMutation = useMutation({
    mutationFn: restoreDocumentVersion,
    onSuccess: async () => {
      toast.success('Version restored as latest.');
      setSelectedVersionId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiStatus() }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore version.');
    },
  });
  const deleteVersionMutation = useMutation({
    mutationFn: deleteDocumentVersion,
    onSuccess: async (_result, variables) => {
      toast.success('Version deleted.');
      if (selectedVersionId === variables.versionId) {
        setSelectedVersionId(null);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiStatus() }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete version.');
    },
  });
  const isJoinVaultFormDirty = joinRole !== 'owner' || joinAiAccessLevel !== 'full';
  const canDismissJoinVaultDialog = !isJoinVaultFormDirty && !joinVaultMutation.isPending;
  const isCreateFolderFormDirty = folderName.trim().length > 0;
  const canDismissCreateFolderDialog = !isCreateFolderFormDirty && !createFolderMutation.isPending;
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
  const { navigateToFolder, navigateToDocument, openItem } = useFolderNavigation({
    vaultId,
    onBeforeFolderNavigate: () => {
      clearSelection();
      resetDragState();
    },
  });
  const moveDestinations = useMemo(
    () =>
      getMoveDestinations({ folders: folderTreeQuery.data?.folders ?? [], target: moveTargets }),
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
        : (folderTreeQuery.data?.folders.find((folder) => folder.id === infoTarget.folderId)
            ?.path ?? 'Folder');
    }

    if (infoTarget.type === 'document') {
      if (infoTarget.document.folderId === null) {
        return 'Vault root';
      }

      return (
        folderTreeQuery.data?.folders.find((folder) => folder.id === infoTarget.document.folderId)
          ?.path ?? 'Folder'
      );
    }

    return (
      folderTreeQuery.data?.folders.find((folder) => folder.id === infoTarget.folder.id)?.path ??
      'Folder'
    );
  }, [folderTreeQuery.data?.folders, infoTarget]);

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string }>).detail;

      if (!detail?.vaultId || detail.vaultId !== vaultId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiStatus() }),
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
    } catch {}
  }, [browserSort]);

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

  function openVersionsDialog(item: Extract<BrowserItem, { type: 'document' }>) {
    setContextMenu(null);
    setVersionsTarget(item);
    setSelectedVersionId(null);
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
    const actions = getContextMenuEntries(item)
      .filter(isBrowserAction)
      .filter((action) => !action.disabled);

    if (actions.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      item,
      x: event.clientX,
      y: event.clientY,
    });
  }

  function getBackgroundContextMenuEntries(): BrowserContextMenuEntry[] {
    const vault = vaultQuery.data?.vault;
    const entries: BrowserContextMenuEntry[] = [
      { key: 'vault-name', type: 'header', label: vault?.name ?? 'Vault' },
      { key: 'after-vault-name', type: 'separator' },
    ];
    const uploadEntries: BrowserContextMenuEntry[] = canCreateItems
      ? [
          {
            key: 'new-folder',
            label: 'New folder',
            icon: FolderPlus,
            onSelect: () => openCreateFolderDialog(currentFolderId),
          },
          { key: 'after-new-folder', type: 'separator' } satisfies BrowserContextMenuEntry,
          {
            key: 'upload-files',
            label: 'Upload files',
            icon: FileUp,
            onSelect: () => openUploadFilesPicker(currentFolderId),
          },
          {
            key: 'upload-directory',
            label: 'Upload folder',
            icon: FolderUp,
            onSelect: () => openUploadDirectoryPicker(currentFolderId),
          },
        ]
      : [];
    const adminSectionEntries: BrowserAction[] = canManageVaultWorkspace(vault)
      ? [
          {
            key: 'members',
            label: 'Members',
            icon: Users,
            onSelect: () => navigate({ to: ROUTES.vaultMembers(vaultId) }),
          },
          {
            key: 'settings',
            label: 'Settings',
            icon: Settings2,
            onSelect: () => navigate({ to: ROUTES.vaultSettings(vaultId) }),
          },
          {
            key: 'activity',
            label: 'Activity',
            icon: History,
            onSelect: () => navigate({ to: ROUTES.vaultActivity(vaultId) }),
          },
        ]
      : [];
    const chatEntry: BrowserAction[] =
      aiFeaturesEnabled && canUseVaultChat(vault)
        ? [
            {
              key: 'chat',
              label: 'Chat',
              icon: MessageSquare,
              onSelect: () => navigate({ to: ROUTES.vaultChat(vaultId) }),
            },
          ]
        : [];
    const workspaceEntries = [...adminSectionEntries, ...chatEntry];

    entries.push(...uploadEntries);

    if (workspaceEntries.length > 0) {
      if (uploadEntries.length > 0) {
        entries.push({ key: 'after-upload', type: 'separator' });
      }
      entries.push(...workspaceEntries);
    }

    return entries;
  }

  function getContextMenuEntries(item: BrowserContextItem): BrowserContextMenuEntry[] {
    if (item.type === 'background') {
      return getBackgroundContextMenuEntries();
    }

    return getItemActions(item);
  }

  function getItemActions(item: BrowserContextItem): BrowserAction[] {
    if (item.type === 'root') {
      return [
        {
          key: 'open',
          label: 'Open root',
          icon: Home,
          disabled: currentFolderId === null,
          onSelect: () => openItem(item),
        },
        {
          key: 'new-folder',
          label: 'New folder',
          icon: FolderPlus,
          disabled: !canCreateItems,
          onSelect: () => openCreateFolderDialog(null),
        },
        {
          key: 'upload-files',
          label: 'Upload',
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
        {
          key: 'new-folder',
          label: 'New folder',
          icon: FolderPlus,
          disabled: !canCreateItems,
          onSelect: () => openCreateFolderDialog(currentFolderId),
        },
        {
          key: 'upload-files',
          label: 'Upload files',
          icon: FileUp,
          disabled: !canCreateItems,
          onSelect: () => openUploadFilesPicker(currentFolderId),
        },
        {
          key: 'upload-directory',
          label: 'Upload folder',
          icon: FolderUp,
          disabled: !canCreateItems,
          onSelect: () => openUploadDirectoryPicker(currentFolderId),
        },
      ];
    }

    if (item.type === 'folder') {
      return [
        { key: 'open', label: 'Open', icon: Folder, onSelect: () => openItem(item) },
        {
          key: 'rename',
          label: 'Rename',
          icon: Pencil,
          disabled: !canUpdateItems,
          onSelect: () => openRenameDialog(item),
        },
        {
          key: 'move',
          label: 'Move to',
          icon: MoveRight,
          disabled: !canUpdateItems,
          onSelect: () => openMoveDialog(item),
        },
        { key: 'info', label: 'Info', icon: Info, onSelect: () => openInfoDialog(item) },
        {
          key: 'trash',
          label: 'Trash',
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
      {
        key: 'versions',
        label: 'Versions',
        icon: History,
        onSelect: () => openVersionsDialog(item),
      },
      {
        key: 'rename',
        label: 'Rename',
        icon: Pencil,
        disabled: !canUpdateItems,
        onSelect: () => openRenameDialog(item),
      },
      {
        key: 'move',
        label: 'Move to',
        icon: MoveRight,
        disabled: !canUpdateItems,
        onSelect: () => openMoveDialog(item),
      },
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
        label: 'Trash',
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
    showBrowserActions: isContentsSection,
    browserSort: isContentsSection ? browserSort : undefined,
    onBrowserSortChange: isContentsSection ? setBrowserSort : undefined,
    browserView,
    setBrowserView,
    dropTarget,
    onClearSelection: clearSelection,
    onNavigateFolder: navigateToFolder,
    onOpenRootContextMenu: (event) => openContextMenu(event, { type: 'root', vaultId }),
    onOpenUploadFiles: () => openUploadFilesPicker(currentFolderId),
    onOpenUploadDirectory: () => openUploadDirectoryPicker(currentFolderId),
    onDragOverFolder: handleDragOverFolder,
    onDragLeaveFolder: handleDragLeaveFolder,
    onDropOnFolder: handleDropOnFolder,
  });
  useWorkspaceSecondary(null);

  if (!vaultId) {
    return (
      <Text fontSize="sm" color="fg.error">
        Invalid vault id.
      </Text>
    );
  }

  if (vaultQuery.isLoading) {
    return (
      <Flex
        as="section"
        h="full"
        minH="0"
        direction="column"
        align="center"
        justify="center"
        color="fg.muted"
      >
        <Text fontSize="sm">Loading vault...</Text>
      </Flex>
    );
  }

  if (vaultQuery.isError || !vaultQuery.data) {
    return (
      <Flex
        as="section"
        h="full"
        minH="0"
        direction="column"
        align="center"
        justify="center"
        color="fg.error"
      >
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
            Join
          </Button>
        </Flex>

        <Flex flex="1" minH="0" align="center" justify="center" px="6">
          <Stack maxW="32rem" gap="4" textAlign="center" align="center">
            <Folder size={32} style={{ alignSelf: 'center' }} />
            <Text fontSize="2xl" fontWeight="bold" lineHeight="1.25" color="fg">
              Become a vault member to access documents
            </Text>
            <Text fontSize="sm" lineHeight="1.55" color="fg.muted">
              Admin accounts can see that this vault exists and inspect basic metadata, but document
              access requires visible vault membership.
            </Text>
            <Text fontSize="sm" lineHeight="1.55" color="fg.muted">
              {vault.description ?? 'No description set.'}
            </Text>
            <HStack justify="center">
              <Button type="button" onClick={() => setIsJoinDialogOpen(true)}>
                Join
              </Button>
            </HStack>
          </Stack>
        </Flex>

        <ChakraDialog.Root
          open={isJoinDialogOpen}
          closeOnEscape={canDismissJoinVaultDialog}
          closeOnInteractOutside={canDismissJoinVaultDialog}
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
                        You are about to become an explicit participant of this vault. This enables
                        collaborative actions and AI participation under your account.
                      </Text>
                      <Grid
                        gap="3"
                        templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
                      >
                        <Field>
                          <FieldLabel>Vault role</FieldLabel>
                          <Select
                            value={joinRole}
                            onValueChange={(value) => setJoinRole(value as VaultRole)}
                            disabled={joinVaultMutation.isPending}
                          >
                            <SelectTrigger aria-label="Vault role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {adminJoinRoleOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field>
                          <FieldLabel>AI access</FieldLabel>
                          <Select
                            value={joinAiAccessLevel}
                            onValueChange={(value) => setJoinAiAccessLevel(value as AiAccessLevel)}
                            disabled={joinVaultMutation.isPending}
                          >
                            <SelectTrigger aria-label="AI access">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {adminJoinAiAccessOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </Grid>
                    </Stack>
                  </ChakraDialog.Body>
                  <ChakraDialog.Footer>
                    <ChakraDialog.ActionTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={joinVaultMutation.isPending}
                        onClick={() => setIsJoinDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                    </ChakraDialog.ActionTrigger>
                    <Button type="submit" disabled={joinVaultMutation.isPending}>
                      {joinVaultMutation.isPending ? 'Joining...' : 'Join'}
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
    name:
      currentFolderId === null ? 'Vault root' : (folderItemsQuery.data?.folder?.name ?? 'Folder'),
  };
  const managementSection: VaultManagementSection | null = isContentsSection ? null : section;

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
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
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
        {...DIRECTORY_PICKER_ATTRIBUTES}
      />

      {browserHeader.contentsToolbar}

      {section === 'contents' ? (
        <>
          <Flex flex="1" minH="0" overflow="hidden">
            <BrowserCurrentFolderDropZone
              folderId={currentFolderId}
              dropTarget={dropTarget}
              onDragOverFolder={handleDragOverFolder}
              onDragLeaveFolder={handleDragLeaveFolder}
              onDropOnFolder={handleDropOnFolder}
            >
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
                <CenteredEmptyState
                  title={currentFolderId === null ? 'This vault is empty' : 'This folder is empty'}
                  description="Create a folder or upload documents here."
                  icon={<Folder size={28} />}
                  action={
                    <HStack gap="2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openCreateFolderDialog(currentFolderId)}
                      >
                        <FolderPlus size={16} />
                        New folder
                      </Button>
                    </HStack>
                  }
                  containerProps={{
                    flex: '1',
                    minH: '0',
                    onContextMenu: (event) => openContextMenu(event, backgroundContextItem),
                  }}
                />
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
                    onOpenBackgroundContextMenu={(event) =>
                      openContextMenu(event, backgroundContextItem)
                    }
                    hideActionsUntilHover
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
                    onOpenBackgroundContextMenu={(event) =>
                      openContextMenu(event, backgroundContextItem)
                    }
                    isMutating={itemMutationPending}
                  />
                )
              ) : null}
            </BrowserCurrentFolderDropZone>
          </Flex>
        </>
      ) : null}

      {managementSection ? (
        <Flex flex="1" minH="0" direction="column" overflowY="auto">
          <Box px={{ base: '4', lg: '6' }} py="5">
            <VaultManagementTabs
              vault={vaultQuery.data.vault}
              vaultId={vaultId}
              section={managementSection}
              onSectionChange={(nextSection) => {
                if (nextSection !== managementSection) {
                  navigate({ to: getVaultManagementRoute(vaultId, nextSection) });
                }
              }}
            />
          </Box>
        </Flex>
      ) : null}

      <ActionBar.Root open={selectedCount > 0}>
        <Portal>
          <ActionBar.Positioner>
            <ActionBar.Content>
              <ActionBar.SelectionTrigger>{selectedCount} selected</ActionBar.SelectionTrigger>
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
        closeOnEscape={canDismissCreateFolderDialog}
        closeOnInteractOutside={canDismissCreateFolderDialog}
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
                    <chakra.label
                      htmlFor="folder-name"
                      fontSize="sm"
                      fontWeight="medium"
                      color="fg"
                    >
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
                    <Button
                      type="button"
                      variant="outline"
                      disabled={createFolderMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </ChakraDialog.ActionTrigger>
                  <Button
                    type="submit"
                    disabled={folderName.trim().length === 0 || createFolderMutation.isPending}
                  >
                    {createFolderMutation.isPending ? 'Creating...' : 'Create'}
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

      <DocumentVersionsDialog
        open={versionsTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVersionsTarget(null);
            setSelectedVersionId(null);
          }
        }}
        vaultId={vaultId}
        documentId={versionsDocumentId}
        versions={documentVersionsQuery.data?.versions ?? []}
        isLoading={documentVersionsQuery.isLoading}
        isError={documentVersionsQuery.isError}
        selectedVersionId={selectedVersionId}
        isRestorePending={restoreVersionMutation.isPending}
        isDeletePending={deleteVersionMutation.isPending}
        onSelectVersion={setSelectedVersionId}
        onRestoreVersion={async (version: DocumentVersionSummary) => {
          await restoreVersionMutation.mutateAsync({
            vaultId,
            documentId: versionsDocumentId,
            versionId: version.id,
          });
        }}
        onDeleteVersion={async (version: DocumentVersionSummary) => {
          await deleteVersionMutation.mutateAsync({
            vaultId,
            documentId: versionsDocumentId,
            versionId: version.id,
          });
        }}
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
          actions={getContextMenuEntries(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </Flex>
  );
}
