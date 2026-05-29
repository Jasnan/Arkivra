/* eslint-disable react-refresh/only-export-components */
import type { DragEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TreeView, createTreeCollection } from '@chakra-ui/react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronRight, Folder, FolderDot, FolderOpen, FolderOpenDot, Vault } from 'lucide-react';
import { toast } from 'sonner';
import {
  INTERNAL_BROWSER_DRAG_TYPE,
  getBrowserDropValidation,
  hasInternalBrowserDrag,
  serializeBrowserDragItems,
} from '@/features/documents/hooks/use-browser-drag-drop';
import { ROUTES } from '@/app/routes';
import { DocumentFileIcon } from '@/features/documents/components/document-file-icon';
import { getBrowserItemKey } from '@/features/file-browser/components/vault-browser.types';
import type { BrowserDropTarget, BrowserItem } from '@/features/file-browser/components/vault-browser.types';
import { useOptionalVaultBrowserDragDrop } from '@/features/file-browser/components/vault-browser-drag-drop-context';
import type { FolderTreeDocumentEntry, FolderTreeEntry } from '@/features/file-browser/file-browser.types';

const ROOT_VALUE = 'vaults-root';
const VAULT_VALUE_PREFIX = 'vault:';
const FOLDER_VALUE_PREFIX = 'folder:';
const DOCUMENT_VALUE_PREFIX = 'document:';

export const VAULT_TREE_ROOT_VALUE = ROOT_VALUE;

const vaultTreeItemStyles = {
  minH: '8',
  gap: '2',
  pe: '2',
  rounded: 'md',
  color: 'fg.muted',
  transition: 'background-color 120ms ease, color 120ms ease',
  _hover: { bg: 'bg.muted', color: 'fg' },
  _selected: { bg: 'teal.subtle', color: 'teal.fg' },
} as const;

const treeBranchIndicatorStyles = {
  color: 'fg.subtle',
  flexShrink: 0,
  transition: 'transform 120ms ease, color 120ms ease',
} as const;

const fallbackTimestamp = '1970-01-01T00:00:00.000Z';

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

function folderTreeEntryToBrowserItem(vaultId: string, folder: FolderTreeEntry): BrowserItem {
  return {
    type: 'folder',
    folder: {
      id: folder.id,
      vaultId,
      parentId: folder.parentId,
      name: folder.name,
      createdBy: null,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      createdAt: fallbackTimestamp,
      updatedAt: fallbackTimestamp,
    },
  };
}

