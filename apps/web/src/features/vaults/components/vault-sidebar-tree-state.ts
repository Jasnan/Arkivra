import type { FolderTreeDocumentEntry, FolderTreeEntry } from '@/features/file-browser/file-browser.types';

export interface VaultSidebarTreeState {
  isVaultRootExpanded: boolean;
  expandedVaultIds: Set<string>;
  collapsedVaultIds: Set<string>;
  expandedFolderIds: Set<string>;
  pendingExpandedFolderId: string | null;
  navigation: VaultSidebarTreeNavigation | null;
}

export type VaultSidebarTreeNavigation =
  | { type: 'vaultRoot'; vaultId: string }
  | { type: 'folder'; vaultId: string; folderId: string };

export type VaultSidebarTreeAction =
  | {
    type: 'routeChanged';
    activeVaultId?: string | null;
    currentFolderId: string | null;
    currentDocumentFolderId?: string | null;
    folders: FolderTreeEntry[];
  }
  | { type: 'toggleVaultRoot'; isExpanded: boolean }
  | {
    type: 'toggleVault';
    vaultId: string;
    isExpanded: boolean;
    activeVaultId?: string | null;
    currentFolderId: string | null;
    hasActiveDocument?: boolean;
  }
  | {
    type: 'toggleFolder';
    folderId: string;
    isExpanded: boolean;
    activeVaultId?: string | null;
    currentFolderId: string | null;
    hasActiveDocument?: boolean;
    folders: FolderTreeEntry[];
  }
  | { type: 'navigationHandled' };

export function createVaultSidebarTreeState({
  folders,
  currentFolderId,
  currentDocumentFolderId = null,
}: {
  activeVaultId?: string | null;
  currentFolderId: string | null;
  currentDocumentFolderId?: string | null;
  folders: FolderTreeEntry[];
}): VaultSidebarTreeState {
  return {
    isVaultRootExpanded: true,
    expandedVaultIds: new Set(),
    collapsedVaultIds: new Set(),
    expandedFolderIds: getCurrentRouteExpandedFolderIds({
      folders,
      currentFolderId,
      currentDocumentFolderId,
    }),
    pendingExpandedFolderId: null,
    navigation: null,
  };
}

export function vaultSidebarTreeReducer(
  state: VaultSidebarTreeState,
  action: VaultSidebarTreeAction,
): VaultSidebarTreeState {
  switch (action.type) {
    case 'routeChanged':
      return applyRouteChange(state, action);

    case 'toggleVaultRoot':
      return {
        ...state,
        isVaultRootExpanded: !action.isExpanded,
        navigation: null,
      };

    case 'toggleVault':
      return toggleVault(state, action);

    case 'toggleFolder':
      return toggleFolder(state, action);

    case 'navigationHandled':
      if (state.navigation === null) return state;
      return { ...state, navigation: null };
  }
}

export function getExpandableFolderIds(
  folders: FolderTreeEntry[],
  documents: FolderTreeDocumentEntry[] = [],
) {
  const expandableFolderIds = new Set<string>();

  for (const folder of folders) {
    if (folder.parentId) {
      expandableFolderIds.add(folder.parentId);
    }
  }

  for (const document of documents) {
    if (document.folderId) {
      expandableFolderIds.add(document.folderId);
    }
  }

  return expandableFolderIds;
}

export function getCurrentFolderAncestorIds(folders: FolderTreeEntry[], currentFolderId: string | null) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestorIds = new Set<string>();
  let cursor = currentFolderId;

  while (cursor) {
    const folder = foldersById.get(cursor);
    if (!folder) break;

    if (folder.parentId) {
      ancestorIds.add(folder.parentId);
    }

    cursor = folder.parentId;
  }

  return ancestorIds;
}

