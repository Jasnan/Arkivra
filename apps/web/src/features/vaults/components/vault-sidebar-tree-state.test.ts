import { describe, expect, it } from 'vitest';
import type { FolderTreeEntry } from '@/features/file-browser/file-browser.types';
import {
  createVaultSidebarTreeState,
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

function setValues(values: Set<string>) {
  return [...values].sort();
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
