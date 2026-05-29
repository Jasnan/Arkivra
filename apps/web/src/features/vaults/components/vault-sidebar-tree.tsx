/* eslint-disable react-refresh/only-export-components */
import type { MouseEvent } from 'react';
import { useEffect, useMemo } from 'react';
import { TreeView, createTreeCollection } from '@chakra-ui/react';
import { useNavigate } from '@tanstack/react-router';
import { Folder, FolderDot, FolderOpen, FolderOpenDot, Vault } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { DocumentFileIcon } from '@/features/documents/components/document-file-icon';
import type { FolderTreeDocumentEntry, FolderTreeEntry } from '@/features/file-browser/file-browser.types';

const ROOT_VALUE = 'vaults-root';
const VAULT_VALUE_PREFIX = 'vault:';
const FOLDER_VALUE_PREFIX = 'folder:';
const DOCUMENT_VALUE_PREFIX = 'document:';

export const VAULT_TREE_ROOT_VALUE = ROOT_VALUE;

const vaultTreeItemStyles = {
  minH: '8',
  gap: '2',
  px: '2',
  rounded: 'md',
  color: 'fg.muted',
  transition: 'background-color 120ms ease, color 120ms ease',
  _hover: { bg: 'bg.muted', color: 'fg' },
  _selected: { bg: 'teal.subtle', color: 'teal.fg' },
} as const;

type VaultTreeNode =
  | { id: string; name: string; type: 'root'; children: VaultTreeNode[] }
  | { id: string; name: string; type: 'vault'; vaultId: string; children?: VaultTreeNode[]; childrenCount?: number }
  | { id: string; name: string; type: 'folder'; vaultId: string; folder: FolderTreeEntry; children?: VaultTreeNode[] }
  | { id: string; name: string; type: 'document'; vaultId: string; document: FolderTreeDocumentEntry };

function rootValue() {
  return ROOT_VALUE;
}

function vaultValue(vaultId: string) {
  return `${VAULT_VALUE_PREFIX}${vaultId}`;
}

export function getVaultTreeVaultId(value: string) {
  return value.startsWith(VAULT_VALUE_PREFIX) ? value.slice(VAULT_VALUE_PREFIX.length) : null;
}

function folderValue(folderId: string) {
  return `${FOLDER_VALUE_PREFIX}${folderId}`;
}

function documentValue(documentId: string) {
  return `${DOCUMENT_VALUE_PREFIX}${documentId}`;
}

function sortByName<T extends { name: string; id: string }>(entries: T[]) {
  return [...entries].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    return nameComparison === 0 ? left.id.localeCompare(right.id) : nameComparison;
  });
}

function buildFolderNodes({
  vaultId,
  foldersByParentId,
  documentsByFolderId,
  parentId,
}: {
  vaultId: string;
  foldersByParentId: Map<string | null, FolderTreeEntry[]>;
  documentsByFolderId: Map<string | null, FolderTreeDocumentEntry[]>;
  parentId: string | null;
}): VaultTreeNode[] {
  const childFolders = foldersByParentId.get(parentId) ?? [];
  const childDocuments = documentsByFolderId.get(parentId) ?? [];

  return [
    ...childFolders.map((folder): VaultTreeNode => {
      const children = buildFolderNodes({ vaultId, foldersByParentId, documentsByFolderId, parentId: folder.id });

      return {
        id: folderValue(folder.id),
        name: folder.name,
        type: 'folder',
        vaultId,
        folder,
        children: children.length > 0 ? children : undefined,
      };
    }),
    ...childDocuments.map((document): VaultTreeNode => ({
      id: documentValue(document.id),
      name: document.name,
      type: 'document',
      vaultId,
      document,
    })),
  ];
}

