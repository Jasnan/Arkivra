import { describe, expect, it } from 'vitest';
import type { FolderTreeDocumentEntry, FolderTreeEntry } from '@/features/file-browser/file-browser.types';
import {
  createVaultSidebarTreeState,
  getExpandableFolderIds,
  getVisibleVaultTreeItems,
  getVisibleVaultTreeFolders,
  isVaultExpanded,
  vaultSidebarTreeReducer,
} from './vault-sidebar-tree-state';

const folders: FolderTreeEntry[] = [
  { id: 'fld_1', parentId: null, name: 'Insurance', path: 'Insurance', depth: 0 },
  { id: 'fld_2', parentId: 'fld_1', name: 'Policies', path: 'Insurance/Policies', depth: 1 },
  { id: 'fld_3', parentId: 'fld_2', name: 'Claims', path: 'Insurance/Policies/Claims', depth: 2 },
  { id: 'fld_4', parentId: null, name: 'Invoices', path: 'Invoices', depth: 0 },
];

const documents: FolderTreeDocumentEntry[] = [
  {
    id: 'doc_root',
    name: 'Vault Overview.pdf',
    originalName: 'vault-overview.pdf',
    folderId: null,
    originalSize: 1024,
    mimeType: 'application/pdf',
    processingStatus: 'completed',
    documentDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isDeleted: false,
    deletedAt: null,
    path: 'Vault Overview.pdf',
    depth: 0,
  },
  {
    id: 'doc_policy',
    name: 'Policy.pdf',
    originalName: 'policy.pdf',
    folderId: 'fld_2',
    originalSize: 2048,
    mimeType: 'application/pdf',
    processingStatus: 'completed',
    documentDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isDeleted: false,
    deletedAt: null,
    path: 'Insurance/Policies/Policy.pdf',
    depth: 2,
  },
  {
    id: 'doc_invoice',
    name: 'Invoice.pdf',
    originalName: 'invoice.pdf',
    folderId: 'fld_4',
    originalSize: 4096,
    mimeType: 'application/pdf',
    processingStatus: 'completed',
    documentDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isDeleted: false,
    deletedAt: null,
    path: 'Invoices/Invoice.pdf',
    depth: 1,
  },
];

function setValues(values: Set<string>) {
  return [...values].sort();
}

function itemKeys(items: ReturnType<typeof getVisibleVaultTreeItems>) {
  return items.map(item => item.type === 'folder' ? `folder:${item.folder.id}` : `document:${item.document.id}`);
}

