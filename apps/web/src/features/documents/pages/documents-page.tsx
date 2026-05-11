import type { DragEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, HStack, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { Download, Eye, Folder, FolderPlus, Grid3X3, Home, Info, List, MoveRight, Pencil, Tags, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
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
  getBrowserItemKey,
  getBrowserItemParentId,
  getItemName,
  getMoveDestinations,
  isFolderDescendant,
} from '@/features/file-browser/components/vault-browser.types';
import type {
  BrowserAction,
  BrowserContextItem,
  BrowserDropTarget,
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

const INTERNAL_BROWSER_DRAG_TYPE = 'application/x-arkivra-browser-items';
const EMPTY_SELECTED_ITEM_KEYS = new Set<string>();

interface BrowserSelectionState {
  folderId: string | null;
  keys: Set<string>;
  lastKey: string | null;
}

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

function getMoveErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'You do not have permission to move this item.';
    }

    if (error.status === 404) {
      return 'The item or destination folder is no longer available.';
    }

    return error.message;
  }

  return error instanceof Error ? error.message : 'Could not move item.';
}

function hasInternalBrowserDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(INTERNAL_BROWSER_DRAG_TYPE);
}

function serializeBrowserDragItems(items: BrowserItem[]) {
  return JSON.stringify(items.map((item) => ({
    id: item.type === 'folder' ? item.folder.id : item.document.id,
    type: item.type,
  })));
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
  const [selection, setSelection] = useState<BrowserSelectionState>(() => ({
    folderId: currentFolderId,
    keys: new Set(),
    lastKey: null,
  }));
  const [draggedItems, setDraggedItems] = useState<BrowserItem[]>([]);
  const [dropTarget, setDropTarget] = useState<BrowserDropTarget | null>(null);

  const folderItemsQuery = useFolderItemsQuery({
    vaultId,
    folderId: currentFolderId,
  });
  const folderTreeQuery = useFolderTreeQuery({
    vaultId,
    enabled: true,
  });
  const vaultQuery = useVaultQuery({ vaultId });

  async function moveBrowserItem({
    target,
    destinationId,
  }: {
    target: BrowserItem;
    destinationId: string | null;
  }) {
    if (target.type === 'folder') {
      return moveFolder({ vaultId, folderId: target.folder.id, parentId: destinationId });
    }

    return moveDocument({ vaultId, documentId: target.document.id, folderId: destinationId });
  }

  const deleteMutation = useMutation({
    mutationFn: async (documents: Array<{ vaultId: string; documentId: string }>) =>
      Promise.all(documents.map((document) => softDeleteDocument(document))),
    onSuccess: async (_data, documents) => {
      toast.success(
        documents.length === 1
          ? 'Document moved to trash.'
          : `${documents.length} documents moved to trash.`,
      );
      clearSelection();
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
    mutationFn: moveBrowserItem,
    onSuccess: async (_data, variables) => {
      toast.success(`${variables.target.type === 'folder' ? 'Folder' : 'Document'} moved.`);
      setMoveTarget(null);
      setMoveDestinationId(null);
      clearSelection();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(getMoveErrorMessage(error));

      if (error instanceof ApiError && error.status === 404) {
        void queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all });
      }
    },
  });
  const moveItemsMutation = useMutation({
    mutationFn: async ({ targets, destinationId }: { targets: BrowserItem[]; destinationId: string | null }) => {
      const targetsToMove = targets.filter(target => getBrowserItemParentId(target) !== destinationId);
      await Promise.all(targetsToMove.map(target => moveBrowserItem({ target, destinationId })));
      return { movedCount: targetsToMove.length };
    },
    onSuccess: async ({ movedCount }) => {
      if (movedCount > 0) {
        toast.success(movedCount === 1 ? 'Item moved.' : `${movedCount} items moved.`);
      }
      clearSelection();
      setDraggedItems([]);
      setDropTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(getMoveErrorMessage(error));
      setDraggedItems([]);
      setDropTarget(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (folder: FolderSummary) => softDeleteFolder({ vaultId, folderId: folder.id }),
    onSuccess: async () => {
      toast.success('Folder moved to trash.');
      clearSelection();
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
  const selectedItemKeys = selection.folderId === currentFolderId ? selection.keys : EMPTY_SELECTED_ITEM_KEYS;
  const selectedItems = useMemo(
    () => browserItems.filter(item => selectedItemKeys.has(getBrowserItemKey(item))),
    [browserItems, selectedItemKeys],
  );
  const selectedCount = selectedItems.length;
  const draggedItemKeys = useMemo(
    () => new Set(draggedItems.map(item => getBrowserItemKey(item))),
    [draggedItems],
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
    || moveMutation.isPending
    || moveItemsMutation.isPending;
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

  function clearSelection() {
    setSelection({
      folderId: currentFolderId,
      keys: new Set(),
      lastKey: null,
    });
  }

  function selectSingleItem(item: BrowserItem) {
    setSelection({
      folderId: currentFolderId,
      keys: new Set([getBrowserItemKey(item)]),
      lastKey: getBrowserItemKey(item),
    });
  }

  function getRangeSelectionKeys(anchorKey: string, itemKey: string) {
    const itemKeys = browserItems.map(item => getBrowserItemKey(item));
    const anchorIndex = itemKeys.indexOf(anchorKey);
    const itemIndex = itemKeys.indexOf(itemKey);

    if (anchorIndex === -1 || itemIndex === -1) {
      return new Set([itemKey]);
    }

    const startIndex = Math.min(anchorIndex, itemIndex);
    const endIndex = Math.max(anchorIndex, itemIndex);
    return new Set(itemKeys.slice(startIndex, endIndex + 1));
  }

  function selectBrowserItem(
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    item: BrowserItem,
  ) {
    const itemKey = getBrowserItemKey(item);
    const shouldToggle = event.metaKey || event.ctrlKey;
    const shouldSelectRange = event.shiftKey;

    setContextMenu(null);
    setSelection((previousSelection) => {
      const isSameFolder = previousSelection.folderId === currentFolderId;
      const previousKeys = isSameFolder ? previousSelection.keys : EMPTY_SELECTED_ITEM_KEYS;
      const previousLastKey = isSameFolder ? previousSelection.lastKey : null;

      if (shouldSelectRange && previousLastKey !== null) {
        return {
          folderId: currentFolderId,
          keys: getRangeSelectionKeys(previousLastKey, itemKey),
          lastKey: itemKey,
        };
      }

      if (shouldToggle) {
        const nextKeys = new Set(previousKeys);
        if (nextKeys.has(itemKey)) {
          nextKeys.delete(itemKey);
        } else {
          nextKeys.add(itemKey);
        }

        return {
          folderId: currentFolderId,
          keys: nextKeys,
          lastKey: itemKey,
        };
      }

      return {
        folderId: currentFolderId,
        keys: new Set([itemKey]),
        lastKey: itemKey,
      };
    });
  }

  function getDropValidation({
    destinationId,
    targets,
  }: {
    destinationId: string | null;
    targets: BrowserItem[];
  }): { valid: true } | { valid: false; message: string } {
    if (!canUpdateItems) {
      return { valid: false, message: 'You do not have permission to move items.' };
    }

    if (itemMutationPending) {
      return { valid: false, message: 'Wait for the current file operation to finish.' };
    }

    if (targets.length === 0) {
      return { valid: false, message: 'No items selected to move.' };
    }

    if (targets.every(target => getBrowserItemParentId(target) === destinationId)) {
      return { valid: false, message: 'Items are already in that folder.' };
    }

    for (const target of targets) {
      if (target.type !== 'folder') {
        continue;
      }

      if (destinationId === target.folder.id) {
        return { valid: false, message: 'A folder cannot be moved into itself.' };
      }

      if (
        destinationId !== null
        && folderTreeQuery.data?.folders
        && isFolderDescendant({
          folders: folderTreeQuery.data.folders,
          folderId: target.folder.id,
          candidateId: destinationId,
        })
      ) {
        return { valid: false, message: 'A folder cannot be moved into one of its descendants.' };
      }
    }

    return { valid: true };
  }

  function setActiveDropTarget(folderId: string | null, state: BrowserDropTarget['state']) {
    setDropTarget((previousDropTarget) => {
      if (previousDropTarget?.folderId === folderId && previousDropTarget.state === state) {
        return previousDropTarget;
      }

      return { folderId, state };
    });
  }

  function handleItemDragStart(event: DragEvent<HTMLElement>, item: BrowserItem) {
    if (!canUpdateItems || itemMutationPending) {
      event.preventDefault();
      return;
    }

    const itemKey = getBrowserItemKey(item);
    const dragItems = selectedItemKeys.has(itemKey) && selectedItems.length > 0
      ? selectedItems
      : [item];

    if (!selectedItemKeys.has(itemKey)) {
      selectSingleItem(item);
    }

    setDraggedItems(dragItems);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(INTERNAL_BROWSER_DRAG_TYPE, serializeBrowserDragItems(dragItems));
    event.dataTransfer.setData('text/plain', dragItems.map(target => getItemName(target)).join(', '));
  }

  function handleItemDragEnd() {
    setDraggedItems([]);
    setDropTarget(null);
  }

  function handleDragOverFolder(event: DragEvent<HTMLElement>, folderId: string | null) {
    if (!hasInternalBrowserDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const validation = getDropValidation({ destinationId: folderId, targets: draggedItems });
    event.dataTransfer.dropEffect = validation.valid ? 'move' : 'none';
    setActiveDropTarget(folderId, validation.valid ? 'valid' : 'invalid');
  }

  function handleDragLeaveFolder(event: DragEvent<HTMLElement>, folderId: string | null) {
    if (!hasInternalBrowserDrag(event)) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    setDropTarget(previousDropTarget => previousDropTarget?.folderId === folderId ? null : previousDropTarget);
  }

  function handleDropOnFolder(event: DragEvent<HTMLElement>, folderId: string | null) {
    if (!hasInternalBrowserDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const validation = getDropValidation({ destinationId: folderId, targets: draggedItems });
    setDropTarget(null);

    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    moveItemsMutation.mutate({ targets: draggedItems, destinationId: folderId });
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
    clearSelection();
    setDraggedItems([]);
    setDropTarget(null);
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

  const workspaceHeader = useMemo(() => ({
    left: (
      <FolderBreadcrumbs
        currentFolderId={currentFolderId}
        breadcrumbs={folderItemsQuery.data?.breadcrumbs ?? []}
        onNavigateFolder={navigateToFolder}
        onOpenRootContextMenu={(event) => openContextMenu(event, { type: 'root', vaultId })}
        dropTarget={dropTarget}
        onDragOverFolder={handleDragOverFolder}
        onDragLeaveFolder={handleDragLeaveFolder}
        onDropOnFolder={handleDropOnFolder}
      />
    ),
    meta: (
      <Text fontSize="xs" color="fg.muted">
        {activeResultCount} item{activeResultCount === 1 ? '' : 's'}
        {selectedCount > 0 ? ` - ${selectedCount} selected` : ''}
      </Text>
    ),
    actions: (
      <HStack gap="2">
        {selectedCount > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
            Clear
          </Button>
        ) : null}
        <Flex
          display={{ base: 'none', xl: 'flex' }}
          align="center"
          gap="2"
          rounded="md"
          borderWidth="1px"
          borderColor="border.subtle"
          bg="bg.workspace"
          px="2.5"
          h="9"
        >
          <Text as="span" id="vault-browser-sort" fontSize="xs" fontWeight="medium" color="fg.muted">
            Sort
          </Text>
          <Select value={browserSort} onValueChange={(value) => setBrowserSort(value as FileBrowserSort)}>
            <SelectTrigger
              aria-label="Sort folder items"
              aria-labelledby="vault-browser-sort"
              h="8"
              minW="36"
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
          size="icon"
          variant={browserView === 'list' ? 'solid' : 'ghost'}
          aria-label="List view"
          onClick={() => setBrowserView('list')}
        >
          <List size={17} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={browserView === 'grid' ? 'solid' : 'ghost'}
          aria-label="Grid view"
          onClick={() => setBrowserView('grid')}
        >
          <Grid3X3 size={17} />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => openCreateFolderDialog(currentFolderId)}>
          <FolderPlus size={16} />
          New
        </Button>
        <Link to={ROUTES.transfersWithLock(vaultId, currentFolderId)} style={{ textDecoration: 'none' }}>
          <Button type="button" size="sm">
            <Upload size={16} />
            Upload
          </Button>
        </Link>
      </HStack>
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- header registration follows browser state; handlers are local event delegates.
  }), [
    activeResultCount,
    browserSort,
    browserView,
    currentFolderId,
    dropTarget,
    folderItemsQuery.data?.breadcrumbs,
    selectedCount,
    vaultId,
  ]);

  useWorkspaceHeader(workspaceHeader);

  if (!vaultId) {
    return <Text fontSize="sm" color="fg.error">Invalid vault id.</Text>;
  }

  return (
    <Flex as="section" h="full" minH="0" direction="column" overflow="hidden">
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
