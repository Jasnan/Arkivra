import { Fragment, useEffect, useMemo, useReducer } from 'react';
import { Stack } from '@chakra-ui/react';
import { useNavigate } from '@tanstack/react-router';
import { FileText, Folder, FolderDot, FolderOpen, FolderOpenDot } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { SecondaryNavLink } from '@/components/layout/secondary-nav-link';
import type { FolderTreeDocumentEntry, FolderTreeEntry } from '@/features/file-browser/file-browser.types';
import {
  createVaultSidebarTreeState,
  getExpandableFolderIds,
  getVisibleExpandedFolderIds,
  getVisibleVaultTreeItems,
  isVaultExpanded,
  vaultSidebarTreeReducer,
} from './vault-sidebar-tree-state';

function VaultRootIcon({ isExpanded }: { isExpanded: boolean }) {
  return isExpanded ? <FolderOpenDot size={16} strokeWidth={2.1} /> : <FolderDot size={16} strokeWidth={2.1} />;
}

function VaultNodeIcon({ isExpanded }: { isExpanded: boolean }) {
  return isExpanded ? <FolderOpenDot size={16} strokeWidth={2.1} /> : <FolderDot size={16} strokeWidth={2.1} />;
}

function VaultFolderIcon({ isExpanded }: { isExpanded: boolean }) {
  return isExpanded ? <FolderOpen size={16} strokeWidth={2.1} /> : <Folder size={16} strokeWidth={2.1} />;
}

function VaultTree({
  folders,
  documents,
  vaultId,
  currentFolderId,
  currentDocumentId,
  expandedFolderIds,
  onToggleFolder,
  depth = 0,
}: {
  folders: FolderTreeEntry[];
  documents: FolderTreeDocumentEntry[];
  vaultId: string;
  currentFolderId: string | null;
  currentDocumentId: string | null;
  expandedFolderIds: Set<string>;
  onToggleFolder: (folderId: string, isExpanded: boolean) => void;
  depth?: number;
}) {
  const expandableFolderIds = useMemo(() => getExpandableFolderIds(folders, documents), [documents, folders]);
  const visibleItems = useMemo(
    () => getVisibleVaultTreeItems({ folders, documents, expandedFolderIds }),
    [documents, expandedFolderIds, folders],
  );

  return (
    <Stack gap="1">
      {visibleItems.map((item) => {
        if (item.type === 'document') {
          return (
            <SecondaryNavLink
              key={item.document.id}
              to={ROUTES.vaultDocument(vaultId, item.document.id)}
              label={item.document.name}
              icon={<FileText size={16} />}
              active={currentDocumentId === item.document.id}
              depth={depth + item.document.depth}
              reserveDisclosureSpace
            />
          );
        }

        const folder = item.folder;
        const canExpand = expandableFolderIds.has(folder.id);
        const isExpanded = expandedFolderIds.has(folder.id);

        return (
          <SecondaryNavLink
            key={folder.id}
            to={ROUTES.vaultRoot(vaultId)}
            search={{ folderId: folder.id }}
            label={folder.name}
            icon={<VaultFolderIcon isExpanded={isExpanded} />}
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
  currentDocumentId,
  folders,
  documents,
}: {
  vaults: Array<{ id: string; name: string }>;
  activeVaultId?: string | null;
  currentFolderId: string | null;
  currentDocumentId?: string | null;
  folders: FolderTreeEntry[];
  documents: FolderTreeDocumentEntry[];
}) {
  const navigate = useNavigate();
  const activeDocumentId = currentDocumentId ?? null;
  const currentDocumentFolderId = useMemo(
    () => documents.find(document => document.id === activeDocumentId)?.folderId ?? null,
    [activeDocumentId, documents],
  );
  const currentTreeFolderId = currentFolderId ?? currentDocumentFolderId;
  const hasActiveDocument = activeDocumentId !== null;
  const [treeState, dispatch] = useReducer(
    vaultSidebarTreeReducer,
    { activeVaultId, currentFolderId, currentDocumentFolderId, folders },
    createVaultSidebarTreeState,
  );
  const visibleExpandedFolderIds = useMemo(
    () => getVisibleExpandedFolderIds({
      expandedFolderIds: treeState.expandedFolderIds,
      folders,
      currentFolderId,
      currentDocumentFolderId,
    }),
    [currentDocumentFolderId, currentFolderId, folders, treeState.expandedFolderIds],
  );

  useEffect(() => {
    dispatch({ type: 'routeChanged', activeVaultId, currentFolderId, currentDocumentFolderId, folders });
  }, [activeVaultId, currentDocumentFolderId, currentFolderId, folders]);

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
        icon={<VaultRootIcon isExpanded={treeState.isVaultRootExpanded} />}
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
          currentFolderId: currentTreeFolderId,
          hasActiveDocument,
        });

        return (
          <Fragment key={vault.id}>
            <SecondaryNavLink
              to={ROUTES.vaultRoot(vault.id)}
              label={vault.name}
              icon={<VaultNodeIcon isExpanded={isExpandedVault} />}
              active={isActiveVault && currentFolderId === null && !hasActiveDocument}
              depth={1}
              expansionState={isExpandedVault ? 'expanded' : 'collapsed'}
              onExpand={() => dispatch({
                type: 'toggleVault',
                vaultId: vault.id,
                isExpanded: false,
                activeVaultId,
                currentFolderId: currentTreeFolderId,
                hasActiveDocument,
              })}
              onCollapse={() => dispatch({
                type: 'toggleVault',
                vaultId: vault.id,
                isExpanded: true,
                activeVaultId,
                currentFolderId: currentTreeFolderId,
                hasActiveDocument,
              })}
            />
            {isActiveVault && isExpandedVault ? (
              <VaultTree
                folders={folders}
                documents={documents}
                vaultId={vault.id}
                currentFolderId={currentFolderId}
                currentDocumentId={activeDocumentId}
                expandedFolderIds={visibleExpandedFolderIds}
                onToggleFolder={(folderId, isExpanded) => dispatch({
                  type: 'toggleFolder',
                  folderId,
                  isExpanded,
                  activeVaultId,
                  currentFolderId: currentTreeFolderId,
                  hasActiveDocument,
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