describe('vault sidebar tree state', () => {
  it('initializes the expanded folder ids from the current route ancestors', () => {
    const state = createVaultSidebarTreeState({
      activeVaultId: 'vlt_1',
      currentFolderId: 'fld_3',
      folders,
    });

    expect(setValues(state.expandedFolderIds)).toEqual(['fld_1', 'fld_2']);
  });

  it('reveals only direct children for expanded folders', () => {
    expect(getVisibleVaultTreeFolders(folders, new Set()).map(folder => folder.id)).toEqual(['fld_1', 'fld_4']);
    expect(getVisibleVaultTreeFolders(folders, new Set(['fld_1'])).map(folder => folder.id)).toEqual([
      'fld_1',
      'fld_2',
      'fld_4',
    ]);
  });

  it('reveals document leaves under visible folder branches', () => {
    expect(itemKeys(getVisibleVaultTreeItems({ folders, documents, expandedFolderIds: new Set() }))).toEqual([
      'folder:fld_1',
      'folder:fld_4',
      'document:doc_root',
    ]);

    expect(itemKeys(getVisibleVaultTreeItems({
      folders,
      documents,
      expandedFolderIds: new Set(['fld_1', 'fld_2']),
    }))).toEqual([
      'folder:fld_1',
      'folder:fld_2',
      'folder:fld_3',
      'document:doc_policy',
      'folder:fld_4',
      'document:doc_root',
    ]);
  });

  it('treats folders containing only files as expandable', () => {
    expect(setValues(getExpandableFolderIds(folders, documents))).toEqual(['fld_1', 'fld_2', 'fld_4']);
  });

  it('expands the current document folder so the active file can be shown', () => {
    const state = createVaultSidebarTreeState({
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      currentDocumentFolderId: 'fld_2',
      folders,
    });

    expect(setValues(state.expandedFolderIds)).toEqual(['fld_1', 'fld_2']);
  });

  it('prunes nested folder expansions when expanding an ancestor', () => {
    const state = createVaultSidebarTreeState({
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      folders,
    });
    const expandedState = {
      ...state,
      expandedFolderIds: new Set(['fld_1', 'fld_2']),
    };

    const nextState = vaultSidebarTreeReducer(expandedState, {
      type: 'toggleFolder',
      folderId: 'fld_1',
      isExpanded: false,
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      folders,
    });

    expect(setValues(nextState.expandedFolderIds)).toEqual(['fld_1']);
    expect(nextState.pendingExpandedFolderId).toBe('fld_1');
    expect(nextState.navigation).toBeNull();
  });

  it('collapses all nested folders and navigates up when the current route would be hidden', () => {
    const state = {
      ...createVaultSidebarTreeState({
        activeVaultId: 'vlt_1',
        currentFolderId: 'fld_3',
        folders,
      }),
      expandedFolderIds: new Set(['fld_1', 'fld_2']),
    };

    const nextState = vaultSidebarTreeReducer(state, {
      type: 'toggleFolder',
      folderId: 'fld_1',
      isExpanded: true,
      activeVaultId: 'vlt_1',
      currentFolderId: 'fld_3',
      folders,
    });

    expect(setValues(nextState.expandedFolderIds)).toEqual([]);
    expect(nextState.navigation).toEqual({ type: 'folder', vaultId: 'vlt_1', folderId: 'fld_1' });
  });

  it('uses route changes as the authority for sibling branch expansion', () => {
    let state = createVaultSidebarTreeState({
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      folders,
    });

    state = vaultSidebarTreeReducer(state, {
      type: 'toggleFolder',
      folderId: 'fld_1',
      isExpanded: false,
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      folders,
    });
    state = vaultSidebarTreeReducer(state, {
      type: 'toggleFolder',
      folderId: 'fld_2',
      isExpanded: false,
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      folders,
    });

    expect(setValues(state.expandedFolderIds)).toEqual(['fld_1', 'fld_2']);

    state = vaultSidebarTreeReducer(state, {
      type: 'routeChanged',
      activeVaultId: 'vlt_1',
      currentFolderId: 'fld_4',
      folders,
    });

    expect(setValues(state.expandedFolderIds)).toEqual([]);
    expect(state.pendingExpandedFolderId).toBeNull();
  });

  it('keeps a clicked folder expanded when navigation lands on that folder', () => {
    let state = createVaultSidebarTreeState({
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      folders,
    });

    state = vaultSidebarTreeReducer(state, {
      type: 'toggleFolder',
      folderId: 'fld_1',
      isExpanded: false,
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      folders,
    });
    state = vaultSidebarTreeReducer(state, {
      type: 'routeChanged',
      activeVaultId: 'vlt_1',
      currentFolderId: 'fld_1',
      folders,
    });

    expect(setValues(state.expandedFolderIds)).toEqual(['fld_1']);
    expect(state.pendingExpandedFolderId).toBeNull();
  });

  it('reopens the vault root on route changes into a vault', () => {
    let state = createVaultSidebarTreeState({
      activeVaultId: null,
      currentFolderId: null,
      folders,
    });

    state = vaultSidebarTreeReducer(state, { type: 'toggleVaultRoot', isExpanded: true });
    expect(state.isVaultRootExpanded).toBe(false);

    state = vaultSidebarTreeReducer(state, {
      type: 'routeChanged',
      activeVaultId: 'vlt_1',
      currentFolderId: null,
      folders,
    });

    expect(state.isVaultRootExpanded).toBe(true);
  });

  it('tracks vault expansion and emits navigation commands for hidden active folders', () => {
    let state = createVaultSidebarTreeState({
      activeVaultId: 'vlt_1',
      currentFolderId: 'fld_2',
      folders,
    });

    expect(isVaultExpanded({ state, vaultId: 'vlt_1', activeVaultId: 'vlt_1', currentFolderId: 'fld_2' })).toBe(true);

    state = vaultSidebarTreeReducer(state, {
      type: 'toggleVault',
      vaultId: 'vlt_1',
      isExpanded: true,
      activeVaultId: 'vlt_1',
      currentFolderId: 'fld_2',
    });

    expect(isVaultExpanded({ state, vaultId: 'vlt_1', activeVaultId: 'vlt_1', currentFolderId: null })).toBe(false);
    expect(state.navigation).toEqual({ type: 'vaultRoot', vaultId: 'vlt_1' });
  });
});
