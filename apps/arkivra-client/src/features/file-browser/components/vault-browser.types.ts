import type { LucideIcon } from 'lucide-react';
import { getDocumentTypeLabel } from '@/features/documents/components/document-file-icon.utils';
import type { DocumentSummary } from '@/features/documents/documents.types';
import type { FolderSummary, FolderTreeEntry } from '@/features/file-browser/file-browser.types';

export { getDocumentTypeLabel };

export const FILE_BROWSER_SORT_STORAGE_KEY = 'arkivra:file-browser:sort';

export type FileBrowserView = 'list' | 'grid';
export type FileBrowserSort =
  | 'name_asc'
  | 'name_desc'
  | 'updated_desc'
  | 'updated_asc'
  | 'size_desc'
  | 'size_asc';

export interface BrowserDocumentItem {
  type: 'document';
  document: DocumentSummary;
}

export interface BrowserFolderItem {
  type: 'folder';
  folder: FolderSummary;
}

export interface BrowserRootItem {
  type: 'root';
  vaultId: string;
}

export interface BrowserBackgroundItem {
  type: 'background';
  vaultId: string;
  folderId: string | null;
  name: string;
}

export type BrowserItem = BrowserFolderItem | BrowserDocumentItem;
export type BrowserContextItem = BrowserItem | BrowserRootItem | BrowserBackgroundItem;
export type BrowserActionTone = 'default' | 'destructive';

export interface BrowserAction {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: BrowserActionTone;
  disabled?: boolean;
  onSelect: () => void;
}

export type BrowserContextMenuEntry =
  | BrowserAction
  | { key: string; type: 'header'; label: string }
  | { key: string; type: 'separator' };

export type ItemDialogTarget = BrowserItem | null;
export type MoveDialogTarget = BrowserItem | BrowserItem[] | null;
export type InfoDialogTarget = BrowserContextItem | null;

export interface MoveDestination {
  id: string | null;
  name: string;
  label: string;
  depth: number;
}

export type BrowserDropTargetState = 'valid' | 'invalid';

export interface BrowserDropTarget {
  folderId: string | null;
  state: BrowserDropTargetState;
}

export interface ContextMenuPosition {
  item: BrowserContextItem;
  x: number;
  y: number;
}

export type ContextMenuState = ContextMenuPosition | null;

export function getInitialBrowserSort(): FileBrowserSort {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return 'name_asc';
  }

  try {
    const value = window.localStorage.getItem(FILE_BROWSER_SORT_STORAGE_KEY);
    return value === 'name_desc'
      || value === 'updated_desc'
      || value === 'updated_asc'
      || value === 'size_desc'
      || value === 'size_asc'
      ? value
      : 'name_asc';
  } catch {
    return 'name_asc';
  }
}

export function getItemName(item: BrowserContextItem) {
  if (item.type === 'root') {
    return 'Vault root';
  }

  if (item.type === 'background') {
    return item.name;
  }

  return item.type === 'folder' ? item.folder.name : item.document.name;
}

export function getFileDisplayName(name: string) {
  const lastSlashIndex = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  const basenameStart = lastSlashIndex + 1;
  const basename = name.slice(basenameStart);
  const lastDotIndex = basename.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return name;
  }

  return `${name.slice(0, basenameStart)}${basename.slice(0, lastDotIndex)}`;
}

export function getItemDisplayName(item: BrowserContextItem) {
  if (item.type !== 'document') {
    return getItemName(item);
  }

  return getFileDisplayName(item.document.name);
}

export function getBrowserItemKey(item: BrowserItem) {
  return item.type === 'folder' ? `folder-${item.folder.id}` : `document-${item.document.id}`;
}

export function getBrowserItemParentId(item: BrowserItem) {
  return item.type === 'folder' ? item.folder.parentId : item.document.folderId;
}

export function isFolderDescendant({
  folders,
  folderId,
  candidateId,
}: {
  folders: FolderTreeEntry[];
  folderId: string;
  candidateId: string;
}) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  let current = byId.get(candidateId) ?? null;
  const seen = new Set<string>();

  while (current !== null) {
    if (current.id === folderId) {
      return true;
    }

    if (current.parentId === null || seen.has(current.id)) {
      return false;
    }

    seen.add(current.id);
    current = byId.get(current.parentId) ?? null;
  }

  return false;
}

export function getMoveDestinations({
  folders,
  target,
}: {
  folders: FolderTreeEntry[];
  target: MoveDialogTarget;
}) {
  const targets = Array.isArray(target) ? target : target === null ? [] : [target];
  const selectedFolders = targets.filter((item): item is BrowserFolderItem => item.type === 'folder');
  const allowedFolders = selectedFolders.length > 0
    ? folders.filter(folder =>
        selectedFolders.every(targetFolder =>
          folder.id !== targetFolder.folder.id
          && !isFolderDescendant({ folders, folderId: targetFolder.folder.id, candidateId: folder.id }),
        ),
      )
    : folders;

  return [
    { id: null, name: 'Vault root', label: 'Vault root', depth: 0 },
    ...allowedFolders.map(folder => ({
      id: folder.id,
      name: folder.name,
      label: folder.path,
      depth: folder.depth + 1,
    })),
  ];
}
