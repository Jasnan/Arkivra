"use client"

import type { DragEvent, MouseEvent, ReactNode } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronRight,
  FileText,
  Folder,
  FolderDot,
  FolderOpen,
  FolderOpenDot,
  Vault,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type {
  DocumentSummary,
  FileBrowserItem,
  FolderSummary,
  FolderTreeDocumentEntry,
  FolderTreeEntry,
} from "../vaults.api"

const ROOT_VALUE = "vaults-root"
const VAULT_VALUE_PREFIX = "vault:"
const FOLDER_VALUE_PREFIX = "folder:"
const DOCUMENT_VALUE_PREFIX = "document:"
const INTERNAL_BROWSER_DRAG_TYPE = "application/x-arkivra-browser-items"
const fallbackTimestamp = "1970-01-01T00:00:00.000Z"

export const VAULT_TREE_ROOT_VALUE = ROOT_VALUE

type BrowserDropTargetState = "valid" | "invalid"

interface BrowserDropTarget {
  folderId: string | null
  state: BrowserDropTargetState
}

type VaultTreeNode =
  | { id: string; name: string; type: "root"; children: VaultTreeNode[] }
  | {
      id: string
      name: string
      type: "vault"
      vaultId: string
      children?: VaultTreeNode[]
      childrenCount?: number
    }
  | {
      id: string
      name: string
      type: "folder"
      vaultId: string
      folder: FolderTreeEntry
      children?: VaultTreeNode[]
    }
  | {
      id: string
      name: string
      type: "document"
      vaultId: string
      document: FolderTreeDocumentEntry
    }

function rootValue() {
  return ROOT_VALUE
}

function vaultValue(vaultId: string) {
  return `${VAULT_VALUE_PREFIX}${vaultId}`
}

function folderValue(folderId: string) {
  return `${FOLDER_VALUE_PREFIX}${folderId}`
}

function documentValue(documentId: string) {
  return `${DOCUMENT_VALUE_PREFIX}${documentId}`
}

function folderTreeEntryToBrowserItem(vaultId: string, folder: FolderTreeEntry): FileBrowserItem {
  const folderSummary: FolderSummary = {
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
  }

  return { type: "folder", folder: folderSummary }
}

function treeNodeToBrowserItem(node: VaultTreeNode): FileBrowserItem | null {
  if (node.type === "folder") {
    return folderTreeEntryToBrowserItem(node.vaultId, node.folder)
  }

  if (node.type === "document") {
    return { type: "document", document: node.document }
  }

  return null
}

function sortByName<T extends { name: string; id: string }>(entries: T[]) {
  return [...entries].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    return nameComparison === 0 ? left.id.localeCompare(right.id) : nameComparison
  })
}

function buildFolderNodes({
  vaultId,
  foldersByParentId,
  documentsByFolderId,
  parentId,
}: {
  vaultId: string
  foldersByParentId: Map<string | null, FolderTreeEntry[]>
  documentsByFolderId: Map<string | null, FolderTreeDocumentEntry[]>
  parentId: string | null
}): VaultTreeNode[] {
  const childFolders = foldersByParentId.get(parentId) ?? []
  const childDocuments = documentsByFolderId.get(parentId) ?? []

  return [
    ...childFolders.map((folder): VaultTreeNode => {
      const children = buildFolderNodes({
        vaultId,
        foldersByParentId,
        documentsByFolderId,
        parentId: folder.id,
      })

      return {
        id: folderValue(folder.id),
        name: folder.name,
        type: "folder",
        vaultId,
        folder,
        children: children.length > 0 ? children : undefined,
      }
    }),
    ...childDocuments.map(
      (document): VaultTreeNode => ({
        id: documentValue(document.id),
        name: document.name,
        type: "document",
        vaultId,
        document,
      })
    ),
  ]
}

