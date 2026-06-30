"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type InputHTMLAttributes, type MouseEvent } from "react"
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  X,
} from "lucide-react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import { CreateFolderDialog } from "./components/create-folder-dialog"
import { VaultContextMenu, type VaultContextMenuState } from "./components/vault-context-menu"
import { VAULT_TREE_ROOT_VALUE, VaultSidebarTree } from "./components/vault-sidebar-tree"
import { VaultUploadMenu } from "./components/vault-upload-menu"
import { VaultsViewToggle } from "./components/vaults-view-toggle"
import {
  filterAllowedUploadFiles,
  normalizeUploadFileName,
  UPLOAD_ACCEPT_ATTRIBUTE,
  type UploadFileInput,
} from "./upload-file-rules"
import { completeUploadSession, initUploadSession, uploadPart, type UploadConflictStrategy } from "./uploads.api"
import {
  getVault,
  listFolderItems,
  listFolderTree,
  moveDocument,
  moveFolder,
  type DocumentSummary,
  type FileBrowserItem,
  type FolderSummary,
  type FolderTreeDocumentEntry,
  type FolderTreeEntry,
  type VaultDetail,
} from "./vaults.api"
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

interface UploadConflictDetails {
  code: "document.name_conflict" | "document.duplicate" | string
  message: string
  existingId: string | null
  duplicateScope: string | null
  conflictType: "name" | "hash" | string
  availableStrategies: UploadConflictStrategy[]
}

interface UploadConflictPrompt {
  fileName: string
  conflict: UploadConflictDetails
  resolve: (strategy: UploadConflictStrategy) => void
  reject: () => void
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)

  return `${formatted} ${units[exponent]}`
}

function isUploadConflictStrategy(value: unknown): value is UploadConflictStrategy {
  return value === "skip" || value === "keep_both" || value === "new_version"
}

function getUploadConflictDetails(error: unknown): UploadConflictDetails | null {
  if (!(error instanceof ApiError) || error.status !== 409) {
    return null
  }

  if (error.code !== "document.name_conflict" && error.code !== "document.duplicate") {
    return null
  }

  const details = error.details ?? {}
  const availableStrategies = Array.isArray(details.availableStrategies)
    ? details.availableStrategies.filter(isUploadConflictStrategy)
    : []

  return {
    code: error.code,
    message: error.message,
    existingId: typeof details.existingId === "string" ? details.existingId : null,
    duplicateScope: typeof details.duplicateScope === "string" ? details.duplicateScope : null,
    conflictType: typeof details.conflictType === "string" ? details.conflictType : "hash",
    availableStrategies,
  }
}

function conflictStrategyLabel(strategy: UploadConflictStrategy) {
  switch (strategy) {
    case "skip":
      return "Skip"
    case "keep_both":
      return "Keep both"
    case "new_version":
      return "Add version"
  }
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

function getDocumentStatusClass(document: DocumentSummary) {
  if (document.processingStatus === "failed") {
    return "border-destructive/40 bg-destructive/10 text-destructive"
  }

  if (document.processingStatus && document.processingStatus !== "completed") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  }

  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
}

