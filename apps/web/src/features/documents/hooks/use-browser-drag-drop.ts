import type { DragEvent } from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  getBrowserItemKey,
  getBrowserItemParentId,
  getItemName,
  isFolderDescendant,
} from '@/features/file-browser/components/vault-browser.types';
import type { BrowserDropTarget, BrowserItem } from '@/features/file-browser/components/vault-browser.types';
import { useOptionalVaultBrowserDragDrop } from '@/features/file-browser/components/vault-browser-drag-drop-context';
import type { FolderTreeEntry } from '@/features/file-browser/file-browser.types';

export const INTERNAL_BROWSER_DRAG_TYPE = 'application/x-arkivra-browser-items';

export function hasInternalBrowserDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(INTERNAL_BROWSER_DRAG_TYPE);
}

export function serializeBrowserDragItems(items: BrowserItem[]) {
  return JSON.stringify(items.map((item) => ({
    id: item.type === 'folder' ? item.folder.id : item.document.id,
    type: item.type,
  })));
}

export function getBrowserDropValidation({
  canUpdateItems,
  itemMutationPending,
  destinationId,
  targets,
  folders,
}: {
  canUpdateItems: boolean;
  itemMutationPending: boolean;
  destinationId: string | null;
  targets: BrowserItem[];
  folders: FolderTreeEntry[] | undefined;
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
      && folders
      && isFolderDescendant({
        folders,
        folderId: target.folder.id,
        candidateId: destinationId,
      })
    ) {
      return { valid: false, message: 'A folder cannot be moved into one of its descendants.' };
    }
  }

  return { valid: true };
}

export function useBrowserDragDrop({
  canUpdateItems,
  itemMutationPending,
  selectedItemKeys,
  selectedItems,
  selectSingleItem,
  folders,
  onMoveItems,
}: {
  canUpdateItems: boolean;
  itemMutationPending: boolean;
  selectedItemKeys: Set<string>;
  selectedItems: BrowserItem[];
  selectSingleItem: (item: BrowserItem) => void;
  folders: FolderTreeEntry[] | undefined;
  onMoveItems: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  const sharedDragDrop = useOptionalVaultBrowserDragDrop();
  const [localDraggedItems, setLocalDraggedItems] = useState<BrowserItem[]>([]);
  const [dropTarget, setDropTarget] = useState<BrowserDropTarget | null>(null);
  const draggedItems = sharedDragDrop?.dragState.source
    ? sharedDragDrop.dragState.items
    : localDraggedItems;
  const draggedItemKeys = useMemo(
    () => new Set(draggedItems.map(item => getBrowserItemKey(item))),
    [draggedItems],
  );

  function resetDragState() {
    setLocalDraggedItems([]);
    sharedDragDrop?.clearDrag('panel');
    setDropTarget(null);
  }

  function getDropValidation({
    destinationId,
    targets,
  }: {
    destinationId: string | null;
    targets: BrowserItem[];
  }): { valid: true } | { valid: false; message: string } {
    return getBrowserDropValidation({
      canUpdateItems,
      itemMutationPending,
      destinationId,
      targets,
      folders,
    });
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

    setLocalDraggedItems(dragItems);
    sharedDragDrop?.startDrag('panel', dragItems);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(INTERNAL_BROWSER_DRAG_TYPE, serializeBrowserDragItems(dragItems));
    event.dataTransfer.setData('text/plain', dragItems.map(target => getItemName(target)).join(', '));
  }

  function handleItemDragEnd() {
    resetDragState();
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

    onMoveItems({ targets: draggedItems, destinationId: folderId });
    setLocalDraggedItems([]);
    sharedDragDrop?.clearDrag(sharedDragDrop?.dragState.source ?? 'panel');
  }

  return {
    dropTarget,
    draggedItemKeys,
    resetDragState,
    handleItemDragStart,
    handleItemDragEnd,
    handleDragOverFolder,
    handleDragLeaveFolder,
    handleDropOnFolder,
  };
}