function createVaultTree({
  vaults,
  activeVaultId,
  activeVaultRootOnly,
  folders,
  documents,
}: {
  vaults: Array<{ id: string; name: string }>
  activeVaultId?: string | null
  activeVaultRootOnly?: boolean
  folders: FolderTreeEntry[]
  documents: FolderTreeDocumentEntry[]
}) {
  const foldersByParentId = new Map<string | null, FolderTreeEntry[]>()
  const documentsByFolderId = new Map<string | null, FolderTreeDocumentEntry[]>()

  for (const folder of folders) {
    const siblings = foldersByParentId.get(folder.parentId) ?? []
    siblings.push(folder)
    foldersByParentId.set(folder.parentId, siblings)
  }

  for (const document of documents) {
    const siblings = documentsByFolderId.get(document.folderId) ?? []
    siblings.push(document)
    documentsByFolderId.set(document.folderId, siblings)
  }

  for (const [parentId, childFolders] of foldersByParentId) {
    foldersByParentId.set(parentId, sortByName(childFolders))
  }

  for (const [folderId, childDocuments] of documentsByFolderId) {
    documentsByFolderId.set(folderId, sortByName(childDocuments))
  }

  const visibleVaults =
    activeVaultRootOnly && activeVaultId
      ? vaults.filter((vault) => vault.id === activeVaultId)
      : vaults
  const vaultNodes = visibleVaults.map((vault): VaultTreeNode => {
    const children =
      activeVaultId === vault.id
        ? buildFolderNodes({
            vaultId: vault.id,
            foldersByParentId,
            documentsByFolderId,
            parentId: null,
          })
        : []

    return {
      id: vaultValue(vault.id),
      name: vault.name,
      type: "vault",
      vaultId: vault.id,
      children,
      childrenCount: children.length || 1,
    }
  })

  return activeVaultRootOnly && activeVaultId
    ? vaultNodes
    : [
        {
          id: rootValue(),
          name: "Vaults",
          type: "root" as const,
          children: vaultNodes,
        },
      ]
}

function getFolderRevealValues(folderId: string | null, folders: FolderTreeEntry[]) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]))
  const revealValues: string[] = []
  let current = folderId === null ? null : foldersById.get(folderId)

  while (current) {
    revealValues.unshift(folderValue(current.id))
    current = current.parentId ? foldersById.get(current.parentId) : undefined
  }

  return revealValues
}

function uniqueValues(values: string[]) {
  return [...new Set(values)]
}

function getBrowserItemKey(item: FileBrowserItem) {
  return item.type === "folder" ? `folder-${item.folder.id}` : `document-${item.document.id}`
}

function getBrowserItemParentId(item: FileBrowserItem) {
  return item.type === "folder" ? item.folder.parentId : item.document.folderId
}

function isFolderDescendant({
  folders,
  folderId,
  candidateId,
}: {
  folders: FolderTreeEntry[]
  folderId: string
  candidateId: string
}) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  let current = byId.get(candidateId) ?? null
  const seen = new Set<string>()

  while (current !== null) {
    if (current.id === folderId) {
      return true
    }

    if (current.parentId === null || seen.has(current.id)) {
      return false
    }

    seen.add(current.id)
    current = byId.get(current.parentId) ?? null
  }

  return false
}

function hasInternalBrowserDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(INTERNAL_BROWSER_DRAG_TYPE)
}

function serializeBrowserDragItems(items: FileBrowserItem[]) {
  return JSON.stringify(
    items.map((item) => ({
      id: item.type === "folder" ? item.folder.id : item.document.id,
      type: item.type,
    }))
  )
}