function createVaultTreeCollection({
  vaults,
  activeVaultId,
  activeVaultRootOnly,
  folders,
  documents,
}: {
  vaults: Array<{ id: string; name: string }>;
  activeVaultId?: string | null;
  activeVaultRootOnly?: boolean;
  folders: FolderTreeEntry[];
  documents: FolderTreeDocumentEntry[];
}) {
  const foldersByParentId = new Map<string | null, FolderTreeEntry[]>();
  const documentsByFolderId = new Map<string | null, FolderTreeDocumentEntry[]>();

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

  for (const [parentId, childFolders] of foldersByParentId) {
    foldersByParentId.set(parentId, sortByName(childFolders));
  }

  for (const [folderId, childDocuments] of documentsByFolderId) {
    documentsByFolderId.set(folderId, sortByName(childDocuments));
  }

  const visibleVaults = activeVaultRootOnly && activeVaultId
    ? vaults.filter(vault => vault.id === activeVaultId)
    : vaults;
  const vaultNodes = visibleVaults.map((vault): VaultTreeNode => {
    const children = activeVaultId === vault.id
      ? buildFolderNodes({ vaultId: vault.id, foldersByParentId, documentsByFolderId, parentId: null })
      : [];

    return {
      id: vaultValue(vault.id),
      name: vault.name,
      type: 'vault',
      vaultId: vault.id,
      children,
      childrenCount: children.length || 1,
    };
  });
  const rootNode: VaultTreeNode = {
    id: 'ROOT',
    name: '',
    type: 'root',
    children: activeVaultRootOnly && activeVaultId
      ? vaultNodes
      : [
          {
            id: rootValue(),
            name: 'Vaults',
            type: 'root',
            children: vaultNodes,
          },
        ],
  };

  return createTreeCollection<VaultTreeNode>({
    nodeToValue: node => node.id,
    nodeToString: node => node.name,
    rootNode,
  });
}

function getNodeIcon(node: VaultTreeNode, isExpanded = false) {
  if (node.type === 'document') {
    return <DocumentFileIcon name={node.document.name} mimeType={node.document.mimeType} iconSize={18} boxSize="5" />;
  }

  if (node.type === 'vault') {
    return <Vault size={18} strokeWidth={2.1} />;
  }

  if (node.type === 'root') {
    return isExpanded ? <FolderOpenDot size={18} strokeWidth={2.1} /> : <FolderDot size={18} strokeWidth={2.1} />;
  }

  return isExpanded ? <FolderOpen size={18} strokeWidth={2.1} /> : <Folder size={18} strokeWidth={2.1} />;
}

function getNodeNavigation(node: VaultTreeNode) {
  switch (node.type) {
    case 'root':
      return { to: ROUTES.vaults };
    case 'vault':
      return { to: ROUTES.vaultRoot(node.vaultId) };
    case 'folder':
      return { to: ROUTES.vaultRoot(node.vaultId), search: { folderId: node.folder.id } };
    case 'document':
      return { to: ROUTES.vaultDocument(node.vaultId, node.document.id) };
  }
}

function getFolderRevealValues(folderId: string | null, folders: FolderTreeEntry[]) {
  const foldersById = new Map(folders.map(folder => [folder.id, folder]));
  const revealValues: string[] = [];
  let current = folderId === null ? null : foldersById.get(folderId);

  while (current) {
    revealValues.unshift(folderValue(current.id));
    current = current.parentId ? foldersById.get(current.parentId) : undefined;
  }

  return revealValues;
}

