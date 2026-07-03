"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type InputHTMLAttributes, type MouseEvent, type ReactNode } from "react"
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  HardDrive,
  Home,
  MoveRight,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { DEFAULT_TAG_COLOR, TagFormDialog } from "../tags/components/tag-form-dialog"
import {
  assignTagToDocument,
  createTag,
  listDocumentTags,
  listTags,
  removeTagFromDocument,
  type Tag,
} from "../tags/tags.api"
import { uploadManager } from "../transfers/upload-manager"
import { CreateFolderDialog } from "./components/create-folder-dialog"
import {
  VaultBrowserItemContextMenu,
  type VaultBrowserItemContextMenuState,
} from "./components/vault-browser-item-context-menu"
import { VaultContextMenu, type VaultContextMenuState } from "./components/vault-context-menu"
import { VaultUploadMenu } from "./components/vault-upload-menu"
import { VaultsViewToggle } from "./components/vaults-view-toggle"
import { getDocumentFileIcon } from "./document-file-icons"
import {
  UPLOAD_ACCEPT_ATTRIBUTE,
  type UploadFileInput,
} from "./upload-file-rules"
import {
  getDocument,
  getDocumentDownloadUrl,
  getMe,
  listFolderItems,
  moveDocument,
  moveFolder,
  renameDocument,
  renameFolder,
  softDeleteDocument,
  softDeleteFolder,
  type DocumentSummary,
  type DocumentSemanticIndexSummary,
  type DocumentDetail,
  type FileBrowserItem,
  type FolderSummary,
  type FolderTreeEntry,
} from "./vaults.api"
import { useVaultRouteShell } from "./vault-route-shell"
import { useVaultsView } from "./use-vaults-view"

const DIRECTORY_PICKER_ATTRIBUTES = {
  directory: "",
  webkitdirectory: "",
} as InputHTMLAttributes<HTMLInputElement>
const INTERNAL_BROWSER_DRAG_TYPE = "application/x-arkivra-browser-items"

type BrowserDropTargetState = "valid" | "invalid"

interface BrowserDropTarget {
  folderId: string | null
  state: BrowserDropTargetState
}

interface BrowserSelectionState {
  folderId: string | null
  keys: Set<string>
  lastKey: string | null
}

interface MoveDestination {
  id: string | null
  name: string
  label: string
  depth: number
}

interface DroppedFileSystemEntry {
  name: string
  fullPath?: string
  isFile: boolean
  isDirectory: boolean
}