function getBrowserDropValidation({
  canUpdateItems,
  itemMutationPending,
  destinationId,
  targets,
  folders,
}: {
  canUpdateItems: boolean
  itemMutationPending: boolean
  destinationId: string | null
  targets: FileBrowserItem[]
  folders: FolderTreeEntry[]
}): { valid: true } | { valid: false; message: string } {
  if (!canUpdateItems) {
    return { valid: false, message: "You do not have permission to move items." }
  }

  if (itemMutationPending) {
    return { valid: false, message: "Wait for the current file operation to finish." }
  }

  if (targets.length === 0) {
    return { valid: false, message: "No items selected to move." }
  }

  if (targets.every((target) => getBrowserItemParentId(target) === destinationId)) {
    return { valid: false, message: "Items are already in that folder." }
  }

  for (const target of targets) {
    if (target.type !== "folder") {
      continue
    }

    if (destinationId === target.folder.id) {
      return { valid: false, message: "A folder cannot be moved into itself." }
    }

    if (
      destinationId !== null &&
      isFolderDescendant({
        folders,
        folderId: target.folder.id,
        candidateId: destinationId,
      })
    ) {
      return { valid: false, message: "A folder cannot be moved into one of its descendants." }
    }
  }

  return { valid: true }
}

function getNodeIcon(node: VaultTreeNode, isExpanded = false): ReactNode {
  if (node.type === "document") {
    return <FileText className="size-4 text-blue-600 dark:text-blue-400" />
  }

  if (node.type === "vault") {
    return <Vault className="size-4 text-teal-600 dark:text-teal-300" strokeWidth={2.1} />
  }

  if (node.type === "root") {
    return isExpanded ? (
      <FolderOpenDot className="size-4 text-muted-foreground" strokeWidth={2.1} />
    ) : (
      <FolderDot className="size-4 text-muted-foreground" strokeWidth={2.1} />
    )
  }

  return isExpanded ? (
    <FolderOpen className="size-4 text-muted-foreground" strokeWidth={2.1} />
  ) : (
    <Folder className="size-4 text-muted-foreground" strokeWidth={2.1} />
  )
}

function getNodeChildren(node: VaultTreeNode) {
  return node.type === "document" ? undefined : node.children
}

function getDropDestinationId(node: VaultTreeNode, activeVaultId?: string | null) {
  if (node.type === "vault" && node.vaultId === activeVaultId) {
    return null
  }

  if (node.type === "folder" && node.vaultId === activeVaultId) {
    return node.folder.id
  }

  return undefined
}