export function getDescendantFolderIds(folders: FolderTreeEntry[], folderId: string) {
  const childrenByParentId = new Map<string, string[]>();
  const descendantIds = new Set<string>();
  const queue = [folderId];

  for (const folder of folders) {
    if (!folder.parentId) continue;

    const children = childrenByParentId.get(folder.parentId) ?? [];
    children.push(folder.id);
    childrenByParentId.set(folder.parentId, children);
  }

  while (queue.length > 0) {
    const parentId = queue.shift();
    if (!parentId) continue;

    for (const childId of childrenByParentId.get(parentId) ?? []) {
      if (descendantIds.has(childId)) continue;

      descendantIds.add(childId);
      queue.push(childId);
    }
  }

  return descendantIds;
}

export function getVisibleExpandedFolderIds({
  expandedFolderIds,
  folders,
  currentFolderId,
  currentDocumentFolderId = null,
}: {
  expandedFolderIds: Set<string>;
  folders: FolderTreeEntry[];
  currentFolderId: string | null;
  currentDocumentFolderId?: string | null;
}) {
  const visibleExpandedFolderIds = new Set(expandedFolderIds);
  const currentFolderAncestorIds = getCurrentRouteExpandedFolderIds({
    folders,
    currentFolderId,
    currentDocumentFolderId,
  });

  for (const folderId of currentFolderAncestorIds) {
    visibleExpandedFolderIds.add(folderId);
  }

  return visibleExpandedFolderIds;
}

export type VisibleVaultTreeItem =
  | { type: 'folder'; folder: FolderTreeEntry }
  | { type: 'document'; document: FolderTreeDocumentEntry };

function sortTreeEntriesByName<T extends { name: string; id: string }>(entries: T[]) {
  return [...entries].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    return nameComparison === 0 ? left.id.localeCompare(right.id) : nameComparison;
  });
}

export function getVisibleVaultTreeItems({
  folders,
  documents,
  expandedFolderIds,
}: {
  folders: FolderTreeEntry[];
  documents: FolderTreeDocumentEntry[];
  expandedFolderIds: Set<string>;
}) {
  const foldersByParentId = new Map<string | null, FolderTreeEntry[]>();
  const documentsByFolderId = new Map<string | null, FolderTreeDocumentEntry[]>();
  const visibleItems: VisibleVaultTreeItem[] = [];

  for (const folder of folders) {
    const siblings = foldersByParentId.get(folder.parentId) ?? [];
    siblings.push(folder);
    foldersByParentId.set(folder.parentId, siblings);
  }

  for (const document of documents) {
    const siblings = documentsByFolderId.get(document.folderId) ?? [];
    siblings.push(document);
    documentsByFolderId.set(document.folderId, siblings);
  }

  function appendChildren(parentId: string | null) {
    for (const folder of sortTreeEntriesByName(foldersByParentId.get(parentId) ?? [])) {
      visibleItems.push({ type: 'folder', folder });

      if (expandedFolderIds.has(folder.id)) {
        appendChildren(folder.id);
      }
    }

    for (const document of sortTreeEntriesByName(documentsByFolderId.get(parentId) ?? [])) {
      visibleItems.push({ type: 'document', document });
    }
  }

  appendChildren(null);
  return visibleItems;
}

export function getVisibleVaultTreeFolders(folders: FolderTreeEntry[], expandedFolderIds: Set<string>) {
  return getVisibleVaultTreeItems({ folders, documents: [], expandedFolderIds })
    .filter((item): item is Extract<VisibleVaultTreeItem, { type: 'folder' }> => item.type === 'folder')
    .map(item => item.folder);
}

export function isVaultExpanded({
  state,
  vaultId,
  activeVaultId,
  currentFolderId,
  hasActiveDocument = false,
}: {
  state: VaultSidebarTreeState;
  vaultId: string;
  activeVaultId?: string | null;
  currentFolderId: string | null;
  hasActiveDocument?: boolean;
}) {
  const isActiveVault = activeVaultId === vaultId;

  return (
    (isActiveVault && state.expandedVaultIds.has(vaultId)) ||
    (isActiveVault && (currentFolderId !== null || hasActiveDocument || !state.collapsedVaultIds.has(vaultId)))
  );
}