interface DroppedFileSystemFileEntry extends DroppedFileSystemEntry {
  isFile: true
  file: (successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void
}

interface DroppedFileSystemDirectoryEntry extends DroppedFileSystemEntry {
  isDirectory: true
  createReader: () => {
    readEntries: (
      successCallback: (entries: DroppedFileSystemEntry[]) => void,
      errorCallback?: (error: DOMException) => void
    ) => void
  }
}

const EMPTY_SELECTED_ITEM_KEYS = new Set<string>()

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)

  return `${formatted} ${units[exponent]}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function itemName(item: FileBrowserItem) {
  return item.type === "folder" ? item.folder.name : item.document.name
}

function sortItems(items: FileBrowserItem[]) {
  return [...items].sort((left, right) => {
    if (left.type !== right.type) return left.type === "folder" ? -1 : 1
    return itemName(left).localeCompare(itemName(right))
  })
}

function getBrowserItemKey(item: FileBrowserItem) {
  return item.type === "folder" ? `folder-${item.folder.id}` : `document-${item.document.id}`
}

function getBrowserItemParentId(item: FileBrowserItem) {
  return item.type === "folder" ? item.folder.parentId : item.document.folderId
}

function getCommonBrowserItemParentId(items: FileBrowserItem[]) {
  if (items.length === 0) {
    return null
  }

  const firstItem = items[0]
  if (!firstItem) {
    return null
  }

  const firstParentId = getBrowserItemParentId(firstItem)

  return items.every((item) => getBrowserItemParentId(item) === firstParentId)
    ? firstParentId
    : undefined
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

function serializeBrowserDragItems(items: FileBrowserItem[]) {
  return JSON.stringify(
    items.map((item) => ({
      id: item.type === "folder" ? item.folder.id : item.document.id,
      type: item.type,
    }))
  )
}

function getMoveDestinations({
  folders,
  targets,
}: {
  folders: FolderTreeEntry[]
  targets: FileBrowserItem[]
}): MoveDestination[] {
  const selectedFolders = targets.filter(
    (item): item is Extract<FileBrowserItem, { type: "folder" }> => item.type === "folder"
  )
  const allowedFolders =
    selectedFolders.length > 0
      ? folders.filter((folder) =>
          selectedFolders.every(
            (target) =>
              folder.id !== target.folder.id &&
              !isFolderDescendant({ folders, folderId: target.folder.id, candidateId: folder.id })
          )
        )
      : folders

  return [
    { id: null, name: "Vault root", label: "Vault root", depth: 0 },
    ...allowedFolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      label: folder.path,
      depth: folder.depth + 1,
    })),
  ]
}

function canReadVault(vault: { role?: string | null } | null | undefined) {
  return vault?.role === "owner" || vault?.role === "editor" || vault?.role === "viewer"
}

function getVaultChatUrl(vaultId: string) {
  return `/chat?vaultId=${encodeURIComponent(vaultId)}`
}

function getDocumentChatUrl({
  vaultId,
  documentId,
  documentName,
}: {
  vaultId: string
  documentId: string
  documentName?: string
}) {
  const params = new URLSearchParams({
    vaultId,
    documentId,
  })

  if (documentName?.trim()) {
    params.set("documentName", documentName)
  }

  return `/chat?${params.toString()}`
}

function getVaultItemLocationPath({
  item,
  folders,
  vaultName,
}: {
  item: FileBrowserItem
  folders: FolderTreeEntry[]
  vaultName: string
}) {
  const rootName = vaultName.trim() || "Vault"
  const pathSegments = [rootName]

  if (item.type === "folder") {
    const folderPath = folders.find((folder) => folder.id === item.folder.id)?.path

    if (folderPath) {
      pathSegments.push(...folderPath.split("/").filter(Boolean))
    } else {
      const parentPath = item.folder.parentId
        ? folders.find((folder) => folder.id === item.folder.parentId)?.path
        : null

      if (parentPath) {
        pathSegments.push(...parentPath.split("/").filter(Boolean))
      }
      pathSegments.push(item.folder.name)
    }
  } else {
    const parentPath = item.document.folderId
      ? folders.find((folder) => folder.id === item.document.folderId)?.path
      : null

    if (parentPath) {
      pathSegments.push(...parentPath.split("/").filter(Boolean))
    }
  }

  return `/${pathSegments.join("/")}`
}

function getMoveDialogTitle(targets: FileBrowserItem[]) {
  if (targets.length === 1) {
    return `Move ${itemName(targets[0]!)}`
  }

  return `Move ${targets.length} items`
}

function getDeleteConfirmTitle(items: FileBrowserItem[]) {
  if (items.length === 1) {
    return `Move "${itemName(items[0]!)}" to trash?`
  }

  return `Move ${items.length} items to trash?`
}

function getDeleteConfirmDescription(items: FileBrowserItem[]) {
  const hasFolder = items.some((item) => item.type === "folder")

  if (items.length === 1) {
    return hasFolder
      ? "This folder and its contents will be moved to Trash."
      : "This document will be moved to Trash."
  }

  return hasFolder
    ? "The selected folders, their contents, and selected documents will be moved to Trash."
    : "The selected documents will be moved to Trash."
}

function hasInternalBrowserDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(INTERNAL_BROWSER_DRAG_TYPE)
}

function hasExternalFileDrag(event: DragEvent<HTMLElement>) {
  const types = Array.from(event.dataTransfer.types)
  return types.includes("Files") && !types.includes(INTERNAL_BROWSER_DRAG_TYPE)
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

function getFolderDropTargetClass(dropTarget: BrowserDropTarget | null, folderId: string) {
  if (dropTarget === null || dropTarget.folderId !== folderId) {
    return ""
  }

  return dropTarget.state === "valid"
    ? "border-teal-500 bg-teal-500/10 ring-2 ring-teal-500/30"
    : "border-destructive bg-destructive/10 ring-2 ring-destructive/30"
}

function getUploadRelativePath(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return relativePath && relativePath.length > 0 ? relativePath : null
}

function normalizeDroppedRelativePath(path: string | null | undefined) {
  const normalizedPath = path?.replace(/^\/+/, "").trim()
  return normalizedPath && normalizedPath.length > 0 ? normalizedPath : null
}

function getRelativePathForDroppedEntry(entry: DroppedFileSystemEntry, fallbackPath: string) {
  return normalizeDroppedRelativePath(entry.fullPath) ?? normalizeDroppedRelativePath(fallbackPath)
}

function isDroppedFileEntry(entry: DroppedFileSystemEntry): entry is DroppedFileSystemFileEntry {
  return entry.isFile
}

function isDroppedDirectoryEntry(entry: DroppedFileSystemEntry): entry is DroppedFileSystemDirectoryEntry {
  return entry.isDirectory
}

function readDroppedFile(entry: DroppedFileSystemFileEntry, relativePath: string) {
  return new Promise<UploadFileInput>((resolve, reject) => {
    entry.file(
      (file) => resolve({ file, relativePath }),
      (error) => reject(error)
    )
  })
}

function readDroppedDirectoryEntries(entry: DroppedFileSystemDirectoryEntry) {
  const reader = entry.createReader()
  const entries: DroppedFileSystemEntry[] = []

  return new Promise<DroppedFileSystemEntry[]>((resolve, reject) => {
    function readNextBatch() {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries)
            return
          }

          entries.push(...batch)
          readNextBatch()
        },
        (error) => reject(error)
      )
    }

    readNextBatch()
  })
}

async function collectDroppedEntryFiles(entry: DroppedFileSystemEntry, fallbackPath: string): Promise<UploadFileInput[]> {
  const relativePath = getRelativePathForDroppedEntry(entry, fallbackPath)

  if (isDroppedFileEntry(entry)) {
    return [await readDroppedFile(entry, relativePath ?? entry.name)]
  }

  if (!isDroppedDirectoryEntry(entry)) {
    return []
  }

  const childEntries = await readDroppedDirectoryEntries(entry)
  const childFiles = await Promise.all(
    childEntries.map((childEntry) =>
      collectDroppedEntryFiles(childEntry, `${relativePath ?? entry.name}/${childEntry.name}`)
    )
  )

  return childFiles.flat()
}

async function getDroppedUploadFiles(dataTransfer: DataTransfer): Promise<UploadFileInput[]> {
  const entries = Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry() as DroppedFileSystemEntry | null)
    .filter((entry): entry is DroppedFileSystemEntry => entry !== null && entry !== undefined)

  if (entries.length > 0) {
    const files = await Promise.all(entries.map((entry) => collectDroppedEntryFiles(entry, entry.name)))
    return files.flat()
  }

  return Array.from(dataTransfer.files).map((file) => ({
    file,
    relativePath: getUploadRelativePath(file),
  }))
}

function MoveItemsDialog({
  open,
  targets,
  value,
  destinations,
  isPending,
  isLoading,
  onValueChange,
  onClose,
  onSubmit,
}: {
  open: boolean
  targets: FileBrowserItem[]
  value: string | null
  destinations: MoveDestination[]
  isPending: boolean
  isLoading: boolean
  onValueChange: (value: string | null) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const filteredDestinations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase()

    if (normalizedQuery.length === 0) {
      return destinations
    }

    return destinations.filter((destination) =>
      `${destination.name} ${destination.label}`.toLocaleLowerCase().includes(normalizedQuery)
    )
  }, [destinations, searchQuery])
  const currentDestinationId = getCommonBrowserItemParentId(targets)
  const selectedDestination =
    destinations.find((destination) => destination.id === value) ?? destinations[0] ?? null
  const canSubmitMove =
    !isLoading &&
    !isPending &&
    targets.length > 0 &&
    selectedDestination !== null &&
    value === selectedDestination.id &&
    (currentDestinationId === undefined || value !== currentDestinationId)

  useEffect(() => {
    if (!open) {
      setSearchQuery("")
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPending) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{getMoveDialogTitle(targets)}</DialogTitle>
          <DialogDescription>Select the folder where these items should live.</DialogDescription>
        </DialogHeader>
        <form id="move-items-form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label htmlFor="move-folder-search" className="text-sm font-medium">
              Search folders
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="move-folder-search"
                value={searchQuery}
                disabled={isLoading || isPending}
                className="pl-9"
                placeholder="Find a destination"
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                  }
                }}
              />
            </div>
          </div>
          <div
            role="listbox"
            aria-label="Move destination"
            className="h-80 overflow-auto rounded-md border bg-background"
          >
            {isLoading ? (
              <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
                Loading folders...
              </div>
            ) : filteredDestinations.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-sm text-muted-foreground">
                No folders found.
              </div>
            ) : (
              filteredDestinations.map((destination) => {
                const isSelected = destination.id === value
                const isCurrent =
                  currentDestinationId !== undefined && destination.id === currentDestinationId

                return (
                  <button
                    key={destination.id ?? "__vault_root__"}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={isPending}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected && "bg-accent"
                    )}
                    onClick={() => onValueChange(destination.id)}
                  >
                    <div
                      className="flex min-w-0 flex-1 items-center gap-3"
                      style={{ paddingLeft: `${Math.min(destination.depth, 8) * 0.75}rem` }}
                    >
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                        {destination.id === null ? <Home className="size-4" /> : <Folder className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{destination.name}</span>
                          {isCurrent ? (
                            <span className="shrink-0 text-xs text-muted-foreground">Current</span>
                          ) : null}
                        </div>
                        {destination.label !== destination.name ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {destination.label}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Check
                      className={cn("size-4 shrink-0", isSelected ? "text-primary" : "text-transparent")}
                      strokeWidth={2.5}
                    />
                  </button>
                )
              })
            )}
          </div>
          {selectedDestination ? (
            <p className="text-sm text-muted-foreground">Destination: {selectedDestination.label}</p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="move-items-form" disabled={!canSubmitMove}>
            {isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SelectedItemsActionBar({
  selectedCount,
  canMoveItems,
  canDeleteItems,
  itemMutationPending,
  onMove,
  onDelete,
}: {
  selectedCount: number
  canMoveItems: boolean
  canDeleteItems: boolean
  itemMutationPending: boolean
  onMove: () => void
  onDelete: () => void
}) {
  if (selectedCount === 0) {
    return null
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-lg">
        <span className="px-2 text-sm font-medium">{selectedCount} selected</span>
        <div className="h-5 w-px bg-border" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canMoveItems || itemMutationPending}
          onClick={onMove}
        >
          <MoveRight className="size-4" />
          Move to
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canDeleteItems || itemMutationPending}
          onClick={onDelete}
        >
          <Trash2 className="size-4 text-destructive" />
          Delete
        </Button>
      </div>
    </div>
  )
}

function DeleteItemsConfirmDialog({
  items,
  isPending,
  onClose,
  onConfirm,
}: {
  items: FileBrowserItem[]
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open={items.length > 0}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{getDeleteConfirmTitle(items)}</DialogTitle>
          <DialogDescription>{getDeleteConfirmDescription(items)}</DialogDescription>
        </DialogHeader>
        <div className="max-h-56 overflow-auto rounded-md border bg-muted/20 p-3">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {items.map((item) => (
              <li key={getBrowserItemKey(item)} className="break-words">
                {itemName(item)}
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Moving..." : "Trash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function getItemKindLabel(item: FileBrowserItem) {
  return item.type === "folder" ? "Folder" : "Document"
}

function getItemId(item: FileBrowserItem) {
  return item.type === "folder" ? item.folder.id : item.document.id
}

function getDocumentIndexingStatusLabel(document: DocumentSummary & { semanticIndex?: DocumentSemanticIndexSummary | null }) {
  const semanticIndex = document.semanticIndex

  if (!semanticIndex) return "Not Indexed"

  return semanticIndex.expectedChunkCount > 0 &&
    semanticIndex.embeddedChunkCount >= semanticIndex.expectedChunkCount
    ? "Indexed"
    : "Not Indexed"
}

function getDocumentParsingStatusLabel(document: DocumentSummary) {
  const status = document.processingStatus ?? "unknown"
  return `${status.charAt(0).toLocaleUpperCase()}${status.slice(1)}`
}

function getDocumentTagsLabel(document: DocumentSummary) {
  const tags = document.tags ?? []
  if (tags.length === 0) return "None"

  return tags.map((tag) => tag.name).join(", ")
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr className="border-b last:border-b-0">
      <th scope="row" className="w-36 bg-muted/30 px-3 py-2 text-left align-top text-xs font-medium uppercase text-muted-foreground">
        {label}
      </th>
      <td className="min-w-0 break-words px-3 py-2 align-top text-sm font-medium">{value}</td>
    </tr>
  )
}

function RenameItemDialog({
  target,
  value,
  isPending,
  onValueChange,
  onClose,
  onSubmit,
}: {
  target: FileBrowserItem | null
  value: string
  isPending: boolean
  onValueChange: (value: string) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const targetType = target?.type ?? "item"
  const originalName = target ? itemName(target) : ""
  const canSubmit = value.trim().length > 0 && value.trim() !== originalName && !isPending

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Rename ${targetType}`}</DialogTitle>
          <DialogDescription>Change the display name used in this vault.</DialogDescription>
        </DialogHeader>
        <form id="rename-item-form" className="space-y-3" onSubmit={onSubmit}>
          <label htmlFor="rename-item-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="rename-item-name"
            autoFocus
            value={value}
            maxLength={255}
            disabled={isPending}
            onChange={(event) => onValueChange(event.target.value)}
          />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="rename-item-form" disabled={!canSubmit}>
            {isPending ? "Renaming..." : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ItemInfoDialog({
  target,
  location,
  vaultId,
  onClose,
}: {
  target: FileBrowserItem | null
  location: string
  vaultId: string
  onClose: () => void
}) {
  const [documentDetail, setDocumentDetail] = useState<DocumentDetail | null>(null)
  const [isLoadingDocumentDetail, setIsLoadingDocumentDetail] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadDocumentDetail() {
      if (target?.type !== "document" || !vaultId) {
        setDocumentDetail(null)
        setIsLoadingDocumentDetail(false)
        return
      }

      setIsLoadingDocumentDetail(true)

      try {
        const result = await getDocument({ vaultId, documentId: target.document.id })
        if (!ignore) {
          setDocumentDetail(result.document)
        }
      } catch {
        if (!ignore) {
          setDocumentDetail(null)
        }
      } finally {
        if (!ignore) {
          setIsLoadingDocumentDetail(false)
        }
      }
    }

    void loadDocumentDetail()

    return () => {
      ignore = true
    }
  }, [target, vaultId])

  const infoDocument = target?.type === "document" ? (documentDetail ?? target.document) : null

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Info</DialogTitle>
        </DialogHeader>
        {target ? (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <tbody>
                {target.type === "document" ? (
                  <>
                    <InfoRow label="ID" value={target.document.id} />
                    <InfoRow label="File name" value={target.document.originalName} />
                    <InfoRow label="Display name" value={target.document.name} />
                    <InfoRow label="MIME type" value={target.document.mimeType} />
                    <InfoRow label="Created" value={formatDate(target.document.createdAt)} />
                    <InfoRow label="Location" value={location} />
                    <InfoRow
                      label="Status"
                      value={
                        <span className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            <span className="text-muted-foreground">Parsing:</span>{" "}
                            {getDocumentParsingStatusLabel(target.document)}
                          </span>
                          <span>
                            <span className="text-muted-foreground">Indexing:</span>{" "}
                            {isLoadingDocumentDetail || infoDocument === null
                              ? "Loading..."
                              : getDocumentIndexingStatusLabel(infoDocument)}
                          </span>
                        </span>
                      }
                    />
                    <InfoRow label="Size" value={formatBytes(target.document.originalSize)} />
                    <InfoRow label="Tags" value={getDocumentTagsLabel(target.document)} />
                  </>
                ) : (
                  <>
                    <InfoRow label="ID" value={getItemId(target)} />
                    <InfoRow label="Name" value={itemName(target)} />
                    <InfoRow label="Type" value={getItemKindLabel(target)} />
                    <InfoRow label="Location" value={location} />
                    <InfoRow label="Created" value={formatDate(target.folder.createdAt)} />
                    <InfoRow label="Updated" value={formatDate(target.folder.updatedAt)} />
                  </>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TagPill({
  name,
  color,
  subtle = false,
}: {
  name: string
  color: string | null
  subtle?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-32 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
        subtle ? "text-muted-foreground" : "bg-secondary text-secondary-foreground"
      )}
    >
      {subtle ? null : (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color ?? "#94a3b8" }}
        />
      )}
      <span className="truncate">{name}</span>
    </span>
  )
}

