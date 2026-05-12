import type { KeyboardEvent, MouseEvent } from 'react';
import { useMemo, useState } from 'react';
import {
  getBrowserItemKey,
} from '@/features/file-browser/components/vault-browser.types';
import type { BrowserItem } from '@/features/file-browser/components/vault-browser.types';

const EMPTY_SELECTED_ITEM_KEYS = new Set<string>();

interface BrowserSelectionState {
  folderId: string | null;
  keys: Set<string>;
  lastKey: string | null;
}

export function useBrowserSelection({
  currentFolderId,
  browserItems,
  onBeforeSelect,
}: {
  currentFolderId: string | null;
  browserItems: BrowserItem[];
  onBeforeSelect?: () => void;
}) {
  const [selection, setSelection] = useState<BrowserSelectionState>(() => ({
    folderId: currentFolderId,
    keys: new Set(),
    lastKey: null,
  }));
  const selectedItemKeys = selection.folderId === currentFolderId ? selection.keys : EMPTY_SELECTED_ITEM_KEYS;
  const selectedItems = useMemo(
    () => browserItems.filter(item => selectedItemKeys.has(getBrowserItemKey(item))),
    [browserItems, selectedItemKeys],
  );

  function clearSelection() {
    setSelection({
      folderId: currentFolderId,
      keys: new Set(),
      lastKey: null,
    });
  }

  function selectSingleItem(item: BrowserItem) {
    const itemKey = getBrowserItemKey(item);

    setSelection({
      folderId: currentFolderId,
      keys: new Set([itemKey]),
      lastKey: itemKey,
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

    onBeforeSelect?.();
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

  return {
    selectedItemKeys,
    selectedItems,
    selectedCount: selectedItems.length,
    clearSelection,
    selectSingleItem,
    selectBrowserItem,
  };
}
