import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CloseButton, Dialog as ChakraDialog, Flex, HStack, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { Download, Eye, Folder, FolderPlus, Grid3X3, Home, Info, List, MoveRight, Pencil, Tags, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import {
  EmptyState,
  PageIntro,
  SurfacePanel,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDocumentDownloadUrl, moveDocument, renameDocument, softDeleteDocument } from '@/features/documents/documents.api';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import type { DocumentSummary } from '@/features/documents/documents.types';
import {
  BrowserContextMenu,
  BrowserItemGrid,
  BrowserItemList,
  FolderBreadcrumbs,
  ItemInfoDialog,
  MoveItemDialog,
  RenameItemDialog,
} from '@/features/file-browser/components/vault-browser-components';
import {
  FILE_BROWSER_SORT_STORAGE_KEY,
  FILE_BROWSER_VIEW_STORAGE_KEY,
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
import { createFolder, moveFolder, renameFolder, softDeleteFolder } from '@/features/file-browser/file-browser.api';
import { fileBrowserQueryKeys, useFolderItemsQuery, useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import type { FolderSummary } from '@/features/file-browser/file-browser.types';
import { searchQueryKeys } from '@/features/search/search.queries';
import { useVaultQuery } from '@/features/vaults/vaults.queries';
import type { VaultMemberPermission } from '@/features/vaults/vaults.types';

const browserSortOptions: Array<{ value: FileBrowserSort; label: string }> = [
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'updated_asc', label: 'Oldest updated' },
  { value: 'size_desc', label: 'Largest first' },
  { value: 'size_asc', label: 'Smallest first' },
];

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
  const navigate = useNavigate();
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
    enabled: moveTarget !== null || infoTarget?.type === 'folder' || (infoTarget?.type === 'document' && infoTarget.document.folderId !== null),
  });
  const vaultQuery = useVaultQuery({ vaultId });

  const deleteMutation = useMutation({
    mutationFn: async (documents: Array<{ vaultId: string; documentId: string }>) =>
      Promise.all(documents.map((document) => softDeleteDocument(document))),
    onSuccess: async (_data, documents) => {
      toast.success(
        documents.length === 1
          ? 'Document moved to trash.'
          : `${documents.length} documents moved to trash.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });
  const createFolderMutation = useMutation({
    mutationFn: () => createFolder({
      vaultId,
      parentId: createFolderParentId,
      name: folderName,
    }),
    onSuccess: async () => {
      toast.success('Folder created.');
      setFolderName('');
      setCreateFolderParentId(null);
      setIsCreateFolderOpen(false);
      await queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create folder.');
    },
  });
  const renameMutation = useMutation({
    mutationFn: async ({ target, name }: { target: BrowserItem; name: string }) => {
      if (target.type === 'folder') {
        return renameFolder({ vaultId, folderId: target.folder.id, name });
      }

      return renameDocument({ vaultId, documentId: target.document.id, name });
    },
    onSuccess: async (_data, variables) => {
      toast.success(`${variables.target.type === 'folder' ? 'Folder' : 'Document'} renamed.`);
      setRenameTarget(null);
      setRenameValue('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename item.');
    },
  });
  const moveMutation = useMutation({
    mutationFn: async ({ target, destinationId }: { target: BrowserItem; destinationId: string | null }) => {
      if (target.type === 'folder') {
        return moveFolder({ vaultId, folderId: target.folder.id, parentId: destinationId });
      }

      return moveDocument({ vaultId, documentId: target.document.id, folderId: destinationId });
    },
    onSuccess: async (_data, variables) => {
      toast.success(`${variables.target.type === 'folder' ? 'Folder' : 'Document'} moved.`);
      setMoveTarget(null);
      setMoveDestinationId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not move item.');
    },
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (folder: FolderSummary) => softDeleteFolder({ vaultId, folderId: folder.id }),
    onSuccess: async () => {
      toast.success('Folder moved to trash.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete folder.');
    },
  });

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
  const itemMutationPending = deleteMutation.isPending
    || deleteFolderMutation.isPending
    || renameMutation.isPending
    || moveMutation.isPending;
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

  if (!vaultId) {
    return <Text fontSize="sm" color="fg.error">Invalid vault id.</Text>;
  }

  function downloadDocuments(documents: Array<{ vaultId: string; documentId: string }>) {
    for (const document of documents) {
      const link = window.document.createElement('a');
      link.href = getDocumentDownloadUrl(document);
      link.download = '';
      link.rel = 'noopener';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  function navigateToFolder(folderId: string | null) {
    void navigate({
      to: ROUTES.vaultRoot(vaultId),
      search: folderId === null ? {} : { folderId },
      replace: false,
    } as any);
  }

  function deleteDocument(document: DocumentSummary) {
    deleteMutation.mutate([{ vaultId, documentId: document.id }]);
  }

  function openCreateFolderDialog(parentId: string | null) {
    setCreateFolderParentId(parentId);
    setIsCreateFolderOpen(true);
  }

  function openItem(item: BrowserContextItem) {
    if (item.type === 'root') {
      navigateToFolder(null);
      return;
    }

    if (item.type === 'folder') {
      navigateToFolder(item.folder.id);
      return;
    }

    void navigate({ to: ROUTES.vaultDocument(vaultId, item.document.id) } as any);
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
          onSelect: () => void navigate({ to: ROUTES.transfersWithLock(vaultId, null) } as any),
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
        onSelect: () => void navigate({ to: ROUTES.vaultDocument(vaultId, item.document.id) } as any),
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

    moveMutation.mutate({ target: moveTarget, destinationId: moveDestinationId });
  }

  function handleCreateFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (folderName.trim().length === 0) {
      return;
    }

    createFolderMutation.mutate();
  }

  return (
    <Flex as="section" direction="column" gap="6" pb="8">
      <PageIntro
        title="Documents"
        actions={
          <HStack flexWrap="wrap" gap="3">
            <Link to={ROUTES.vaultTrash(vaultId)} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4, fontSize: '0.875rem', fontWeight: 500 }}>
              Deleted documents
            </Link>
            <Link to={ROUTES.vaultTags(vaultId)} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4, fontSize: '0.875rem', fontWeight: 500 }}>
              Tags
            </Link>
            <Button type="button" variant="outline" onClick={() => openCreateFolderDialog(currentFolderId)}>
              <FolderPlus size={16} />
              New folder
            </Button>
            <Link to={ROUTES.transfersWithLock(vaultId, currentFolderId)} style={{ textDecoration: 'none' }}>
              <Flex
                display="inline-flex"
                h="11"
                align="center"
                justify="center"
                gap="2"
                rounded="xl"
                bg="teal.solid"
                px="5"
                fontSize="sm"
                fontWeight="semibold"
                color="fg.inverted"
              >
                <Upload size={16} />
                Upload
              </Flex>
            </Link>
          </HStack>
        }
      />

      <SurfacePanel display="flex" flexDirection={{ base: 'column', lg: 'row' }} alignItems={{ lg: 'center' }} justifyContent="space-between" gap="3">
        <Stack gap="2" minW="0">
          <FolderBreadcrumbs
            currentFolderId={currentFolderId}
            breadcrumbs={folderItemsQuery.data?.breadcrumbs ?? []}
            onNavigateFolder={navigateToFolder}
            onOpenRootContextMenu={(event) => openContextMenu(event, { type: 'root', vaultId })}
          />
          <Text fontSize="sm" color="fg.muted">
            {activeResultCount} item{activeResultCount === 1 ? '' : 's'}
          </Text>
        </Stack>
        <Flex align="center" gap="2" wrap="wrap">
          <Flex
            align="center"
            gap="2"
            rounded="lg"
            borderWidth="1px"
            borderColor="border.subtle"
            bg="bg.surface"
            px="3"
            py="1.5"
          >
            <Text as="span" id="vault-browser-sort" fontSize="sm" fontWeight="semibold" color="fg.muted">
              Sort
            </Text>
            <Select value={browserSort} onValueChange={(value) => setBrowserSort(value as FileBrowserSort)}>
              <SelectTrigger
                aria-label="Sort folder items"
                aria-labelledby="vault-browser-sort"
                h="9"
                minW="40"
                border="0"
                bg="transparent"
                px="0"
                shadow="none"
                focusRing="none"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {browserSortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Flex>
          <Button
            type="button"
            size="sm"
            variant={browserView === 'list' ? 'solid' : 'outline'}
            aria-label="List view"
            onClick={() => setBrowserView('list')}
          >
            <List size={16} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={browserView === 'grid' ? 'solid' : 'outline'}
            aria-label="Grid view"
            onClick={() => setBrowserView('grid')}
          >
            <Grid3X3 size={16} />
          </Button>
        </Flex>
      </SurfacePanel>

      {activeIsLoading ? (
        <SurfacePanel>
          <Text fontSize="sm" color="fg.muted">
            Loading folder...
          </Text>
        </SurfacePanel>
      ) : null}
      {activeIsError ? (
        <SurfacePanel>
          <Text fontSize="sm" color="fg.error">
            Unable to load this folder.
          </Text>
        </SurfacePanel>
      ) : null}

      {!activeIsLoading && emptyState ? (
        <EmptyState
          icon={<Folder size={24} />}
          title="This folder is empty"
          description="Create a folder or upload documents here."
          action={(
            <Button type="button" variant="outline" onClick={() => openCreateFolderDialog(currentFolderId)}>
              <FolderPlus size={16} />
              New folder
            </Button>
          )}
        />
      ) : null}

      {!activeIsLoading && !activeIsError && !emptyState ? (
        browserView === 'list' ? (
          <BrowserItemList
            items={browserItems}
            vaultId={vaultId}
            onOpenFolder={navigateToFolder}
            getItemActions={getItemActions}
            onOpenContextMenu={openContextMenu}
            isMutating={itemMutationPending}
          />
        ) : (
          <BrowserItemGrid
            items={browserItems}
            vaultId={vaultId}
            onOpenFolder={navigateToFolder}
            getItemActions={getItemActions}
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
