import type { LucideIcon } from 'lucide-react';
import type { DocumentSummary } from '@/features/documents/documents.types';
import type { FolderSummary, FolderTreeEntry } from '@/features/file-browser/file-browser.types';

export const FILE_BROWSER_VIEW_STORAGE_KEY = 'arkivra:file-browser:view';

export type FileBrowserView = 'list' | 'grid';

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

export type BrowserItem = BrowserFolderItem | BrowserDocumentItem;
export type BrowserContextItem = BrowserItem | BrowserRootItem;
export type BrowserActionTone = 'default' | 'destructive';

export interface BrowserAction {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: BrowserActionTone;
  disabled?: boolean;
  onSelect: () => void;
}

export type ItemDialogTarget = BrowserItem | null;
export type InfoDialogTarget = BrowserContextItem | null;

export interface ContextMenuPosition {
  item: BrowserContextItem;
  x: number;
  y: number;
}

export type ContextMenuState = ContextMenuPosition | null;

export function getInitialBrowserView(): FileBrowserView {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return 'list';
  }

  try {
    return window.localStorage.getItem(FILE_BROWSER_VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

export function getDocumentTypeLabel({ name, mimeType }: { name: string; mimeType: string }) {
  const extension = name.split('.').pop()?.trim().toUpperCase();

  if (extension && extension.length <= 5) {
    return extension;
  }

  if (mimeType === 'application/pdf') {
    return 'PDF';
  }

  if (mimeType.startsWith('image/')) {
    return 'IMG';
  }

  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return 'XLS';
  }

  if (mimeType.includes('word') || mimeType.includes('document')) {
    return 'DOC';
  }

  if (mimeType.startsWith('text/')) {
    return 'TXT';
  }

  return 'FILE';
}

export function getItemName(item: BrowserContextItem) {
  if (item.type === 'root') {
    return 'Vault root';
  }

  return item.type === 'folder' ? item.folder.name : item.document.name;
}

function isFolderDescendant({
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
  target: ItemDialogTarget;
}) {
  const allowedFolders = target?.type === 'folder'
    ? folders.filter(folder =>
        folder.id !== target.folder.id
        && !isFolderDescendant({ folders, folderId: target.folder.id, candidateId: folder.id }),
      )
    : folders;

  return [
    { id: null, label: 'Vault root' },
    ...allowedFolders.map(folder => ({
      id: folder.id,
      label: folder.path,
    })),
  ];
}