function getTreeDropTargetClass(dropTarget: BrowserDropTarget | null, folderId: string | null) {
  if (dropTarget === null || dropTarget.folderId !== folderId) {
    return ""
  }

  return dropTarget.state === "valid"
    ? "bg-teal-500/15 text-teal-700 outline outline-1 outline-teal-500 dark:text-teal-200"
    : "bg-destructive/15 text-destructive outline outline-1 outline-destructive"
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
  onSelectVault,
  onSelectFolder,
  onSelectDocument,
  onOpenVaultContextMenu,
  canMoveItems = false,
  itemMutationPending = false,
  onMoveItems,
}: {
  vaults: Array<{ id: string; name: string }>
  activeVaultId?: string | null
  activeVaultRootOnly?: boolean
  expandedValue: string[]
  onExpandedValueChange: (expandedValue: string[]) => void
  currentFolderId: string | null
  currentDocumentId?: string | null
  folders: FolderTreeEntry[]
  documents: FolderTreeDocumentEntry[]
  onSelectVault: (vaultId: string) => void
  onSelectFolder: (folderId: string | null) => void
  onSelectDocument: (vaultId: string, documentId: string) => void
  onOpenVaultContextMenu?: (event: MouseEvent<HTMLElement>, vaultId: string) => void
  canMoveItems?: boolean
  itemMutationPending?: boolean
  onMoveItems?: (input: { targets: FileBrowserItem[]; destinationId: string | null }) => void
}) {
  const expandedValueRef = useRef(expandedValue)
  const [localDraggedItems, setLocalDraggedItems] = useState<FileBrowserItem[]>([])
  const [dropTarget, setDropTarget] = useState<BrowserDropTarget | null>(null)
  const draggedItems = localDraggedItems
  const tree = useMemo(
    () => createVaultTree({ vaults, activeVaultId, activeVaultRootOnly, folders, documents }),
    [activeVaultId, activeVaultRootOnly, documents, folders, vaults]
  )
  const activeDocumentFolderId = useMemo(
    () => documents.find((document) => document.id === currentDocumentId)?.folderId ?? null,
    [currentDocumentId, documents]
  )
  const selectedValue = useMemo(() => {
    if (currentDocumentId) return documentValue(currentDocumentId)
    if (currentFolderId) return folderValue(currentFolderId)
    if (activeVaultId) return vaultValue(activeVaultId)
    return rootValue()
  }, [activeVaultId, currentDocumentId, currentFolderId])
  const lockedExpandedValue = useMemo(() => {
    if (activeVaultRootOnly) return activeVaultId ? [vaultValue(activeVaultId)] : []
    return [rootValue()]
  }, [activeVaultId, activeVaultRootOnly])
  const effectiveExpandedValue = useMemo(
    () => uniqueValues([...expandedValue, ...lockedExpandedValue]),
    [expandedValue, lockedExpandedValue]
  )
  const draggedItemKeys = useMemo(
    () => new Set(draggedItems.map((item) => getBrowserItemKey(item))),
    [draggedItems]
  )

  useEffect(() => {
    expandedValueRef.current = expandedValue
  }, [expandedValue])

  useEffect(() => {
    if (!activeVaultId) return

    const folderIdToReveal = currentDocumentId ? activeDocumentFolderId : currentFolderId
    const valuesToExpand = [
      ...lockedExpandedValue,
      vaultValue(activeVaultId),
      ...getFolderRevealValues(folderIdToReveal, folders),
    ]
    const currentExpandedValue = expandedValueRef.current
    const nextExpandedValue = uniqueValues([...currentExpandedValue, ...valuesToExpand])
    const missingValues = nextExpandedValue.filter((value) => !currentExpandedValue.includes(value))

    if (missingValues.length > 0) {
      expandedValueRef.current = nextExpandedValue
      onExpandedValueChange(nextExpandedValue)
    }
  }, [
    activeDocumentFolderId,
    activeVaultId,
    currentDocumentId,
    currentFolderId,
    folders,
    lockedExpandedValue,
    onExpandedValueChange,
  ])

  const isLockedExpandedNode = (node: VaultTreeNode) => lockedExpandedValue.includes(node.id)

  const handleExpandedValueChange = (nextExpandedValue: string[]) => {
    const nextValue = uniqueValues([...nextExpandedValue, ...lockedExpandedValue])
    expandedValueRef.current = nextValue
    onExpandedValueChange(nextValue)
  }

  const handleItemClick = (node: VaultTreeNode) => {
    if (node.type === "root") return
    if (node.type === "vault") return onSelectVault(node.vaultId)
    if (node.type === "folder") return onSelectFolder(node.folder.id)
    onSelectDocument(node.vaultId, node.document.id)
  }

  const handleBranchClick = (node: VaultTreeNode) => {
    if (isLockedExpandedNode(node)) {
      handleItemClick(node)
      return
    }

    handleExpandedValueChange(
      effectiveExpandedValue.includes(node.id)
        ? expandedValue.filter((value) => value !== node.id)
        : [...expandedValue, node.id]
    )
    handleItemClick(node)
  }

  const getContextMenuHandler = (node: VaultTreeNode) =>
    node.type === "vault" && onOpenVaultContextMenu
      ? (event: MouseEvent<HTMLElement>) => onOpenVaultContextMenu(event, node.vaultId)
      : undefined

  const setActiveDropTarget = (folderId: string | null, state: BrowserDropTargetState) => {
    setDropTarget((previousDropTarget) => {
      if (previousDropTarget?.folderId === folderId && previousDropTarget.state === state) {
        return previousDropTarget
      }

      return { folderId, state }
    })
  }

  const getDropValidation = (destinationId: string | null) =>
    getBrowserDropValidation({
      canUpdateItems: canMoveItems,
      itemMutationPending,
      destinationId,
      targets: draggedItems,
      folders,
    })

  const handleDragStart = (event: DragEvent<HTMLElement>, node: VaultTreeNode) => {
    const item = treeNodeToBrowserItem(node)

    if (!item || !canMoveItems || itemMutationPending) {
      event.preventDefault()
      return
    }

    setLocalDraggedItems([item])
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", node.name)
    event.dataTransfer.setData(INTERNAL_BROWSER_DRAG_TYPE, serializeBrowserDragItems([item]))
  }

  const handleDragEnd = () => {
    setLocalDraggedItems([])
    setDropTarget(null)
  }

  const handleDragOver = (event: DragEvent<HTMLElement>, node: VaultTreeNode) => {
    const destinationId = getDropDestinationId(node, activeVaultId)

    if (destinationId === undefined || draggedItems.length === 0 || !hasInternalBrowserDrag(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const validation = getDropValidation(destinationId)
    event.dataTransfer.dropEffect = validation.valid ? "move" : "none"
    setActiveDropTarget(destinationId, validation.valid ? "valid" : "invalid")
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>, node: VaultTreeNode) => {
    const destinationId = getDropDestinationId(node, activeVaultId)

    if (destinationId === undefined || draggedItems.length === 0 || !hasInternalBrowserDrag(event)) {
      return
    }

    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return
    }

    setDropTarget((previousDropTarget) =>
      previousDropTarget?.folderId === destinationId ? null : previousDropTarget
    )
  }

  const handleDrop = (event: DragEvent<HTMLElement>, node: VaultTreeNode) => {
    const destinationId = getDropDestinationId(node, activeVaultId)

    if (destinationId === undefined || draggedItems.length === 0 || !hasInternalBrowserDrag(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const validation = getDropValidation(destinationId)
    setDropTarget(null)

    if (!validation.valid) {
      toast.warning(validation.message)
      return
    }

    onMoveItems?.({ targets: draggedItems, destinationId })
    setLocalDraggedItems([])
  }

  function renderNode(node: VaultTreeNode, depth: number) {
    const children = getNodeChildren(node)
    const isBranch = Boolean(children?.length)
    const isExpanded = effectiveExpandedValue.includes(node.id)
    const isSelected = selectedValue === node.id
    const showBranchIndicator = isBranch && !isLockedExpandedNode(node)
    const browserItem = treeNodeToBrowserItem(node)
    const isDragSource = browserItem !== null && draggedItemKeys.has(getBrowserItemKey(browserItem))
    const dropDestinationId = getDropDestinationId(node, activeVaultId)
    const dragDropClass =
      dropDestinationId !== undefined ? getTreeDropTargetClass(dropTarget, dropDestinationId) : ""

    return (
      <li key={node.id}>
        <button
          type="button"
          className={cn(
            "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            isSelected && "bg-accent text-accent-foreground",
            isDragSource && "opacity-55",
            dragDropClass
          )}
          style={{ paddingLeft: `${0.5 + depth * 0.875}rem` }}
          aria-expanded={isBranch ? isExpanded : undefined}
          aria-selected={isSelected}
          draggable={browserItem !== null && canMoveItems && !itemMutationPending}
          onClick={() => (isBranch ? handleBranchClick(node) : handleItemClick(node))}
          onContextMenu={getContextMenuHandler(node)}
          onDragStart={(event) => handleDragStart(event, node)}
          onDragEnd={handleDragEnd}
          onDragOver={(event) => handleDragOver(event, node)}
          onDragLeave={(event) => handleDragLeave(event, node)}
          onDrop={(event) => handleDrop(event, node)}
        >
          {showBranchIndicator ? (
            <ChevronRight
              className={cn("size-3.5 shrink-0 transition-transform", isExpanded && "rotate-90")}
              strokeWidth={2.2}
            />
          ) : (
            <span className="size-3.5 shrink-0" />
          )}
          <span className="shrink-0">{getNodeIcon(node, isExpanded)}</span>
          <span className="min-w-0 flex-1 truncate leading-tight">{node.name}</span>
        </button>
        {isBranch && isExpanded ? (
          <ul className="mt-1 space-y-1">
            {children?.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <nav aria-label="Vault file tree" className="text-sm">
      <ul className="space-y-1">{tree.map((node) => renderNode(node, 0))}</ul>
    </nav>
  )
}