function getTagCheckboxColor(color: string | null) {
  return color ?? DEFAULT_TAG_COLOR
}

function getTagCheckboxCheckColor(color: string | null) {
  const hex = getTagCheckboxColor(color).replace("#", "")

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return "#ffffff"
  }

  const red = Number.parseInt(hex.slice(0, 2), 16) / 255
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue

  return luminance > 0.58 ? "#111827" : "#ffffff"
}

function DocumentTagsCell({
  document,
  availableTags,
  disabled,
  onAssignTag,
  onOpenCreateTagDialog,
  onRemoveTag,
}: {
  document: DocumentSummary
  availableTags: Tag[]
  disabled: boolean
  onAssignTag: (documentId: string, tagId: string) => void
  onOpenCreateTagDialog: (documentId: string, name: string) => void
  onRemoveTag: (documentId: string, tagId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const tagAnchorRef = useRef<HTMLDivElement | null>(null)
  const tagContentRef = useRef<HTMLDivElement | null>(null)
  const assignedTags = useMemo(() => document.tags ?? [], [document.tags])
  const assignedTagIds = useMemo(() => new Set(assignedTags.map((tag) => tag.id)), [assignedTags])
  const normalizedFilter = filter.trim().toLowerCase()
  const filteredTags = useMemo(
    () =>
      availableTags.filter((tag) =>
        normalizedFilter.length === 0 ? true : tag.name.toLowerCase().includes(normalizedFilter)
      ),
    [availableTags, normalizedFilter]
  )
  const selectedTags = filteredTags.filter((tag) => assignedTagIds.has(tag.id))
  const unselectedTags = filteredTags.filter((tag) => !assignedTagIds.has(tag.id))
  const hasExactTagMatch = availableTags.some(
    (tag) => tag.name.trim().toLowerCase() === normalizedFilter
  )
  const canCreateTag = normalizedFilter.length > 0 && !hasExactTagMatch

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    setFilter("")
  }

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return

      if (tagAnchorRef.current?.contains(target) || tagContentRef.current?.contains(target)) {
        return
      }

      setOpen(false)
      setFilter("")
    }

    window.document.addEventListener("pointerdown", handlePointerDown, true)
    return () => window.document.removeEventListener("pointerdown", handlePointerDown, true)
  }, [open])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div
          ref={tagAnchorRef}
          className="flex min-w-0 items-center gap-1.5"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {assignedTags.slice(0, 3).map((tag) => (
              <TagPill key={tag.id} name={tag.name} color={tag.color} />
            ))}
            {assignedTags.length > 3 ? (
              <span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">
                +{assignedTags.length - 3}
              </span>
            ) : null}
          </div>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 shrink-0 rounded-md border-dashed"
              aria-label={`Add tag to ${document.name}`}
              disabled={disabled}
            >
              <Plus className="size-3.5" />
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={tagContentRef}
        align="start"
        avoidCollisions={false}
        className="w-56 overflow-hidden rounded-md p-0"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Input
          value={filter}
          autoFocus
          placeholder="Filter tags..."
          className="h-10 rounded-none border-x-0 border-t-0 focus-visible:ring-0"
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className="max-h-72 overflow-y-auto py-1">
          {selectedTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="flex min-h-9 w-full items-center gap-1 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onRemoveTag(document.id, tag.id)
              }}
            >
              <span
                className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-input"
                style={{
                  backgroundColor: getTagCheckboxColor(tag.color),
                  color: getTagCheckboxCheckColor(tag.color),
                }}
              >
                <Check className="size-3" strokeWidth={2.5} />
              </span>
              <TagPill name={tag.name} color={tag.color} subtle />
            </button>
          ))}
          {selectedTags.length > 0 && unselectedTags.length > 0 ? (
            <div className="my-1 border-t" />
          ) : null}
          {unselectedTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="flex min-h-9 w-full items-center gap-1 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onAssignTag(document.id, tag.id)
              }}
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-sm border border-input"
                style={{
                  backgroundColor: `color-mix(in srgb, ${getTagCheckboxColor(tag.color)} 14%, transparent)`,
                }}
              />
              <TagPill name={tag.name} color={tag.color} subtle />
            </button>
          ))}
          {canCreateTag ? (
            <>
              {(selectedTags.length > 0 || unselectedTags.length > 0) ? (
                <div className="my-1 border-t" />
              ) : null}
              <button
                type="button"
                className="flex min-h-10 w-full items-center gap-3 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onOpenCreateTagDialog(document.id, filter.trim())
                  setOpen(false)
                }}
              >
                <Plus className="size-4" />
                <span className="truncate">{`Create new tag "${filter.trim()}"`}</span>
              </button>
            </>
          ) : null}
          {selectedTags.length === 0 && unselectedTags.length === 0 && !canCreateTag ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">No tags found.</div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ContentGrid({
  items,
  draggedItemKeys,
  dropTarget,
  isDraggable,
  selectedItemKeys,
  onDragEndItem,
  onDragLeaveFolder,
  onDragOverFolder,
  onDragStartItem,
  onDropOnFolder,
  onOpenFolder,
  onOpenDocument,
  onOpenContextMenu,
  onToggleItem,
}: {
  items: FileBrowserItem[]
  draggedItemKeys: Set<string>
  dropTarget: BrowserDropTarget | null
  isDraggable: boolean
  selectedItemKeys: Set<string>
  onDragEndItem: () => void
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onDragStartItem: (event: DragEvent<HTMLElement>, item: FileBrowserItem) => void
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onOpenFolder: (folder: FolderSummary) => void
  onOpenDocument: (document: DocumentSummary) => void
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: FileBrowserItem) => void
  onToggleItem: (item: FileBrowserItem, checked: boolean) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => {
        const isFolder = item.type === "folder"
        const name = itemName(item)
        const size = isFolder ? null : formatBytes(item.document.originalSize)
        const updatedAt = isFolder ? item.folder.updatedAt : item.document.updatedAt
        const itemKey = getBrowserItemKey(item)
        const DocumentIcon = isFolder ? null : getDocumentFileIcon(item.document)
        const isSelected = selectedItemKeys.has(itemKey)

        return (
          <Card
            key={isFolder ? `folder-${item.folder.id}` : `document-${item.document.id}`}
            data-vault-browser-item
            role="link"
            tabIndex={0}
            draggable={isDraggable}
            className={cn(
              "relative cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              isSelected && "border-primary/60 bg-accent/40",
              draggedItemKeys.has(itemKey) && "opacity-55",
              isFolder && getFolderDropTargetClass(dropTarget, item.folder.id)
            )}
            onClick={() => {
              if (isFolder) {
                onOpenFolder(item.folder)
              } else {
                onOpenDocument(item.document)
              }
            }}
            onContextMenu={(event) => onOpenContextMenu(event, item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                if (isFolder) {
                  onOpenFolder(item.folder)
                } else {
                  onOpenDocument(item.document)
                }
              }
            }}
            onDragStart={(event) => onDragStartItem(event, item)}
            onDragEnd={onDragEndItem}
            onDragOver={
              isFolder ? (event) => onDragOverFolder(event, item.folder.id) : undefined
            }
            onDragLeave={
              isFolder ? (event) => onDragLeaveFolder(event, item.folder.id) : undefined
            }
            onDrop={
              isFolder ? (event) => onDropOnFolder(event, item.folder.id) : undefined
            }
          >
            <div className="absolute top-3 left-3 z-10">
              <Checkbox
                aria-label={`Select ${name}`}
                checked={isSelected}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(checked) => onToggleItem(item, checked === true)}
              />
            </div>
            <CardContent className="flex min-h-40 flex-col items-center justify-center p-4 text-center">
              <div className="flex size-11 items-center justify-center rounded-md border bg-background text-muted-foreground">
                {isFolder ? (
                  <Folder className="size-5" strokeWidth={1.9} />
                ) : DocumentIcon ? (
                  <DocumentIcon className="size-5" strokeWidth={1.9} />
                ) : null}
              </div>
              <h2 className="mt-3 max-w-full truncate text-sm font-semibold">{name}</h2>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                {isFolder ? (
                  <span>Folder</span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="size-3.5" />
                    {size}
                  </span>
                )}
                <span>{formatDate(updatedAt)}</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function ContentList({
  items,
  allItemsSelected,
  availableTags,
  draggedItemKeys,
  dropTarget,
  isDraggable,
  tagMutationPending,
  selectedItemKeys,
  someItemsSelected,
  isLoading,
  animationKey,
  emptyContent,
  onDragEndItem,
  onDragLeaveFolder,
  onDragOverFolder,
  onDragStartItem,
  onDropOnFolder,
  onOpenFolder,
  onOpenDocument,
  onOpenContextMenu,
  onAssignTag,
  onOpenCreateTagDialog,
  onRemoveTag,
  onToggleAllItems,
  onToggleItem,
}: {
  items: FileBrowserItem[]
  allItemsSelected: boolean
  availableTags: Tag[]
  draggedItemKeys: Set<string>
  dropTarget: BrowserDropTarget | null
  isDraggable: boolean
  tagMutationPending: boolean
  selectedItemKeys: Set<string>
  someItemsSelected: boolean
  isLoading?: boolean
  animationKey: string
  emptyContent?: ReactNode
  onDragEndItem: () => void
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onDragStartItem: (event: DragEvent<HTMLElement>, item: FileBrowserItem) => void
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onOpenFolder: (folder: FolderSummary) => void
  onOpenDocument: (document: DocumentSummary) => void
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: FileBrowserItem) => void
  onAssignTag: (documentId: string, tagId: string) => void
  onOpenCreateTagDialog: (documentId: string, name: string) => void
  onRemoveTag: (documentId: string, tagId: string) => void
  onToggleAllItems: (checked: boolean) => void
  onToggleItem: (item: FileBrowserItem, checked: boolean) => void
}) {
  return (
    <div className="overflow-hidden border-b bg-background">
      <div className="hidden grid-cols-[auto_minmax(0,1fr)_7rem_7.5rem_minmax(12rem,18rem)] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid lg:px-4">
        <Checkbox
          aria-label="Select all items"
          checked={allItemsSelected ? true : someItemsSelected ? "indeterminate" : false}
          onCheckedChange={(checked) => onToggleAllItems(checked === true)}
        />
        <span>Name</span>
        <span>Type</span>
        <span>Modified</span>
        <span>Tags</span>
      </div>
      {isLoading && items.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading contents...
        </div>
      ) : items.length === 0 && emptyContent ? (
        <div>{emptyContent}</div>
      ) : null}
      {items.length > 0 ? (
        <div
          key={animationKey}
          className={cn(
            "vault-list-items-enter transition-opacity duration-150",
            isLoading && "pointer-events-none opacity-60"
          )}
        >
          {items.map((item) => {
            const isFolder = item.type === "folder"
            const name = itemName(item)
            const updatedAt = isFolder ? item.folder.updatedAt : item.document.updatedAt
            const itemKey = getBrowserItemKey(item)
            const DocumentIcon = isFolder ? null : getDocumentFileIcon(item.document)
            const isSelected = selectedItemKeys.has(itemKey)

            return (
              <div
                key={isFolder ? `folder-${item.folder.id}` : `document-${item.document.id}`}
                data-vault-browser-item
                role="link"
                tabIndex={0}
                draggable={isDraggable}
                className={cn(
                  "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[auto_minmax(0,1fr)_7rem_7.5rem_minmax(12rem,18rem)] lg:px-4",
                  isSelected && "bg-accent/40",
                  draggedItemKeys.has(itemKey) && "opacity-55",
                  isFolder && getFolderDropTargetClass(dropTarget, item.folder.id)
                )}
                onClick={() => {
                  if (isFolder) {
                    onOpenFolder(item.folder)
                  } else {
                    onOpenDocument(item.document)
                  }
                }}
                onContextMenu={(event) => onOpenContextMenu(event, item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    if (isFolder) {
                      onOpenFolder(item.folder)
                    } else {
                      onOpenDocument(item.document)
                    }
                  }
                }}
                onDragStart={(event) => onDragStartItem(event, item)}
                onDragEnd={onDragEndItem}
                onDragOver={
                  isFolder ? (event) => onDragOverFolder(event, item.folder.id) : undefined
                }
                onDragLeave={
                  isFolder ? (event) => onDragLeaveFolder(event, item.folder.id) : undefined
                }
                onDrop={
                  isFolder ? (event) => onDropOnFolder(event, item.folder.id) : undefined
                }
              >
                <Checkbox
                  aria-label={`Select ${name}`}
                  checked={isSelected}
                  onClick={(event) => event.stopPropagation()}
                  onCheckedChange={(checked) => onToggleItem(item, checked === true)}
                />
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                    {isFolder ? (
                      <Folder className="size-4" strokeWidth={1.9} />
                    ) : DocumentIcon ? (
                      <DocumentIcon className="size-4" strokeWidth={1.9} />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{name}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
                      {isFolder ? "Folder" : formatBytes(item.document.originalSize)} · {formatDate(updatedAt)}
                    </div>
                  </div>
                </div>
                <span className="hidden text-xs text-muted-foreground md:block">
                  {isFolder ? "Folder" : formatBytes(item.document.originalSize)}
                </span>
                <span className="hidden text-xs text-muted-foreground md:block">
                  {formatDate(updatedAt)}
                </span>
                {isFolder ? (
                  <ChevronRight className="size-4 text-muted-foreground md:hidden" />
                ) : (
                  <div className="hidden min-w-0 md:block">
                    <DocumentTagsCell
                      document={item.document}
                      availableTags={availableTags}
                      disabled={tagMutationPending}
                      onAssignTag={onAssignTag}
                      onOpenCreateTagDialog={onOpenCreateTagDialog}
                      onRemoveTag={onRemoveTag}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default function VaultWorkspacePage() {
  const { vaultId = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view] = useVaultsView()
  const {
    vault,
    folders,
    loadingTree,
    treeError,
    setHeaderConfig,
    setSidebarConfig,
    refreshVaultShell,
  } = useVaultRouteShell()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const directoryInputRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<FileBrowserItem[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [contextMenu, setContextMenu] = useState<VaultContextMenuState | null>(null)
  const [itemContextMenu, setItemContextMenu] =
    useState<VaultBrowserItemContextMenuState | null>(null)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<FileBrowserItem | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [infoTarget, setInfoTarget] = useState<FileBrowserItem | null>(null)
  const [createTagTargetDocumentId, setCreateTagTargetDocumentId] = useState<string | null>(null)
  const [createTagName, setCreateTagName] = useState("")
  const [createTagColor, setCreateTagColor] = useState(DEFAULT_TAG_COLOR)
  const [createTagDescription, setCreateTagDescription] = useState("")
  const [selection, setSelection] = useState<BrowserSelectionState>(() => ({
    folderId: null,
    keys: new Set(),
    lastKey: null,
  }))
  const [moveTargets, setMoveTargets] = useState<FileBrowserItem[]>([])
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null)
  const [pendingTrashItems, setPendingTrashItems] = useState<FileBrowserItem[]>([])
  const [draggedItems, setDraggedItems] = useState<FileBrowserItem[]>([])
  const [dropTarget, setDropTarget] = useState<BrowserDropTarget | null>(null)
  const [isEmptyUploadDropActive, setIsEmptyUploadDropActive] = useState(false)
  const [loadingItems, setLoadingItems] = useState(true)
  const [itemMutationPending, setItemMutationPending] = useState(false)
  const [renameMutationPending, setRenameMutationPending] = useState(false)
  const [tagMutationPending, setTagMutationPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(true)
  const activeFolderId = searchParams.get("folderId")
  const normalizedFolderId = activeFolderId === "root" ? null : activeFolderId

  const sortedItems = useMemo(() => sortItems(items), [items])
  const selectedItemKeys =
    selection.folderId === normalizedFolderId ? selection.keys : EMPTY_SELECTED_ITEM_KEYS
  const selectedItems = useMemo(
    () => sortedItems.filter((item) => selectedItemKeys.has(getBrowserItemKey(item))),
    [selectedItemKeys, sortedItems]
  )
  const selectedCount = selectedItems.length
  const allItemsSelected = sortedItems.length > 0 && selectedCount === sortedItems.length
  const someItemsSelected = selectedCount > 0 && !allItemsSelected
  const draggedItemKeys = useMemo(
    () => new Set(draggedItems.map((item) => getBrowserItemKey(item))),
    [draggedItems]
  )
  const moveDestinations = useMemo(
    () => getMoveDestinations({ folders, targets: moveTargets }),
    [folders, moveTargets]
  )
  const isCreateTagDialogDirty =
    createTagName.trim().length > 0 ||
    createTagDescription.trim().length > 0 ||
    createTagColor !== DEFAULT_TAG_COLOR

  const selectFolder = useCallback((folderId: string | null) => {
    setSelection({ folderId, keys: new Set(), lastKey: null })
    setSearchParams(folderId ? { folderId } : {})
  }, [setSearchParams])

  const canMoveItems = vault?.role === "owner" || vault?.role === "editor"
  const canCreateItems = canMoveItems
  const canDeleteItems = canMoveItems
  const showVaultChatAction = aiFeaturesEnabled && canReadVault(vault)

  const hydrateItemsWithDocumentTags = useCallback(async (nextItems: FileBrowserItem[]) => {
    const documentItems = nextItems.filter((item) => item.type === "document")

    if (documentItems.length === 0) {
      return nextItems
    }

    const tagsByDocumentId = new Map<string, Tag[]>()

    await Promise.all(
      documentItems.map(async (item) => {
        if (item.type !== "document") return

        try {
          const result = await listDocumentTags({ vaultId, documentId: item.document.id })
          tagsByDocumentId.set(item.document.id, result.tags)
        } catch {
          tagsByDocumentId.set(item.document.id, item.document.tags ?? [])
        }
      })
    )

    return nextItems.map((item) => {
      if (item.type !== "document") {
        return item
      }

      return {
        ...item,
        document: {
          ...item.document,
          tags: tagsByDocumentId.get(item.document.id) ?? item.document.tags ?? [],
        },
      }
    })
  }, [vaultId])

  const refreshVaultContents = useCallback(async () => {
    const [, itemsResult] = await Promise.all([
      refreshVaultShell(),
      listFolderItems({ vaultId, folderId: normalizedFolderId }),
    ])
    const hydratedItems = await hydrateItemsWithDocumentTags(itemsResult.items)

    setItems(hydratedItems)
  }, [hydrateItemsWithDocumentTags, refreshVaultShell, vaultId, normalizedFolderId])

  const refreshTags = useCallback(async () => {
    const result = await listTags()
    setTags(result.tags)
  }, [])

  const uploadSelectedFiles = useCallback(async (selectedFiles: UploadFileInput[]) => {
    if (!vaultId) {
      return
    }

    const result = uploadManager.addFiles({
      vaultId,
      folderId: normalizedFolderId,
      files: selectedFiles,
    })

    if (result.acceptedCount === 0) {
      toast.error("No supported files selected.")
      return
    }

    toast.success(
      result.rejectedCount > 0
        ? `Queued ${result.acceptedCount} file${result.acceptedCount === 1 ? "" : "s"}. ${result.rejectedCount} unsupported file${result.rejectedCount === 1 ? "" : "s"} skipped.`
        : `Queued ${result.acceptedCount} file${result.acceptedCount === 1 ? "" : "s"}.`
    )
  }, [normalizedFolderId, vaultId])

  const handleUploadInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []).map((file) => ({
      file,
      relativePath: getUploadRelativePath(file),
    }))

    event.target.value = ""
    void uploadSelectedFiles(selectedFiles)
  }, [uploadSelectedFiles])

  const openUploadFiles = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const openUploadDirectory = useCallback(() => {
    directoryInputRef.current?.click()
  }, [])

  const handleContentUploadDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    if (!vaultId || !hasExternalFileDrag(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
    setIsEmptyUploadDropActive(true)
  }, [vaultId])

  const handleContentUploadDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!vaultId || !hasExternalFileDrag(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
    setIsEmptyUploadDropActive(true)
  }, [vaultId])

  const handleContentUploadDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    if (!hasExternalFileDrag(event)) {
      return
    }

    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return
    }

    setIsEmptyUploadDropActive(false)
  }, [])

  const handleContentUploadDrop = useCallback((event: DragEvent<HTMLElement>) => {
    if (!vaultId || !hasExternalFileDrag(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setIsEmptyUploadDropActive(false)
    void getDroppedUploadFiles(event.dataTransfer)
      .then((selectedFiles) => uploadSelectedFiles(selectedFiles))
      .catch(() => {
        toast.error("Unable to read dropped files.")
      })
  }, [uploadSelectedFiles, vaultId])

  const openCreateFolderDialog = useCallback((parentId: string | null) => {
    setCreateFolderParentId(parentId)
    setIsCreateFolderOpen(true)
  }, [])

  const clearSelection = useCallback(() => {
    setSelection({
      folderId: normalizedFolderId,
      keys: new Set(),
      lastKey: null,
    })
  }, [normalizedFolderId])

  const selectSingleItem = useCallback((item: FileBrowserItem) => {
    const itemKey = getBrowserItemKey(item)
    setSelection({
      folderId: normalizedFolderId,
      keys: new Set([itemKey]),
      lastKey: itemKey,
    })
  }, [normalizedFolderId])

  const toggleBrowserItem = useCallback((item: FileBrowserItem, checked: boolean) => {
    const itemKey = getBrowserItemKey(item)

    setSelection((previousSelection) => {
      const isSameFolder = previousSelection.folderId === normalizedFolderId
      const previousKeys = isSameFolder ? previousSelection.keys : EMPTY_SELECTED_ITEM_KEYS
      const nextKeys = new Set(previousKeys)

      if (checked) {
        nextKeys.add(itemKey)
      } else {
        nextKeys.delete(itemKey)
      }

      return {
        folderId: normalizedFolderId,
        keys: nextKeys,
        lastKey: itemKey,
      }
    })
  }, [normalizedFolderId])

  const toggleAllBrowserItems = useCallback((checked: boolean) => {
    setSelection({
      folderId: normalizedFolderId,
      keys: checked ? new Set(sortedItems.map((item) => getBrowserItemKey(item))) : new Set(),
      lastKey: null,
    })
  }, [normalizedFolderId, sortedItems])

  const openMoveDialog = useCallback((targets: FileBrowserItem[]) => {
    if (targets.length === 0) {
      return
    }

    setItemContextMenu(null)
    setMoveTargets(targets)
    setMoveDestinationId(getCommonBrowserItemParentId(targets) ?? null)
  }, [])

  const closeMoveDialog = useCallback(() => {
    setMoveTargets([])
    setMoveDestinationId(null)
  }, [])

  const openRenameDialog = useCallback((item: FileBrowserItem) => {
    setItemContextMenu(null)
    setRenameTarget(item)
    setRenameValue(itemName(item))
  }, [])

  const closeRenameDialog = useCallback(() => {
    if (renameMutationPending) {
      return
    }

    setRenameTarget(null)
    setRenameValue("")
  }, [renameMutationPending])

  const openInfoDialog = useCallback((item: FileBrowserItem) => {
    setItemContextMenu(null)
    setInfoTarget(item)
  }, [])

  const handleBackgroundContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest("[data-vault-browser-item]")) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    setItemContextMenu(null)
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      vaultName: vault?.name ?? "Vault",
    })
  }, [vault?.name])

  const handleItemContextMenu = useCallback((event: MouseEvent<HTMLElement>, item: FileBrowserItem) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setItemContextMenu({
      item,
      x: event.clientX,
      y: event.clientY,
    })
  }, [])

  const handleRenameSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextName = renameValue.trim()
    if (!vaultId || renameTarget === null || nextName.length === 0 || renameMutationPending) {
      return
    }

    if (nextName === itemName(renameTarget)) {
      closeRenameDialog()
      return
    }

    setRenameMutationPending(true)
    try {
      if (renameTarget.type === "folder") {
        await renameFolder({ vaultId, folderId: renameTarget.folder.id, name: nextName })
      } else {
        await renameDocument({ vaultId, documentId: renameTarget.document.id, name: nextName })
      }

      await refreshVaultContents()
      setRenameTarget(null)
      setRenameValue("")
      toast.success("Item renamed.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename item.")
    } finally {
      setRenameMutationPending(false)
    }
  }, [closeRenameDialog, refreshVaultContents, renameMutationPending, renameTarget, renameValue, vaultId])

  const handleMoveItems = useCallback(async ({
    targets,
    destinationId,
  }: {
    targets: FileBrowserItem[]
    destinationId: string | null
  }) => {
    if (!vaultId || itemMutationPending) {
      return
    }

    setItemMutationPending(true)
    try {
      const targetsToMove = targets.filter((target) => getBrowserItemParentId(target) !== destinationId)

      await Promise.all(
        targetsToMove.map((target) =>
          target.type === "folder"
            ? moveFolder({ vaultId, folderId: target.folder.id, parentId: destinationId })
            : moveDocument({ vaultId, documentId: target.document.id, folderId: destinationId })
        )
      )

      await refreshVaultContents()
      closeMoveDialog()
      clearSelection()
      if (targetsToMove.length > 0) {
        toast.success(
          targetsToMove.length === 1
            ? "Item moved."
            : `${targetsToMove.length} items moved.`
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to move item.")
    } finally {
      setItemMutationPending(false)
    }
  }, [clearSelection, closeMoveDialog, itemMutationPending, refreshVaultContents, vaultId])

  const handleMoveSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (moveTargets.length === 0) {
      return
    }

    const validation = getBrowserDropValidation({
      canUpdateItems: canMoveItems,
      itemMutationPending,
      destinationId: moveDestinationId,
      targets: moveTargets,
      folders,
    })

    if (!validation.valid) {
      toast.warning(validation.message)
      return
    }

    void handleMoveItems({ targets: moveTargets, destinationId: moveDestinationId })
  }, [canMoveItems, folders, handleMoveItems, itemMutationPending, moveDestinationId, moveTargets])

  const handleDeleteItems = useCallback(async (targets: FileBrowserItem[]) => {
    if (!vaultId || targets.length === 0 || itemMutationPending) {
      return
    }

    setItemMutationPending(true)
    try {
      await Promise.all(
        targets.map((target) =>
          target.type === "folder"
            ? softDeleteFolder({ vaultId, folderId: target.folder.id })
            : softDeleteDocument({ vaultId, documentId: target.document.id })
        )
      )

      await refreshVaultContents()
      setPendingTrashItems([])
      clearSelection()
      toast.success(targets.length === 1 ? "Item moved to trash." : `${targets.length} items moved to trash.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete selected items.")
    } finally {
      setItemMutationPending(false)
    }
  }, [clearSelection, itemMutationPending, refreshVaultContents, vaultId])

  const handleAssignTag = useCallback(async (documentId: string, tagId: string) => {
    if (!vaultId || tagMutationPending) {
      return
    }

    setTagMutationPending(true)
    try {
      await assignTagToDocument({ vaultId, documentId, tagId })
      await Promise.all([refreshVaultContents(), refreshTags()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign tag.")
    } finally {
      setTagMutationPending(false)
    }
  }, [refreshTags, refreshVaultContents, tagMutationPending, vaultId])

  const handleRemoveTag = useCallback(async (documentId: string, tagId: string) => {
    if (!vaultId || tagMutationPending) {
      return
    }

    setTagMutationPending(true)
    try {
      await removeTagFromDocument({ vaultId, documentId, tagId })
      await Promise.all([refreshVaultContents(), refreshTags()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove tag.")
    } finally {
      setTagMutationPending(false)
    }
  }, [refreshTags, refreshVaultContents, tagMutationPending, vaultId])

  const openCreateTagDialog = useCallback((documentId: string, name: string) => {
    setCreateTagTargetDocumentId(documentId)
    setCreateTagName(name)
    setCreateTagColor(DEFAULT_TAG_COLOR)
    setCreateTagDescription("")
  }, [])

  const closeCreateTagDialog = useCallback(() => {
    if (tagMutationPending) {
      return
    }

    setCreateTagTargetDocumentId(null)
    setCreateTagName("")
    setCreateTagColor(DEFAULT_TAG_COLOR)
    setCreateTagDescription("")
  }, [tagMutationPending])

  const handleCreateTagSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const normalizedName = createTagName.trim()
    if (
      !vaultId ||
      createTagTargetDocumentId === null ||
      normalizedName.length === 0 ||
      tagMutationPending
    ) {
      return
    }

    setTagMutationPending(true)
    try {
      const result = await createTag({
        name: normalizedName,
        color: createTagColor || null,
        description: createTagDescription.trim() || null,
      })
      await assignTagToDocument({
        vaultId,
        documentId: createTagTargetDocumentId,
        tagId: result.tag.id,
      })
      await Promise.all([refreshVaultContents(), refreshTags()])
      setCreateTagTargetDocumentId(null)
      setCreateTagName("")
      setCreateTagColor(DEFAULT_TAG_COLOR)
      setCreateTagDescription("")
      toast.success("Tag created.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create tag.")
    } finally {
      setTagMutationPending(false)
    }
  }, [
    createTagColor,
    createTagDescription,
    createTagName,
    createTagTargetDocumentId,
    refreshTags,
    refreshVaultContents,
    tagMutationPending,
    vaultId,
  ])

  const resetDragState = useCallback(() => {
    setDraggedItems([])
    setDropTarget(null)
  }, [])

  const getDropValidation = useCallback((destinationId: string | null) =>
    getBrowserDropValidation({
      canUpdateItems: canMoveItems,
      itemMutationPending,
      destinationId,
      targets: draggedItems,
      folders,
    }), [canMoveItems, draggedItems, folders, itemMutationPending])

  const setActiveDropTarget = useCallback((folderId: string | null, state: BrowserDropTargetState) => {
    setDropTarget((previousDropTarget) => {
      if (previousDropTarget?.folderId === folderId && previousDropTarget.state === state) {
        return previousDropTarget
      }

      return { folderId, state }
    })
  }, [])

  const handleItemDragStart = useCallback((event: DragEvent<HTMLElement>, item: FileBrowserItem) => {
    if (!canMoveItems || itemMutationPending) {
      event.preventDefault()
      return
    }

    const itemKey = getBrowserItemKey(item)
    const dragItems = selectedItemKeys.has(itemKey) && selectedItems.length > 0 ? selectedItems : [item]

    if (!selectedItemKeys.has(itemKey)) {
      selectSingleItem(item)
    }

    setDraggedItems(dragItems)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(INTERNAL_BROWSER_DRAG_TYPE, serializeBrowserDragItems(dragItems))
    event.dataTransfer.setData("text/plain", dragItems.map((target) => itemName(target)).join(", "))
  }, [canMoveItems, itemMutationPending, selectSingleItem, selectedItemKeys, selectedItems])

  const handleDragOverFolder = useCallback((event: DragEvent<HTMLElement>, folderId: string | null) => {
    if (!hasInternalBrowserDrag(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const validation = getDropValidation(folderId)
    event.dataTransfer.dropEffect = validation.valid ? "move" : "none"
    setActiveDropTarget(folderId, validation.valid ? "valid" : "invalid")
  }, [getDropValidation, setActiveDropTarget])

  const handleDragLeaveFolder = useCallback((event: DragEvent<HTMLElement>, folderId: string | null) => {
    if (!hasInternalBrowserDrag(event)) {
      return
    }

    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return
    }

    setDropTarget((previousDropTarget) =>
      previousDropTarget?.folderId === folderId ? null : previousDropTarget
    )
  }, [])

  const handleDropOnFolder = useCallback((event: DragEvent<HTMLElement>, folderId: string | null) => {
    if (!hasInternalBrowserDrag(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const validation = getDropValidation(folderId)
    setDropTarget(null)

    if (!validation.valid) {
      toast.warning(validation.message)
      return
    }

    void handleMoveItems({ targets: draggedItems, destinationId: folderId })
    setDraggedItems([])
  }, [draggedItems, getDropValidation, handleMoveItems])

  const workspaceActions = useMemo(() => (
    <>
      <VaultUploadMenu
        disabled={!vaultId}
        showChat={showVaultChatAction}
        onOpenChat={() => navigate(getVaultChatUrl(vaultId))}
        onUploadFiles={openUploadFiles}
        onUploadFolder={openUploadDirectory}
      />
      <VaultsViewToggle />
    </>
  ), [navigate, openUploadDirectory, openUploadFiles, showVaultChatAction, vaultId])

  useEffect(() => {
    let ignore = false

    void getMe()
      .then((result) => {
        if (!ignore) {
          setAiFeaturesEnabled(result.aiFeaturesEnabled !== false && result.canUseAI !== false)
        }
      })
      .catch(() => {
        if (!ignore) {
          setAiFeaturesEnabled(true)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadItems() {
      setLoadingItems(true)
      setErrorMessage(null)

      try {
        const result = await listFolderItems({ vaultId, folderId: normalizedFolderId })
        const hydratedItems = await hydrateItemsWithDocumentTags(result.items)

        if (!ignore) {
          setItems(hydratedItems)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load vault contents.")
        }
      } finally {
        if (!ignore) {
          setLoadingItems(false)
        }
      }
    }

    if (vaultId) {
      void loadItems()
    }

    return () => {
      ignore = true
    }
  }, [hydrateItemsWithDocumentTags, vaultId, normalizedFolderId])

  useEffect(() => {
    let ignore = false

    async function loadTags() {
      try {
        const result = await listTags()
        if (!ignore) {
          setTags(result.tags)
        }
      } catch {
        if (!ignore) {
          setTags([])
        }
      }
    }

    void loadTags()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!vaultId) {
      return
    }

    void uploadManager.reconcileVault(vaultId)
  }, [vaultId])

  useEffect(() => {
    function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string; folderId?: string | null }>).detail
      if (detail?.vaultId !== vaultId) {
        return
      }

      void refreshVaultContents()
    }

    window.addEventListener("arkivra:uploads-completed", handleUploadCompleted)
    return () => window.removeEventListener("arkivra:uploads-completed", handleUploadCompleted)
  }, [refreshVaultContents, vaultId])

  function openDocument(document: DocumentSummary) {
    navigate(`/vaults/${vaultId}/${document.id}`)
  }

  function openBrowserItem(item: FileBrowserItem) {
    if (item.type === "folder") {
      selectFolder(item.folder.id)
      return
    }

    openDocument(item.document)
  }

  function downloadDocument(item: Extract<FileBrowserItem, { type: "document" }>) {
    window.location.assign(getDocumentDownloadUrl({ vaultId, documentId: item.document.id }))
  }

  function openDocumentVersions(item: Extract<FileBrowserItem, { type: "document" }>) {
    navigate(`/vaults/${vaultId}/${item.document.id}?tab=versions`)
  }

  function openDocumentChat(item: Extract<FileBrowserItem, { type: "document" }>) {
    navigate(getDocumentChatUrl({
      vaultId,
      documentId: item.document.id,
      documentName: item.document.name,
    }))
  }

  const currentFolder = useMemo(
    () => folders.find((folder) => folder.id === normalizedFolderId) ?? null,
    [folders, normalizedFolderId]
  )
  const infoLocation = useMemo(() => {
    if (infoTarget === null) {
      return `/${vault?.name?.trim() || "Vault"}`
    }

    return getVaultItemLocationPath({
      item: infoTarget,
      folders,
      vaultName: vault?.name ?? "Vault",
    })
  }, [folders, infoTarget, vault?.name])
  const emptyLocationLabel = normalizedFolderId === null ? "vault" : "folder"
  const folderCount = sortedItems.filter((item) => item.type === "folder").length
  const documentCount = sortedItems.length - folderCount
  const totalDocumentSize = sortedItems.reduce(
    (total, item) => total + (item.type === "document" ? item.document.originalSize : 0),
    0
  )
  const workspaceTitle = currentFolder?.name ?? vault?.name ?? "Vault"
  const workspaceSubtitle = loadingItems
    ? "Loading contents..."
    : `${folderCount} folder${folderCount === 1 ? "" : "s"} · ${documentCount} document${documentCount === 1 ? "" : "s"} · ${formatBytes(totalDocumentSize)}`
  const emptyFolderContent = (
    <div
      className={cn(
        "flex min-h-full flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-8 text-center transition-colors",
        view === "list" && "min-h-64 rounded-none border-x-0 border-b-0",
        isEmptyUploadDropActive && "border-primary bg-primary/5 ring-2 ring-primary/20"
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-primary/40 bg-primary/10 text-primary">
        {isEmptyUploadDropActive ? <Upload className="size-7" /> : <FolderOpen className="size-7" />}
      </div>
      <h2 className="mt-4 text-lg font-semibold">
        {isEmptyUploadDropActive ? "Drop files to upload" : `This ${emptyLocationLabel} is empty`}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {isEmptyUploadDropActive
          ? "Uploads will be added to Transfers."
          : "Drag files here or upload them. You can track their progress in Transfers."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" variant="outline" onClick={openUploadFiles}>
          <Upload className="size-4" />
          Upload files
        </Button>
      </div>
    </div>
  )

  useEffect(() => {
    setHeaderConfig({
      iconKey: currentFolder ? "folder" : "vault",
      contentKey: `workspace:${workspaceTitle}:${workspaceSubtitle}`,
      icon: (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary md:size-12">
          {currentFolder ? <FolderOpen className="size-5" /> : <HardDrive className="size-5" />}
        </div>
      ),
      title: workspaceTitle,
      badge: !currentFolder ? <Badge variant="secondary">Vault</Badge> : null,
      subtitle: (
        <>
          <span>{workspaceSubtitle}</span>
          {vault?.role ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{vault.role}</span>
            </>
          ) : null}
        </>
      ),
      actions: (
        <>
          {workspaceActions}
          <Button type="button" variant="outline" size="icon" aria-label="Close vault" onClick={() => navigate("/vaults")}>
            <X className="size-4" />
          </Button>
        </>
      ),
    })
  }, [currentFolder, navigate, setHeaderConfig, vault?.role, workspaceActions, workspaceSubtitle, workspaceTitle])

  useEffect(() => () => setHeaderConfig(null), [setHeaderConfig])

  useEffect(() => {
    setSidebarConfig({
      currentFolderId: normalizedFolderId,
      currentDocumentId: null,
      onSelectVault: () => selectFolder(null),
      onSelectFolder: selectFolder,
      onSelectDocument: (selectedVaultId, documentId) => {
        navigate(`/vaults/${selectedVaultId}/${documentId}`)
      },
      onOpenVaultContextMenu: (event) => handleBackgroundContextMenu(event),
      canMoveItems,
      itemMutationPending,
      draggedItems,
      dropTarget,
      onDragStartItem: handleItemDragStart,
      onDragEndItem: resetDragState,
      onDragOverFolder: handleDragOverFolder,
      onDragLeaveFolder: handleDragLeaveFolder,
      onDropOnFolder: handleDropOnFolder,
      onMoveItems: handleMoveItems,
    })
  }, [
    canMoveItems,
    draggedItems,
    dropTarget,
    handleBackgroundContextMenu,
    handleDragLeaveFolder,
    handleDragOverFolder,
    handleDropOnFolder,
    handleItemDragStart,
    handleMoveItems,
    itemMutationPending,
    navigate,
    normalizedFolderId,
    resetDragState,
    selectFolder,
    setSidebarConfig,
  ])

  useEffect(() => () => {
    setSidebarConfig({
      currentFolderId: null,
      currentDocumentId: null,
    })
  }, [setSidebarConfig])

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT_ATTRIBUTE}
        multiple
        hidden
        onChange={handleUploadInputChange}
      />
      <input
        ref={directoryInputRef}
        type="file"
        multiple
        hidden
        onChange={handleUploadInputChange}
        {...DIRECTORY_PICKER_ATTRIBUTES}
      />
      <CreateFolderDialog
        open={isCreateFolderOpen}
        vaultId={vaultId}
        parentId={createFolderParentId}
        onOpenChange={(open) => {
          setIsCreateFolderOpen(open)
          if (!open) {
            setCreateFolderParentId(null)
          }
        }}
        onCreated={() => {
          void refreshVaultContents()
        }}
      />
      <MoveItemsDialog
        open={moveTargets.length > 0}
        targets={moveTargets}
        value={moveDestinationId}
        destinations={moveDestinations}
        isPending={itemMutationPending}
        isLoading={loadingTree}
        onValueChange={setMoveDestinationId}
        onClose={closeMoveDialog}
        onSubmit={handleMoveSubmit}
      />
      <RenameItemDialog
        target={renameTarget}
        value={renameValue}
        isPending={renameMutationPending}
        onValueChange={setRenameValue}
        onClose={closeRenameDialog}
        onSubmit={handleRenameSubmit}
      />
      <ItemInfoDialog
        target={infoTarget}
        location={infoLocation}
        vaultId={vaultId}
        onClose={() => setInfoTarget(null)}
      />
      <TagFormDialog
        open={createTagTargetDocumentId !== null}
        mode="create"
        isPending={tagMutationPending}
        name={createTagName}
        color={createTagColor}
        description={createTagDescription}
        isDirty={isCreateTagDialogDirty}
        onNameChange={setCreateTagName}
        onColorChange={setCreateTagColor}
        onDescriptionChange={setCreateTagDescription}
        onOpenChange={(open) => {
          if (!open) {
            closeCreateTagDialog()
          }
        }}
        onSubmit={handleCreateTagSubmit}
      />
      <DeleteItemsConfirmDialog
        items={pendingTrashItems}
        isPending={itemMutationPending}
        onClose={() => setPendingTrashItems([])}
        onConfirm={() => void handleDeleteItems(pendingTrashItems)}
      />
      <SelectedItemsActionBar
        selectedCount={selectedCount}
        canMoveItems={canMoveItems}
        canDeleteItems={canDeleteItems}
        itemMutationPending={itemMutationPending}
        onMove={() => openMoveDialog(selectedItems)}
        onDelete={() => setPendingTrashItems(selectedItems)}
      />
      {contextMenu ? (
        <VaultContextMenu
          state={contextMenu}
          canCreateItems={canCreateItems}
          onClose={() => setContextMenu(null)}
          onCreateFolder={() => openCreateFolderDialog(normalizedFolderId)}
          onUploadFiles={openUploadFiles}
          onUploadFolder={openUploadDirectory}
        />
      ) : null}
      {itemContextMenu ? (
        <VaultBrowserItemContextMenu
          state={itemContextMenu}
          canDeleteItems={canDeleteItems}
          canMoveItems={canMoveItems}
          itemMutationPending={itemMutationPending}
          onClose={() => setItemContextMenu(null)}
          onDownloadDocument={downloadDocument}
          onOpenChat={showVaultChatAction ? openDocumentChat : undefined}
          onOpenInfo={openInfoDialog}
          onMoveItem={(item) => openMoveDialog([item])}
          onOpenItem={openBrowserItem}
          onRenameItem={openRenameDialog}
          onTrashItem={(item) => {
            setItemContextMenu(null)
            setPendingTrashItems([item])
          }}
          onVersions={openDocumentVersions}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" onContextMenu={handleBackgroundContextMenu}>
              <div
                className={cn(
                  "min-h-0 flex-1 overflow-auto",
                  view === "list" && !treeError && !errorMessage
                    ? "p-0"
                    : "p-3"
                )}
                onDragEnter={handleContentUploadDragEnter}
                onDragOver={handleContentUploadDragOver}
                onDragLeave={handleContentUploadDragLeave}
                onDrop={handleContentUploadDrop}
              >
              {treeError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {treeError}
                </div>
              ) : errorMessage ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {errorMessage}
                </div>
              ) : view === "list" ? (
                <ContentList
                  items={sortedItems}
                  allItemsSelected={!loadingItems && allItemsSelected}
                  availableTags={tags}
                  animationKey={`${normalizedFolderId ?? "root"}:${sortedItems.map((item) => getBrowserItemKey(item)).join(",")}`}
                  draggedItemKeys={draggedItemKeys}
                  dropTarget={dropTarget}
                  isDraggable={!loadingItems && canMoveItems && !itemMutationPending}
                  isLoading={loadingItems}
                  emptyContent={emptyFolderContent}
                  tagMutationPending={tagMutationPending}
                  selectedItemKeys={loadingItems ? EMPTY_SELECTED_ITEM_KEYS : selectedItemKeys}
                  someItemsSelected={!loadingItems && someItemsSelected}
                  onDragEndItem={resetDragState}
                  onDragLeaveFolder={handleDragLeaveFolder}
                  onDragOverFolder={handleDragOverFolder}
                  onDragStartItem={handleItemDragStart}
                  onDropOnFolder={handleDropOnFolder}
                  onOpenFolder={(folder) => selectFolder(folder.id)}
                  onOpenDocument={openDocument}
                  onOpenContextMenu={handleItemContextMenu}
                  onAssignTag={handleAssignTag}
                  onOpenCreateTagDialog={openCreateTagDialog}
                  onRemoveTag={handleRemoveTag}
                  onToggleAllItems={toggleAllBrowserItems}
                  onToggleItem={toggleBrowserItem}
                />
              ) : loadingItems ? (
                <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
                  Loading contents...
                </div>
              ) : sortedItems.length === 0 ? (
                emptyFolderContent
              ) : view === "grid" ? (
                <div>
                  <ContentGrid
                    items={sortedItems}
                    draggedItemKeys={draggedItemKeys}
                    dropTarget={dropTarget}
                    isDraggable={canMoveItems && !itemMutationPending}
                    selectedItemKeys={selectedItemKeys}
                    onDragEndItem={resetDragState}
                    onDragLeaveFolder={handleDragLeaveFolder}
                    onDragOverFolder={handleDragOverFolder}
                    onDragStartItem={handleItemDragStart}
                    onDropOnFolder={handleDropOnFolder}
                    onOpenFolder={(folder) => selectFolder(folder.id)}
                    onOpenDocument={openDocument}
                    onOpenContextMenu={handleItemContextMenu}
                    onToggleItem={toggleBrowserItem}
                  />
                </div>
              ) : null}
            </div>
      </div>
    </>
  )
}
