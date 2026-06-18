/* eslint-disable react-refresh/only-export-components */
import { CloseButton, Dialog as ChakraDialog, Portal, Stack, Text } from '@chakra-ui/react';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/action-buttons';
import { useDialogPageLockCleanup } from '@/components/ui/dialog-page-locks';
import {
  getBrowserItemKey,
  getItemName,
} from '@/features/file-browser/components/vault-browser.types';
import type {
  BrowserAction,
  BrowserContextMenuEntry,
  BrowserItem,
  FileBrowserSort,
} from '@/features/file-browser/components/vault-browser.types';
import type { AiAccessLevel, VaultRole } from '@/features/vaults/vaults.types';

export function isBrowserAction(entry: BrowserContextMenuEntry): entry is BrowserAction {
  return !('type' in entry);
}

export const adminJoinRoleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

export const adminJoinAiAccessOptions: Array<{ value: AiAccessLevel; label: string }> = [
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

export function getCommonBrowserItemParentId(items: BrowserItem[]) {
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

export function DeleteItemsConfirmDialog({
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

export function compareBrowserItems(
  left: BrowserItem,
  right: BrowserItem,
  sortBy: FileBrowserSort,
) {
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