export function VaultSidebarTree({
  vaults,
  activeVaultId,
  activeVaultRootOnly = false,
  expandedValue,
  onExpandedValueChange,
  currentFolderId,
  currentDocumentId,
  folders,
  documents,
  onOpenVaultContextMenu,
}: {
  vaults: Array<{ id: string; name: string }>;
  activeVaultId?: string | null;
  activeVaultRootOnly?: boolean;
  expandedValue: string[];
  onExpandedValueChange: (expandedValue: string[]) => void;
  currentFolderId: string | null;
  currentDocumentId?: string | null;
  folders: FolderTreeEntry[];
  documents: FolderTreeDocumentEntry[];
  onOpenVaultContextMenu?: (event: MouseEvent<HTMLElement>, vaultId: string) => void;
}) {
  const navigate = useNavigate();
  const collection = useMemo(
    () => createVaultTreeCollection({ vaults, activeVaultId, activeVaultRootOnly, folders, documents }),
    [activeVaultId, activeVaultRootOnly, documents, folders, vaults],
  );
  const activeDocumentFolderId = useMemo(
    () => documents.find(document => document.id === currentDocumentId)?.folderId ?? null,
    [currentDocumentId, documents],
  );
  const selectedValue = useMemo(() => {
    if (currentDocumentId) return [documentValue(currentDocumentId)];
    if (currentFolderId) return [folderValue(currentFolderId)];
    if (activeVaultId) return [vaultValue(activeVaultId)];
    return [rootValue()];
  }, [activeVaultId, currentDocumentId, currentFolderId]);

  useEffect(() => {
    if (!activeVaultId) return;

    const folderIdToReveal = currentDocumentId ? activeDocumentFolderId : currentFolderId;
    const valuesToExpand = [
      ...(activeVaultRootOnly ? [] : [rootValue()]),
      vaultValue(activeVaultId),
      ...getFolderRevealValues(folderIdToReveal, folders),
    ];
    const missingValues = valuesToExpand.filter(value => !expandedValue.includes(value));

    if (missingValues.length > 0) {
      onExpandedValueChange([...expandedValue, ...missingValues]);
    }
  }, [
    activeDocumentFolderId,
    activeVaultId,
    currentDocumentId,
    currentFolderId,
    expandedValue,
    folders,
    onExpandedValueChange,
  ]);

  const handleItemClick = (node: VaultTreeNode) => {
    const navigation = getNodeNavigation(node);
    void navigate({
      to: navigation.to,
      search: 'search' in navigation ? navigation.search as any : undefined,
    });
  };

  const handleBranchClick = (node: VaultTreeNode) => {
    onExpandedValueChange(
      expandedValue.includes(node.id)
        ? expandedValue.filter(value => value !== node.id)
        : [...expandedValue, node.id],
    );
    handleItemClick(node);
  };

  const getContextMenuHandler = (node: VaultTreeNode) => (
    node.type === 'vault' && onOpenVaultContextMenu
      ? (event: MouseEvent<HTMLElement>) => onOpenVaultContextMenu(event, node.vaultId)
      : undefined
  );

  return (
    <TreeView.Root
      collection={collection}
      maxW="sm"
      expandedValue={expandedValue}
      onExpandedChange={details => onExpandedValueChange(details.expandedValue)}
      selectedValue={selectedValue}
      expandOnClick={false}
      fontSize="sm"
    >
      <TreeView.Tree>
        <TreeView.Node<VaultTreeNode>
          indentGuide={<TreeView.BranchIndentGuide />}
          render={({ node, nodeState }) =>
            nodeState.isBranch ? (
              <TreeView.BranchControl
                onClick={() => handleBranchClick(node)}
                onContextMenu={getContextMenuHandler(node)}
                {...vaultTreeItemStyles}
              >
                {getNodeIcon(node, nodeState.expanded)}
                <TreeView.BranchText truncate fontSize="sm" lineHeight="1.25">{node.name}</TreeView.BranchText>
              </TreeView.BranchControl>
            ) : (
              <TreeView.Item
                onClick={() => handleItemClick(node)}
                onContextMenu={getContextMenuHandler(node)}
                {...vaultTreeItemStyles}
              >
                {getNodeIcon(node)}
                <TreeView.ItemText truncate fontSize="sm" lineHeight="1.25">{node.name}</TreeView.ItemText>
              </TreeView.Item>
            )
          }
        />
      </TreeView.Tree>
    </TreeView.Root>
  );
}
