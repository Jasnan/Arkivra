import { Fragment, useEffect, useMemo, useReducer } from 'react';
import { Stack } from '@chakra-ui/react';
import { useNavigate } from '@tanstack/react-router';
import { Folder, FolderKanban, FolderOpen } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { SecondaryNavLink } from '@/components/layout/secondary-nav-link';
import type { FolderTreeEntry } from '@/features/file-browser/file-browser.types';
import {
  createVaultSidebarTreeState,
  getExpandableFolderIds,
  getVisibleExpandedFolderIds,
  getVisibleVaultTreeFolders,
  isVaultExpanded,
  vaultSidebarTreeReducer,
} from './vault-sidebar-tree-state';

function VaultRootIcon() {
  return <FolderKanban size={16} strokeWidth={2.1} />;
}

function VaultNodeIcon() {
  return <FolderKanban size={16} strokeWidth={2.1} />;
}

function VaultTree({
  folders,
  vaultId,
  currentFolderId,
  expandedFolderIds,
  onToggleFolder,
  depth = 0,
}: {
  folders: FolderTreeEntry[];
  vaultId: string;
  currentFolderId: string | null;
  expandedFolderIds: Set<string>;
  onToggleFolder: (folderId: string, isExpanded: boolean) => void;
  depth?: number;
}) {
  const expandableFolderIds = useMemo(() => getExpandableFolderIds(folders), [folders]);
  const visibleFolders = getVisibleVaultTreeFolders(folders, expandedFolderIds);

  return (
    <Stack gap="1">
      {visibleFolders.map((folder) => {
        const canExpand = expandableFolderIds.has(folder.id);
        const isExpanded = expandedFolderIds.has(folder.id);

        return (
          <SecondaryNavLink
            key={folder.id}
            to={ROUTES.vaultRoot(vaultId)}
            search={{ folderId: folder.id }}
            label={folder.name}
            icon={isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
            active={currentFolderId === folder.id}
            depth={depth + folder.depth}
            expansionState={canExpand ? (isExpanded ? 'expanded' : 'collapsed') : undefined}
            onExpand={canExpand ? () => onToggleFolder(folder.id, false) : undefined}
            onCollapse={canExpand ? () => onToggleFolder(folder.id, true) : undefined}
            reserveDisclosureSpace
          />
        );
      })}
    </Stack>
  );
}

export function VaultSidebarTree({
  vaults,
  activeVaultId,
  currentFolderId,
  folders,
}: {
  vaults: Array<{ id: string; name: string }>;
  activeVaultId?: string | null;
  currentFolderId: string | null;
  folders: FolderTreeEntry[];
}) {
  const navigate = useNavigate();
  const [treeState, dispatch] = useReducer(
    vaultSidebarTreeReducer,
    { activeVaultId, currentFolderId, folders },
    createVaultSidebarTreeState,
  );
  const visibleExpandedFolderIds = useMemo(
    () => getVisibleExpandedFolderIds({
      expandedFolderIds: treeState.expandedFolderIds,
      folders,
      currentFolderId,
    }),
    [currentFolderId, folders, treeState.expandedFolderIds],
  );

  useEffect(() => {
    dispatch({ type: 'routeChanged', activeVaultId, currentFolderId, folders });
  }, [activeVaultId, currentFolderId, folders]);

  useEffect(() => {
    if (treeState.navigation === null) return;

    if (treeState.navigation.type === 'vaultRoot') {
      void navigate({ to: ROUTES.vaultRoot(treeState.navigation.vaultId) });
    } else {
      void navigate({
        to: ROUTES.vaultRoot(treeState.navigation.vaultId),
        search: { folderId: treeState.navigation.folderId } as any,
      });
    }

    dispatch({ type: 'navigationHandled' });
  }, [navigate, treeState.navigation]);

  return (
    <Stack gap="1">
      <SecondaryNavLink
        to={ROUTES.vaults}
        label="Vaults"
        icon={<VaultRootIcon />}
        active={!activeVaultId}
        expansionState={treeState.isVaultRootExpanded ? 'expanded' : 'collapsed'}
        onExpand={() => dispatch({ type: 'toggleVaultRoot', isExpanded: false })}
        onCollapse={() => dispatch({ type: 'toggleVaultRoot', isExpanded: true })}
      />
      {treeState.isVaultRootExpanded ? vaults.map((vault) => {
        const isActiveVault = activeVaultId === vault.id;
        const isExpandedVault = isVaultExpanded({
          state: treeState,
          vaultId: vault.id,
          activeVaultId,
          currentFolderId,
        });

        return (
          <Fragment key={vault.id}>
            <SecondaryNavLink
              to={ROUTES.vaultRoot(vault.id)}
              label={vault.name}
              icon={<VaultNodeIcon />}
              active={isActiveVault && currentFolderId === null}
              depth={1}
              expansionState={isExpandedVault ? 'expanded' : 'collapsed'}
              onExpand={() => dispatch({
                type: 'toggleVault',
                vaultId: vault.id,
                isExpanded: false,
                activeVaultId,
                currentFolderId,
              })}
              onCollapse={() => dispatch({
                type: 'toggleVault',
                vaultId: vault.id,
                isExpanded: true,
                activeVaultId,
                currentFolderId,
              })}
            />
            {isActiveVault && isExpandedVault ? (
              <VaultTree
                folders={folders}
                vaultId={vault.id}
                currentFolderId={currentFolderId}
                expandedFolderIds={visibleExpandedFolderIds}
                onToggleFolder={(folderId, isExpanded) => dispatch({
                  type: 'toggleFolder',
                  folderId,
                  isExpanded,
                  activeVaultId,
                  currentFolderId,
                  folders,
                })}
                depth={2}
              />
            ) : null}
          </Fragment>
        );
      }) : null}
    </Stack>
  );
}