function treeNodeToBrowserItem(node: VaultTreeNode): BrowserItem | null {
  if (node.type === 'folder') {
    return folderTreeEntryToBrowserItem(node.vaultId, node.folder);
  }

  if (node.type === 'document') {
    return { type: 'document', document: node.document };
  }

  return null;
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

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function getTreeDropTargetStyles(dropTarget: BrowserDropTarget | null, folderId: string | null) {
  if (dropTarget === null || dropTarget.folderId !== folderId) {
    return {};
  }

  return dropTarget.state === 'valid'
    ? {
        bg: 'teal.subtle',
        color: 'teal.fg',
        outline: '1px solid',
        outlineColor: 'teal.solid',
      }
    : {
        bg: 'red.subtle',
        color: 'red.fg',
        outline: '1px solid',
        outlineColor: 'red.solid',
      };
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
  canMoveItems = false,
  itemMutationPending = false,
  onMoveItems,
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
  canMoveItems?: boolean;
  itemMutationPending?: boolean;
  onMoveItems?: (input: { targets: BrowserItem[]; destinationId: string | null }) => void;
}) {
  const navigate = useNavigate();
  const sharedDragDrop = useOptionalVaultBrowserDragDrop();
  const expandedValueRef = useRef(expandedValue);
  const [localDraggedItems, setLocalDraggedItems] = useState<BrowserItem[]>([]);
  const [dropTarget, setDropTarget] = useState<BrowserDropTarget | null>(null);
  const draggedItems = sharedDragDrop?.dragState.source
    ? sharedDragDrop.dragState.items
    : localDraggedItems;
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
  const lockedExpandedValue = useMemo(() => {
    if (activeVaultRootOnly) return activeVaultId ? [vaultValue(activeVaultId)] : [];
    return [rootValue()];
  }, [activeVaultId, activeVaultRootOnly]);
  const effectiveExpandedValue = useMemo(
    () => uniqueValues([...expandedValue, ...lockedExpandedValue]),
    [expandedValue, lockedExpandedValue],
  );

  useEffect(() => {
    expandedValueRef.current = expandedValue;
  }, [expandedValue]);

  useEffect(() => {
    if (!activeVaultId) return;

    const folderIdToReveal = currentDocumentId ? activeDocumentFolderId : currentFolderId;
    const valuesToExpand = [
      ...lockedExpandedValue,
      vaultValue(activeVaultId),
      ...getFolderRevealValues(folderIdToReveal, folders),
    ];
    const currentExpandedValue = expandedValueRef.current;
    const nextExpandedValue = uniqueValues([...currentExpandedValue, ...valuesToExpand]);
    const missingValues = nextExpandedValue.filter(value => !currentExpandedValue.includes(value));

    if (missingValues.length > 0) {
      expandedValueRef.current = nextExpandedValue;
      onExpandedValueChange(nextExpandedValue);
    }
  }, [
    activeDocumentFolderId,
    activeVaultId,
    currentDocumentId,
    currentFolderId,
    folders,
    lockedExpandedValue,
    onExpandedValueChange,
  ]);

  const isLockedExpandedNode = (node: VaultTreeNode) => lockedExpandedValue.includes(node.id);
  const draggedItemKeys = useMemo(
    () => new Set(draggedItems.map(item => getBrowserItemKey(item))),
    [draggedItems],
  );

  const handleExpandedValueChange = (nextExpandedValue: string[]) => {
    const nextValue = uniqueValues([...nextExpandedValue, ...lockedExpandedValue]);
    expandedValueRef.current = nextValue;
    onExpandedValueChange(nextValue);
  };

  const handleItemClick = (node: VaultTreeNode) => {
    const navigation = getNodeNavigation(node);
    void navigate({
      to: navigation.to,
      search: 'search' in navigation ? navigation.search as any : undefined,
    });
  };

  const handleBranchClick = (node: VaultTreeNode) => {
    if (isLockedExpandedNode(node)) {
      handleItemClick(node);
      return;
    }

    handleExpandedValueChange(
      effectiveExpandedValue.includes(node.id)
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

  const getDropDestinationId = (node: VaultTreeNode) => {
    if (node.type === 'vault' && node.vaultId === activeVaultId) {
      return null;
    }

    if (node.type === 'folder' && node.vaultId === activeVaultId) {
      return node.folder.id;
    }

    return undefined;
  };

  const setActiveDropTarget = (folderId: string | null, state: BrowserDropTarget['state']) => {
    setDropTarget((previousDropTarget) => {
      if (previousDropTarget?.folderId === folderId && previousDropTarget.state === state) {
        return previousDropTarget;
      }

      return { folderId, state };
    });
  };

  const getDropValidation = (destinationId: string | null) => getBrowserDropValidation({
    canUpdateItems: canMoveItems,
    itemMutationPending,
    destinationId,
    targets: draggedItems,
    folders,
  });

  const handleDragStart = (event: DragEvent<HTMLElement>, node: VaultTreeNode) => {
    const item = treeNodeToBrowserItem(node);

    if (!item || !canMoveItems || itemMutationPending) {
      event.preventDefault();
      return;
    }

    setLocalDraggedItems([item]);
    sharedDragDrop?.startDrag('tree', [item]);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.name);
    event.dataTransfer.setData(INTERNAL_BROWSER_DRAG_TYPE, serializeBrowserDragItems([item]));
  };

  const handleDragEnd = () => {
    setLocalDraggedItems([]);
    sharedDragDrop?.clearDrag('tree');
    setDropTarget(null);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>, node: VaultTreeNode) => {
    const destinationId = getDropDestinationId(node);

    if (destinationId === undefined || draggedItems.length === 0 || !hasInternalBrowserDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const validation = getDropValidation(destinationId);
    event.dataTransfer.dropEffect = validation.valid ? 'move' : 'none';
    setActiveDropTarget(destinationId, validation.valid ? 'valid' : 'invalid');
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>, node: VaultTreeNode) => {
    const destinationId = getDropDestinationId(node);

    if (destinationId === undefined || draggedItems.length === 0 || !hasInternalBrowserDrag(event)) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return;
    }

    setDropTarget(previousDropTarget => previousDropTarget?.folderId === destinationId ? null : previousDropTarget);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, node: VaultTreeNode) => {
    const destinationId = getDropDestinationId(node);

    if (destinationId === undefined || draggedItems.length === 0 || !hasInternalBrowserDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const validation = getDropValidation(destinationId);
    setDropTarget(null);

    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    onMoveItems?.({ targets: draggedItems, destinationId });
    setLocalDraggedItems([]);
    sharedDragDrop?.clearDrag(sharedDragDrop?.dragState.source ?? 'tree');
  };

  return (
    <TreeView.Root
      collection={collection}
      maxW="sm"
      expandedValue={effectiveExpandedValue}
      onExpandedChange={details => handleExpandedValueChange(details.expandedValue)}
      selectedValue={selectedValue}
      expandOnClick={false}
      fontSize="sm"
    >
      <TreeView.Tree>
        <TreeView.Node<VaultTreeNode>
          indentGuide={<TreeView.BranchIndentGuide />}
          render={({ node, nodeState }) => {
            const isExpanded = effectiveExpandedValue.includes(node.id);
            const showBranchIndicator = !isLockedExpandedNode(node);
            const browserItem = treeNodeToBrowserItem(node);
            const isDragSource = browserItem !== null && draggedItemKeys.has(getBrowserItemKey(browserItem));
            const dropDestinationId = getDropDestinationId(node);
            const dragDropProps = {
              draggable: browserItem !== null && canMoveItems && !itemMutationPending,
              opacity: isDragSource ? 0.55 : undefined,
              onDragStart: (event: DragEvent<HTMLElement>) => handleDragStart(event, node),
              onDragEnd: handleDragEnd,
              onDragOver: (event: DragEvent<HTMLElement>) => handleDragOver(event, node),
              onDragLeave: (event: DragEvent<HTMLElement>) => handleDragLeave(event, node),
              onDrop: (event: DragEvent<HTMLElement>) => handleDrop(event, node),
              ...(dropDestinationId !== undefined ? getTreeDropTargetStyles(dropTarget, dropDestinationId) : {}),
            };

            return nodeState.isBranch ? (
              <TreeView.BranchControl
                onClick={() => handleBranchClick(node)}
                onContextMenu={getContextMenuHandler(node)}
                {...vaultTreeItemStyles}
                {...dragDropProps}
              >
                {showBranchIndicator ? (
                  <TreeView.BranchIndicator
                    {...treeBranchIndicatorStyles}
                    color={isExpanded ? 'fg.muted' : undefined}
                    transform={isExpanded ? 'rotate(90deg)' : undefined}
                  >
                    <ChevronRight size={14} strokeWidth={2.2} />
                  </TreeView.BranchIndicator>
                ) : null}
                {getNodeIcon(node, isExpanded)}
                <TreeView.BranchText truncate fontSize="sm" lineHeight="1.25">{node.name}</TreeView.BranchText>
              </TreeView.BranchControl>
            ) : (
              <TreeView.Item
                onClick={() => handleItemClick(node)}
                onContextMenu={getContextMenuHandler(node)}
                {...vaultTreeItemStyles}
                {...dragDropProps}
              >
                {getNodeIcon(node)}
                <TreeView.ItemText truncate fontSize="sm" lineHeight="1.25">{node.name}</TreeView.ItemText>
              </TreeView.Item>
            );
          }}
        />
      </TreeView.Tree>
    </TreeView.Root>
  );
}