function applyRouteChange(
  state: VaultSidebarTreeState,
  action: Extract<VaultSidebarTreeAction, { type: 'routeChanged' }>,
): VaultSidebarTreeState {
  const expandedFolderIds = getCurrentRouteExpandedFolderIds({
    folders: action.folders,
    currentFolderId: action.currentFolderId,
    currentDocumentFolderId: action.currentDocumentFolderId ?? null,
  });
  const isVaultRootExpanded = action.activeVaultId ? true : state.isVaultRootExpanded;

  if (state.pendingExpandedFolderId && state.pendingExpandedFolderId === action.currentFolderId) {
    expandedFolderIds.add(state.pendingExpandedFolderId);
  }

  if (
    state.isVaultRootExpanded === isVaultRootExpanded &&
    state.pendingExpandedFolderId === null &&
    state.navigation === null &&
    areSetsEqual(state.expandedFolderIds, expandedFolderIds)
  ) {
    return state;
  }

  return {
    ...state,
    isVaultRootExpanded,
    expandedFolderIds,
    pendingExpandedFolderId: null,
    navigation: null,
  };
}

function toggleVault(
  state: VaultSidebarTreeState,
  action: Extract<VaultSidebarTreeAction, { type: 'toggleVault' }>,
): VaultSidebarTreeState {
  if (action.isExpanded) {
    const expandedVaultIds = new Set(state.expandedVaultIds);
    const collapsedVaultIds = new Set(state.collapsedVaultIds);
    expandedVaultIds.delete(action.vaultId);
    collapsedVaultIds.add(action.vaultId);

    return {
      ...state,
      expandedVaultIds,
      collapsedVaultIds,
      navigation: action.activeVaultId === action.vaultId && (action.currentFolderId !== null || action.hasActiveDocument)
        ? { type: 'vaultRoot', vaultId: action.vaultId }
        : null,
    };
  }

  const collapsedVaultIds = new Set(state.collapsedVaultIds);
  collapsedVaultIds.delete(action.vaultId);

  return {
    ...state,
    expandedVaultIds: new Set([action.vaultId]),
    collapsedVaultIds,
    navigation: action.activeVaultId !== action.vaultId
      ? { type: 'vaultRoot', vaultId: action.vaultId }
      : null,
  };
}

function toggleFolder(
  state: VaultSidebarTreeState,
  action: Extract<VaultSidebarTreeAction, { type: 'toggleFolder' }>,
): VaultSidebarTreeState {
  const descendantFolderIds = getDescendantFolderIds(action.folders, action.folderId);

  if (action.isExpanded) {
    const expandedFolderIds = new Set(state.expandedFolderIds);
    expandedFolderIds.delete(action.folderId);

    for (const descendantFolderId of descendantFolderIds) {
      expandedFolderIds.delete(descendantFolderId);
    }

    return {
      ...state,
      expandedFolderIds,
      pendingExpandedFolderId: null,
      navigation: action.activeVaultId && action.currentFolderId && (
        descendantFolderIds.has(action.currentFolderId) ||
        (action.hasActiveDocument === true && action.currentFolderId === action.folderId)
      )
        ? { type: 'folder', vaultId: action.activeVaultId, folderId: action.folderId }
        : null,
    };
  }

  const expandedFolderIds = new Set(state.expandedFolderIds);

  for (const descendantFolderId of descendantFolderIds) {
    expandedFolderIds.delete(descendantFolderId);
  }

  expandedFolderIds.add(action.folderId);

  return {
    ...state,
    expandedFolderIds,
    pendingExpandedFolderId: action.folderId,
    navigation: null,
  };
}

function getCurrentRouteExpandedFolderIds({
  folders,
  currentFolderId,
  currentDocumentFolderId,
}: {
  folders: FolderTreeEntry[];
  currentFolderId: string | null;
  currentDocumentFolderId: string | null;
}) {
  const routeFolderId = currentFolderId ?? currentDocumentFolderId;
  const expandedFolderIds = getCurrentFolderAncestorIds(folders, routeFolderId);

  if (currentDocumentFolderId !== null) {
    expandedFolderIds.add(currentDocumentFolderId);
  }

  return expandedFolderIds;
}

function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
  if (left.size !== right.size) return false;

  for (const value of left) {
    if (!right.has(value)) return false;
  }

  return true;
}
