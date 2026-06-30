"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type InputHTMLAttributes } from "react"
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
} from "lucide-react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useHeaderActions } from "@/contexts/header-actions-context"
import { cn } from "@/lib/utils"
import { VAULT_TREE_ROOT_VALUE, VaultSidebarTree } from "./components/vault-sidebar-tree"
import { VaultUploadMenu } from "./components/vault-upload-menu"
import { VaultsViewToggle } from "./components/vaults-view-toggle"
import {
  filterAllowedUploadFiles,
  normalizeUploadFileName,
  UPLOAD_ACCEPT_ATTRIBUTE,
  type UploadFileInput,
} from "./upload-file-rules"
import { completeUploadSession, initUploadSession, uploadPart } from "./uploads.api"
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

function getUploadRelativePath(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return relativePath && relativePath.length > 0 ? relativePath : null
}

async function uploadFileToVault({
  vaultId,
  folderId,
  input,
}: {
  vaultId: string
  folderId: string | null
  input: UploadFileInput
}) {
  const { file, relativePath = null } = input
  const initResult = await initUploadSession({
    vaultId,
    folderId,
    relativePath,
    fileName: normalizeUploadFileName(file.name),
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

  await completeUploadSession({ vaultId, uploadId: upload.id })
}

function ContentGrid({
  items,
  onOpenFolder,
  onOpenDocument,
}: {
  items: FileBrowserItem[]
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

        return (
          <Card
            key={isFolder ? `folder-${item.folder.id}` : `document-${item.document.id}`}
            role="link"
            tabIndex={0}
            className="cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            onClick={() => isFolder ? onOpenFolder(item.folder) : onOpenDocument(item.document)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                isFolder ? onOpenFolder(item.folder) : onOpenDocument(item.document)
              }
            }}
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
  onOpenFolder,
  onOpenDocument,
}: {
  items: FileBrowserItem[]
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

        return (
          <div
            key={isFolder ? `folder-${item.folder.id}` : `document-${item.document.id}`}
            role="link"
            tabIndex={0}
            className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_7rem_7.5rem_7rem] lg:px-6"
            onClick={() => isFolder ? onOpenFolder(item.folder) : onOpenDocument(item.document)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                isFolder ? onOpenFolder(item.folder) : onOpenDocument(item.document)
              }
            }}
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
  const [loadingTree, setLoadingTree] = useState(true)
  const [loadingItems, setLoadingItems] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [itemMutationPending, setItemMutationPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const activeFolderId = searchParams.get("folderId")
  const normalizedFolderId = activeFolderId === "root" ? null : activeFolderId

  const sortedItems = useMemo(() => sortItems(items), [items])

  const selectFolder = useCallback((folderId: string | null) => {
    setSearchParams(folderId ? { folderId } : {})
  }, [setSearchParams])

  const canMoveItems = vault?.role === "owner" || vault?.role === "editor"

  const refreshVaultContents = useCallback(async () => {
    const [treeResult, itemsResult] = await Promise.all([
      listFolderTree({ vaultId }),
      listFolderItems({ vaultId, folderId: normalizedFolderId }),
    ])

    setFolders(treeResult.folders)
    setTreeDocuments(treeResult.documents)
    setItems(itemsResult.items)
  }, [vaultId, normalizedFolderId])

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
  }, [isUploading, normalizedFolderId, refreshVaultContents, vaultId])

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

  const headerActions = useMemo(() => (
    <>
      <VaultUploadMenu
        disabled={isUploading || !vaultId}
        onUploadFiles={openUploadFiles}
        onUploadFolder={openUploadDirectory}
      />
      <VaultsViewToggle />
    </>
  ), [isUploading, openUploadDirectory, openUploadFiles, vaultId])

  useHeaderActions(headerActions)

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
      <div className="px-4 md:px-6">
        <div className="flex min-h-[calc(100vh-9rem)] overflow-hidden rounded-lg border bg-background">
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
                    onMoveItems={handleMoveItems}
                  />
                )}
              </div>
            </ScrollArea>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
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
                    onOpenFolder={(folder) => selectFolder(folder.id)}
                    onOpenDocument={openDocument}
                  />
                </div>
              ) : (
                <ContentList
                  items={sortedItems}
                  onOpenFolder={(folder) => selectFolder(folder.id)}
                  onOpenDocument={openDocument}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </BaseLayout>
  )
}
