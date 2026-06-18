import type { ChangeEvent, FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { toast } from '@/components/ui/toaster-store';
import { ROUTES } from '@/app/routes';
import { validateVaultWorkspaceSearch } from '@/app/search-params';
import { useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { adminQueryKeys } from '@/features/admin/admin.queries';
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
import { usePreferredFileBrowserView } from '@/features/file-browser/components/use-preferred-file-browser-view';
import {
  FILE_BROWSER_SORT_STORAGE_KEY,
  getBrowserItemKey,
  getInitialBrowserSort,
  getItemName,
  getMoveDestinations,
} from '@/features/file-browser/components/vault-browser.types';
import type {
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
import { deleteDocumentVersion, restoreDocumentVersion } from '@/features/documents/documents.api';
import type { DocumentVersionSummary } from '@/features/documents/documents.types';
import { useMeQuery } from '@/features/me/me.queries';
import { joinVaultAsAdmin } from '@/features/vaults/vaults.api';
import {
  canMutateVaultDocuments,
  canReadVault,
} from '@/features/vaults/vault-permissions';
import { useVaultQuery, vaultQueryKeys } from '@/features/vaults/vaults.queries';
import type { AiAccessLevel, VaultRole } from '@/features/vaults/vaults.types';

import { VaultManagementTabs, getVaultManagementRoute } from './documents-page-vault-management';
import type { VaultManagementSection, VaultSection } from './documents-page-vault-management';
import { getDocumentsPageContextMenuEntries } from './documents-page-actions';
import {
  DocumentsBrowserContent,
  RestrictedAdminVaultOverview,
} from './documents-page-content';
import { DocumentsPageOverlays } from './documents-page-overlays';
import {
  compareBrowserItems,
  getCommonBrowserItemParentId,
  isBrowserAction,
} from './documents-page-browser-helpers';

const DIRECTORY_PICKER_ATTRIBUTES = {
  directory: '',
  webkitdirectory: '',
};

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

  function getContextMenuEntries(item: BrowserContextItem): BrowserContextMenuEntry[] {
    return getDocumentsPageContextMenuEntries(item, {
      aiFeaturesEnabled,
      canCreateItems,
      canDeleteItems,
      canDownloadItems,
      canManageTags,
      canUpdateItems,
      currentFolderId,
      isDeletePending: deleteItemsMutation.isPending,
      vault: vaultQuery.data?.vault,
      downloadDocument: (documentId) => downloadDocuments([{ vaultId, documentId }]),
      navigateToDocument,
      onOpenActivity: () => navigate({ to: ROUTES.vaultActivity(vaultId) }),
      onOpenChat: () => navigate({ to: ROUTES.vaultChat(vaultId) }),
      onOpenCreateFolderDialog: openCreateFolderDialog,
      onOpenDeleteConfirm: openDeleteConfirm,
      onOpenInfoDialog: openInfoDialog,
      onOpenItem: openItem,
      onOpenMembers: () => navigate({ to: ROUTES.vaultMembers(vaultId) }),
      onOpenMoveDialog: openMoveDialog,
      onOpenRenameDialog: openRenameDialog,
      onOpenSettings: () => navigate({ to: ROUTES.vaultSettings(vaultId) }),
      onOpenUploadDirectoryPicker: openUploadDirectoryPicker,
      onOpenUploadFilesPicker: openUploadFilesPicker,
      onOpenVersionsDialog: openVersionsDialog,
    });
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
      <RestrictedAdminVaultOverview
        vault={vault}
        open={isJoinDialogOpen}
        canDismiss={canDismissJoinVaultDialog}
        role={joinRole}
        aiAccessLevel={joinAiAccessLevel}
        isPending={joinVaultMutation.isPending}
        onAiAccessLevelChange={setJoinAiAccessLevel}
        onJoinClick={() => setIsJoinDialogOpen(true)}
        onOpenChange={setIsJoinDialogOpen}
        onRoleChange={setJoinRole}
        onSubmit={(role, aiAccessLevel) =>
          joinVaultMutation.mutate({
            vaultId,
            role,
            aiAccessLevel,
          })
        }
      />
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
        <DocumentsBrowserContent
          activeIsError={activeIsError}
          activeIsLoading={activeIsLoading}
          allItemsSelected={allItemsSelected}
          backgroundContextItem={backgroundContextItem}
          browserItems={browserItems}
          browserView={browserView}
          contextItemKey={contextItemKey}
          currentFolderId={currentFolderId}
          draggedItemKeys={draggedItemKeys}
          dropTarget={dropTarget}
          emptyState={emptyState}
          itemMutationPending={itemMutationPending}
          selectedItemKeys={selectedItemKeys}
          someItemsSelected={someItemsSelected}
          vaultId={vaultId}
          getItemActions={(item) => getContextMenuEntries(item).filter(isBrowserAction)}
          onCreateFolder={openCreateFolderDialog}
          onDragEndItem={handleItemDragEnd}
          onDragLeaveFolder={handleDragLeaveFolder}
          onDragOverFolder={handleDragOverFolder}
          onDragStartItem={handleItemDragStart}
          onDropOnFolder={handleDropOnFolder}
          onOpenContextMenu={openContextMenu}
          onOpenItem={openItem}
          onSelectItem={selectBrowserItem}
          onToggleAllItems={toggleAllBrowserItems}
          onToggleItem={toggleBrowserItem}
        />
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

      <DocumentsPageOverlays
        canDeleteItems={canDeleteItems}
        canDismissCreateFolderDialog={canDismissCreateFolderDialog}
        canUpdateItems={canUpdateItems}
        contextMenu={contextMenu}
        createFolderIsPending={createFolderMutation.isPending}
        deleteItemsIsPending={deleteItemsMutation.isPending}
        deleteVersionIsPending={deleteVersionMutation.isPending}
        documentId={versionsDocumentId}
        folderName={folderName}
        folderPath={infoFolderPath}
        folderTreeIsLoading={folderTreeQuery.isLoading}
        infoTarget={infoTarget}
        isCreateFolderOpen={isCreateFolderOpen}
        itemMutationPending={itemMutationPending}
        moveDestinationId={moveDestinationId}
        moveDestinations={moveDestinations}
        moveIsPending={moveMutation.isPending || moveItemsMutation.isPending}
        moveTargets={moveTargets}
        pendingTrashItems={pendingTrashItems}
        renameIsPending={renameMutation.isPending}
        renameTarget={renameTarget}
        renameValue={renameValue}
        restoreVersionIsPending={restoreVersionMutation.isPending}
        selectedCount={selectedCount}
        selectedItems={selectedItems}
        selectedVersionId={selectedVersionId}
        vaultId={vaultId}
        versions={documentVersionsQuery.data?.versions ?? []}
        versionsIsError={documentVersionsQuery.isError}
        versionsIsLoading={documentVersionsQuery.isLoading}
        versionsTarget={versionsTarget}
        getContextMenuEntries={getContextMenuEntries}
        onCloseContextMenu={() => setContextMenu(null)}
        onCloseInfo={() => setInfoTarget(null)}
        onConfirmPendingDelete={confirmPendingDelete}
        onCreateFolderOpenChange={(open) => {
          setIsCreateFolderOpen(open);
          if (!open) {
            setFolderName('');
            setCreateFolderParentId(null);
          }
        }}
        onCreateFolderSubmit={handleCreateFolderSubmit}
        onDeleteVersion={async (version: DocumentVersionSummary) => {
          await deleteVersionMutation.mutateAsync({
            vaultId,
            documentId: versionsDocumentId,
            versionId: version.id,
          });
        }}
        onFolderNameChange={setFolderName}
        onMoveClose={() => {
          setMoveTargets([]);
          setMoveDestinationId(null);
        }}
        onMoveDestinationChange={setMoveDestinationId}
        onMoveSubmit={handleMoveSubmit}
        onOpenDeleteConfirm={openDeleteConfirm}
        onOpenSelectedItemsMoveDialog={openSelectedItemsMoveDialog}
        onPendingTrashItemsChange={setPendingTrashItems}
        onRenameClose={() => {
          setRenameTarget(null);
          setRenameValue('');
        }}
        onRenameSubmit={handleRenameSubmit}
        onRenameValueChange={setRenameValue}
        onRestoreVersion={async (version: DocumentVersionSummary) => {
          await restoreVersionMutation.mutateAsync({
            vaultId,
            documentId: versionsDocumentId,
            versionId: version.id,
          });
        }}
        onSelectedVersionChange={setSelectedVersionId}
        onVersionsOpenChange={(open) => {
          if (!open) {
            setVersionsTarget(null);
            setSelectedVersionId(null);
          }
        }}
      />
    </Flex>
  );
}