function getDocumentStatusLabel(document: DocumentSummary) {
  if (!document.processingStatus) return "Ready"
  if (document.processingStatus === "completed") return "Ready"
  return document.processingStatus
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

function hasInternalBrowserDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(INTERNAL_BROWSER_DRAG_TYPE)
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

async function uploadFileToVault({
  vaultId,
  folderId,
  input,
  onConflict,
}: {
  vaultId: string
  folderId: string | null
  input: UploadFileInput
  onConflict: (fileName: string, conflict: UploadConflictDetails) => Promise<UploadConflictStrategy>
}) {
  const { file, relativePath = null } = input
  const fileName = normalizeUploadFileName(file.name)
  const initResult = await initUploadSession({
    vaultId,
    folderId,
    relativePath,
    fileName,
    mimeType: file.type || "application/octet-stream",
    totalSize: file.size,
  })

  const { upload } = initResult
  const partSize = upload.partSize || file.size

  for (let partNumber = 1; partNumber <= upload.partCount; partNumber += 1) {
    if (upload.uploadedParts.includes(partNumber)) {
      continue
    }

    const start = (partNumber - 1) * partSize
    const end = Math.min(start + partSize, file.size)
    await uploadPart({
      vaultId,
      uploadId: upload.id,
      partNumber,
      chunk: file.slice(start, end),
    })
  }

  try {
    await completeUploadSession({ vaultId, uploadId: upload.id })
  } catch (error) {
    const conflict = getUploadConflictDetails(error)
    if (conflict === null || conflict.availableStrategies.length === 0) {
      throw error
    }

    const strategy = await onConflict(fileName, conflict)
    await completeUploadSession({ vaultId, uploadId: upload.id, conflictStrategy: strategy })
  }
}

function ContentGrid({
  items,
  draggedItemKeys,
  dropTarget,
  isDraggable,
  onDragEndItem,
  onDragLeaveFolder,
  onDragOverFolder,
  onDragStartItem,
  onDropOnFolder,
  onOpenFolder,
  onOpenDocument,
}: {
  items: FileBrowserItem[]
  draggedItemKeys: Set<string>
  dropTarget: BrowserDropTarget | null
  isDraggable: boolean
  onDragEndItem: () => void
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onDragStartItem: (event: DragEvent<HTMLElement>, item: FileBrowserItem) => void
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onOpenFolder: (folder: FolderSummary) => void
  onOpenDocument: (document: DocumentSummary) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => {
        const isFolder = item.type === "folder"
        const name = itemName(item)
        const size = isFolder ? null : formatBytes(item.document.originalSize)
        const updatedAt = isFolder ? item.folder.updatedAt : item.document.updatedAt
        const itemKey = getBrowserItemKey(item)

        return (
          <Card
            key={isFolder ? `folder-${item.folder.id}` : `document-${item.document.id}`}
            data-vault-browser-item
            role="link"
            tabIndex={0}
            draggable={isDraggable}
            className={cn(
              "cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
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
            <CardContent className="flex min-h-40 flex-col items-center justify-center p-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                {isFolder ? <Folder className="size-7" /> : <FileText className="size-7" />}
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
              {!isFolder ? (
                <Badge variant="outline" className={cn("mt-2", getDocumentStatusClass(item.document))}>
                  {getDocumentStatusLabel(item.document)}
                </Badge>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function ContentList({
  items,
  draggedItemKeys,
  dropTarget,
  isDraggable,
  onDragEndItem,
  onDragLeaveFolder,
  onDragOverFolder,
  onDragStartItem,
  onDropOnFolder,
  onOpenFolder,
  onOpenDocument,
}: {
  items: FileBrowserItem[]
  draggedItemKeys: Set<string>
  dropTarget: BrowserDropTarget | null
  isDraggable: boolean
  onDragEndItem: () => void
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onDragStartItem: (event: DragEvent<HTMLElement>, item: FileBrowserItem) => void
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string) => void
  onOpenFolder: (folder: FolderSummary) => void
  onOpenDocument: (document: DocumentSummary) => void
}) {
  return (
    <div className="overflow-hidden border-y bg-background">
      <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7.5rem_7rem] gap-3 border-b bg-muted/40 px-4 py-3 text-sm font-medium text-muted-foreground md:grid lg:px-6">
        <span>Name</span>
        <span>Type</span>
        <span>Modified</span>
        <span>Status</span>
      </div>
      {items.map((item) => {
        const isFolder = item.type === "folder"
        const name = itemName(item)
        const updatedAt = isFolder ? item.folder.updatedAt : item.document.updatedAt
        const itemKey = getBrowserItemKey(item)

        return (
          <div
            key={isFolder ? `folder-${item.folder.id}` : `document-${item.document.id}`}
            data-vault-browser-item
            role="link"
            tabIndex={0}
            draggable={isDraggable}
            className={cn(
              "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_7rem_7.5rem_7rem] lg:px-6",
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
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                {isFolder ? <Folder className="size-6" /> : <FileText className="size-6" />}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{name}</div>
                <div className="mt-1 truncate text-sm text-muted-foreground md:hidden">
                  {isFolder ? "Folder" : formatBytes(item.document.originalSize)} · {formatDate(updatedAt)}
                </div>
              </div>
            </div>
            <span className="hidden text-sm text-muted-foreground md:block">
              {isFolder ? "Folder" : formatBytes(item.document.originalSize)}
            </span>
            <span className="hidden text-sm text-muted-foreground md:block">
              {formatDate(updatedAt)}
            </span>
            {isFolder ? (
              <ChevronRight className="size-4 text-muted-foreground md:hidden" />
            ) : (
              <Badge variant="outline" className={cn("hidden md:inline-flex", getDocumentStatusClass(item.document))}>
                {getDocumentStatusLabel(item.document)}
              </Badge>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function VaultWorkspacePage() {
  const { vaultId = "" } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view] = useVaultsView()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const directoryInputRef = useRef<HTMLInputElement | null>(null)
  const [vault, setVault] = useState<VaultDetail | null>(null)
  const [folders, setFolders] = useState<FolderTreeEntry[]>([])
  const [treeDocuments, setTreeDocuments] = useState<FolderTreeDocumentEntry[]>([])
  const [items, setItems] = useState<FileBrowserItem[]>([])
  const [vaultTreeExpandedValue, setVaultTreeExpandedValue] = useState<string[]>([
    VAULT_TREE_ROOT_VALUE,
  ])
  const [contextMenu, setContextMenu] = useState<VaultContextMenuState | null>(null)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [draggedItems, setDraggedItems] = useState<FileBrowserItem[]>([])
  const [dropTarget, setDropTarget] = useState<BrowserDropTarget | null>(null)
  const [loadingTree, setLoadingTree] = useState(true)
  const [loadingItems, setLoadingItems] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [itemMutationPending, setItemMutationPending] = useState(false)
  const [uploadConflictPrompt, setUploadConflictPrompt] = useState<UploadConflictPrompt | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const activeFolderId = searchParams.get("folderId")
  const normalizedFolderId = activeFolderId === "root" ? null : activeFolderId

  const sortedItems = useMemo(() => sortItems(items), [items])
  const draggedItemKeys = useMemo(
    () => new Set(draggedItems.map((item) => getBrowserItemKey(item))),
    [draggedItems]
  )

  const selectFolder = useCallback((folderId: string | null) => {
    setSearchParams(folderId ? { folderId } : {})
  }, [setSearchParams])

  const canMoveItems = vault?.role === "owner" || vault?.role === "editor"
  const canCreateItems = canMoveItems

  const refreshVaultContents = useCallback(async () => {
    const [treeResult, itemsResult] = await Promise.all([
      listFolderTree({ vaultId }),
      listFolderItems({ vaultId, folderId: normalizedFolderId }),
    ])

    setFolders(treeResult.folders)
    setTreeDocuments(treeResult.documents)
    setItems(itemsResult.items)
  }, [vaultId, normalizedFolderId])

  const requestUploadConflictStrategy = useCallback(
    (fileName: string, conflict: UploadConflictDetails) =>
      new Promise<UploadConflictStrategy>((resolve, reject) => {
        setUploadConflictPrompt({
          fileName,
          conflict,
          resolve: (strategy) => {
            setUploadConflictPrompt(null)
            resolve(strategy)
          },
          reject: () => {
            setUploadConflictPrompt(null)
            reject(new Error("Upload conflict was not resolved."))
          },
        })
      }),
    []
  )

  const uploadSelectedFiles = useCallback(async (selectedFiles: UploadFileInput[]) => {
    if (!vaultId || isUploading) {
      return
    }

    const acceptedFiles = filterAllowedUploadFiles(selectedFiles)
    const rejectedCount = selectedFiles.length - acceptedFiles.length

    if (acceptedFiles.length === 0) {
      toast.error("No supported files selected.")
      return
    }

    const toastId = toast.loading(
      acceptedFiles.length === 1 ? "Uploading 1 file..." : `Uploading ${acceptedFiles.length} files...`
    )

    setIsUploading(true)
    try {
      for (const input of acceptedFiles) {
        await uploadFileToVault({
          vaultId,
          folderId: normalizedFolderId,
          input,
          onConflict: requestUploadConflictStrategy,
        })
      }

      await refreshVaultContents()
      toast.success(
        rejectedCount > 0
          ? `Uploaded ${acceptedFiles.length} file${acceptedFiles.length === 1 ? "" : "s"}. ${rejectedCount} unsupported file${rejectedCount === 1 ? "" : "s"} skipped.`
          : `Uploaded ${acceptedFiles.length} file${acceptedFiles.length === 1 ? "" : "s"}.`,
        { id: toastId }
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.", { id: toastId })
    } finally {
      setIsUploading(false)
    }
  }, [isUploading, normalizedFolderId, refreshVaultContents, requestUploadConflictStrategy, vaultId])

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

  const openCreateFolderDialog = useCallback((parentId: string | null) => {
    setCreateFolderParentId(parentId)
    setIsCreateFolderOpen(true)
  }, [])

  const handleBackgroundContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest("[data-vault-browser-item]")) {
      return
    }

    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      vaultName: vault?.name ?? "Vault",
    })
  }, [vault?.name])

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
      await Promise.all(
        targets.map((target) =>
          target.type === "folder"
            ? moveFolder({ vaultId, folderId: target.folder.id, parentId: destinationId })
            : moveDocument({ vaultId, documentId: target.document.id, folderId: destinationId })
        )
      )

      await refreshVaultContents()
      toast.success(
        targets.length === 1
          ? "Item moved."
          : `${targets.length} items moved.`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to move item.")
    } finally {
      setItemMutationPending(false)
    }
  }, [itemMutationPending, refreshVaultContents, vaultId])

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

    const dragItems = [item]
    setDraggedItems(dragItems)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(INTERNAL_BROWSER_DRAG_TYPE, serializeBrowserDragItems(dragItems))
    event.dataTransfer.setData("text/plain", itemName(item))
  }, [canMoveItems, itemMutationPending])

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
        disabled={isUploading || !vaultId}
        onUploadFiles={openUploadFiles}
        onUploadFolder={openUploadDirectory}
      />
      <VaultsViewToggle />
    </>
  ), [isUploading, openUploadDirectory, openUploadFiles, vaultId])

  useEffect(() => {
    let ignore = false

    async function loadShell() {
      setLoadingTree(true)
      setErrorMessage(null)

      try {
        const [vaultResult, treeResult] = await Promise.all([
          getVault({ vaultId }),
          listFolderTree({ vaultId }),
        ])

        if (!ignore) {
          setVault(vaultResult.vault)
          setFolders(treeResult.folders)
          setTreeDocuments(treeResult.documents)
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load vault.")
        }
      } finally {
        if (!ignore) {
          setLoadingTree(false)
        }
      }
    }

    if (vaultId) {
      void loadShell()
    }

    return () => {
      ignore = true
    }
  }, [vaultId])

  useEffect(() => {
    let ignore = false

    async function loadItems() {
      setLoadingItems(true)
      setErrorMessage(null)

      try {
        const result = await listFolderItems({ vaultId, folderId: normalizedFolderId })

        if (!ignore) {
          setItems(result.items)
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
  }, [vaultId, normalizedFolderId])

  function openDocument(document: DocumentSummary) {
    navigate(`/vaults/${vaultId}/${document.id}`)
  }

  const currentFolder = useMemo(
    () => folders.find((folder) => folder.id === normalizedFolderId) ?? null,
    [folders, normalizedFolderId]
  )
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

  return (
    <BaseLayout>
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
      <Dialog
        open={uploadConflictPrompt !== null}
        onOpenChange={(open) => {
          if (!open) {
            uploadConflictPrompt?.reject()
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Document already exists</DialogTitle>
            <DialogDescription>
              {uploadConflictPrompt?.conflict.message ??
                "Choose how to handle this upload conflict."}
            </DialogDescription>
          </DialogHeader>
          {uploadConflictPrompt ? (
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="truncate font-medium">{uploadConflictPrompt.fileName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {uploadConflictPrompt.conflict.conflictType === "name"
                  ? "A document with this name already exists in this location."
                  : "A document with the same content already exists."}
              </p>
            </div>
          ) : null}
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => uploadConflictPrompt?.reject()}
            >
              Cancel upload
            </Button>
            <div className="flex flex-wrap justify-end gap-2">
              {uploadConflictPrompt?.conflict.availableStrategies.map((strategy) => (
                <Button
                  key={strategy}
                  type="button"
                  variant={strategy === "new_version" ? "default" : "outline"}
                  onClick={() => uploadConflictPrompt.resolve(strategy)}
                >
                  {conflictStrategyLabel(strategy)}
                </Button>
              ))}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      <div className="px-4 md:px-6">
        <div className="flex min-h-[calc(100vh-9rem)] flex-col overflow-hidden rounded-lg border bg-background">
          <header className="flex shrink-0 items-start gap-3 border-b bg-background px-4 py-3 md:px-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary md:size-12">
              {currentFolder ? <FolderOpen className="size-5" /> : <HardDrive className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight md:text-2xl">
                  {workspaceTitle}
                </h1>
                {!currentFolder ? <Badge variant="secondary">Vault</Badge> : null}
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span>{workspaceSubtitle}</span>
                {vault?.role ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{vault.role}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {workspaceActions}
              <Button type="button" variant="outline" size="icon" aria-label="Close vault" onClick={() => navigate("/vaults")}>
                <X className="size-4" />
              </Button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex h-56 shrink-0 flex-col border-b bg-muted/20 md:h-auto md:w-80 md:border-r md:border-b-0">
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-2">
                {loadingTree ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Loading tree...</div>
                ) : (
                  <VaultSidebarTree
                    vaults={vault ? [{ id: vault.id, name: vault.name }] : []}
                    activeVaultId={vaultId}
                    activeVaultRootOnly
                    expandedValue={vaultTreeExpandedValue}
                    onExpandedValueChange={setVaultTreeExpandedValue}
                    currentFolderId={normalizedFolderId}
                    currentDocumentId={null}
                    folders={folders}
                    documents={treeDocuments}
                    onSelectVault={() => selectFolder(null)}
                    onSelectFolder={selectFolder}
                    onSelectDocument={(selectedVaultId, documentId) => {
                      navigate(`/vaults/${selectedVaultId}/${documentId}`)
                    }}
                    canMoveItems={canMoveItems}
                    itemMutationPending={itemMutationPending}
                    draggedItems={draggedItems}
                    dropTarget={dropTarget}
                    onDragStartItem={handleItemDragStart}
                    onDragEndItem={resetDragState}
                    onDragOverFolder={handleDragOverFolder}
                    onDragLeaveFolder={handleDragLeaveFolder}
                    onDropOnFolder={handleDropOnFolder}
                    onMoveItems={handleMoveItems}
                  />
                )}
              </div>
            </ScrollArea>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col" onContextMenu={handleBackgroundContextMenu}>
            <div className="min-h-0 flex-1 overflow-auto py-4">
              {errorMessage ? (
                <div className="mx-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive lg:mx-6">
                  {errorMessage}
                </div>
              ) : loadingItems ? (
                <div className="mx-4 flex h-64 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground lg:mx-6">
                  Loading contents...
                </div>
              ) : sortedItems.length === 0 ? (
                <div className="mx-4 flex min-h-80 flex-col items-center justify-center rounded-lg border bg-muted/20 p-8 text-center lg:mx-6">
                  <div className="flex size-14 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <FolderOpen className="size-7" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold">This folder is empty</h2>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    Documents and folders in this location will appear here.
                  </p>
                </div>
              ) : view === "grid" ? (
                <div className="px-4 lg:px-6">
                  <ContentGrid
                    items={sortedItems}
                    draggedItemKeys={draggedItemKeys}
                    dropTarget={dropTarget}
                    isDraggable={canMoveItems && !itemMutationPending}
                    onDragEndItem={resetDragState}
                    onDragLeaveFolder={handleDragLeaveFolder}
                    onDragOverFolder={handleDragOverFolder}
                    onDragStartItem={handleItemDragStart}
                    onDropOnFolder={handleDropOnFolder}
                    onOpenFolder={(folder) => selectFolder(folder.id)}
                    onOpenDocument={openDocument}
                  />
                </div>
              ) : (
                <ContentList
                  items={sortedItems}
                  draggedItemKeys={draggedItemKeys}
                  dropTarget={dropTarget}
                  isDraggable={canMoveItems && !itemMutationPending}
                  onDragEndItem={resetDragState}
                  onDragLeaveFolder={handleDragLeaveFolder}
                  onDragOverFolder={handleDragOverFolder}
                  onDragStartItem={handleItemDragStart}
                  onDropOnFolder={handleDropOnFolder}
                  onOpenFolder={(folder) => selectFolder(folder.id)}
                  onOpenDocument={openDocument}
                />
              )}
            </div>
          </main>
          </div>
        </div>
      </div>
    </BaseLayout>
  )
}
