"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import {
  AlertCircle,
  Archive,
  Check,
  ChevronDown,
  Eye,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getDocumentFileIcon } from "./document-file-icons"
import { VaultsViewToggle } from "./components/vaults-view-toggle"
import { useVaultsView } from "./use-vaults-view"
import {
  getBulkDocumentDeletionImpact,
  getDocumentDeletionImpact,
  getDocumentDuplicateConflict,
  listDeletedDocuments,
  listVaults,
  permanentlyDeleteDocument,
  restoreDocument,
  type BulkDocumentDeletionImpactPreview,
  type DeletedDocumentSummary,
  type DocumentDeletionImpactPreview,
  type DocumentDuplicateConflict,
  type UploadConflictStrategy,
  type VaultSummary,
} from "./vaults.api"

type TrashSort = "deleted_desc" | "deleted_asc" | "name_asc" | "name_desc"

interface SelectionState {
  keys: Set<string>
  lastKey: string | null
}

interface TrashContextMenuState {
  document: DeletedDocumentSummary
  x: number
  y: number
}

const trashSortOptions: Array<{ value: TrashSort; label: string }> = [
  { value: "deleted_desc", label: "Recent" },
  { value: "deleted_asc", label: "Oldest" },
  { value: "name_asc", label: "A to Z" },
  { value: "name_desc", label: "Z to A" },
]

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

function getDeletedTime(document: DeletedDocumentSummary) {
  return document.deletedAt ? new Date(document.deletedAt).getTime() : 0
}

function compareTrashDocuments(left: DeletedDocumentSummary, right: DeletedDocumentSummary, sortBy: TrashSort) {
  if (sortBy === "name_desc") {
    return right.name.localeCompare(left.name, undefined, { sensitivity: "base" })
  }

  if (sortBy === "deleted_desc") {
    return (
      getDeletedTime(right) - getDeletedTime(left) ||
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    )
  }

  if (sortBy === "deleted_asc") {
    return (
      getDeletedTime(left) - getDeletedTime(right) ||
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    )
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
}

function conflictStrategyLabel(strategy: UploadConflictStrategy) {
  switch (strategy) {
    case "skip":
      return "Skip"
    case "keep_both":
      return "Keep both"
    case "new_version":
      return "New version"
    default:
      return strategy
  }
}

function getDocumentKey(document: DeletedDocumentSummary) {
  return `document-${document.id}`
}

function getSelectedVaultIds(searchParams: URLSearchParams) {
  return searchParams
    .getAll("vaultId")
    .map((value) => value.trim())
    .filter(Boolean)
}

function setVaultSearchParams(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  values: string[]
) {
  const params = new URLSearchParams()
  values.forEach((value) => params.append("vaultId", value))
  setSearchParams(params, { replace: true })
}

export default function TrashPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedVaultIds = useMemo(() => getSelectedVaultIds(searchParams), [searchParams])
  const queryVaultId = selectedVaultIds.length === 1 ? selectedVaultIds[0] : undefined
  const selectedVaultIdSet = useMemo(() => new Set(selectedVaultIds), [selectedVaultIds])
  const [documents, setDocuments] = useState<DeletedDocumentSummary[]>([])
  const [vaults, setVaults] = useState<VaultSummary[]>([])
  const [retentionDays, setRetentionDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [browserView] = useVaultsView()
  const [browserSort, setBrowserSort] = useState<TrashSort>("deleted_desc")
  const [contextMenu, setContextMenu] = useState<TrashContextMenuState | null>(null)
  const [selection, setSelection] = useState<SelectionState>(() => ({
    keys: new Set(),
    lastKey: null,
  }))
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<DeletedDocumentSummary[]>([])
  const [restoreConflict, setRestoreConflict] = useState<{
    documents: DeletedDocumentSummary[]
    conflict: DocumentDuplicateConflict
  } | null>(null)
  const [deleteImpact, setDeleteImpact] = useState<
    DocumentDeletionImpactPreview | BulkDocumentDeletionImpactPreview | null
  >(null)
  const [isDeleteImpactLoading, setIsDeleteImpactLoading] = useState(false)
  const [deleteImpactError, setDeleteImpactError] = useState<string | null>(null)
  const [itemMutationPending, setItemMutationPending] = useState(false)

  const refreshTrash = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)

    try {
      const [trashResult, vaultsResult] = await Promise.all([
        listDeletedDocuments({ vaultId: queryVaultId }),
        listVaults(),
      ])
      setDocuments(trashResult.documents)
      setRetentionDays(trashResult.retentionDays)
      setVaults(vaultsResult.vaults)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load trash.")
    } finally {
      setLoading(false)
    }
  }, [queryVaultId])

  useEffect(() => {
    void refreshTrash()
  }, [refreshTrash])

  const visibleDocuments = useMemo(
    () =>
      documents
        .filter((document) => selectedVaultIdSet.size === 0 || selectedVaultIdSet.has(document.vaultId))
        .sort((left, right) => compareTrashDocuments(left, right, browserSort)),
    [browserSort, documents, selectedVaultIdSet]
  )

  const selectedKeys = selection.keys
  const selectedDocuments = useMemo(
    () => visibleDocuments.filter((document) => selectedKeys.has(getDocumentKey(document))),
    [selectedKeys, visibleDocuments]
  )
  const selectedCount = selectedDocuments.length
  const allItemsSelected = visibleDocuments.length > 0 && selectedCount === visibleDocuments.length
  const someItemsSelected = selectedCount > 0 && !allItemsSelected
  const emptyState = !loading && errorMessage === null && visibleDocuments.length === 0
  const selectedVaultsLabel =
    selectedVaultIds.length === 0
      ? "All vaults"
      : selectedVaultIds.length === 1
        ? (vaults.find((vault) => vault.id === selectedVaultIds[0])?.name ?? "1 vault")
        : `${selectedVaultIds.length} vaults`

  const clearSelection = useCallback(() => {
    setSelection({ keys: new Set(), lastKey: null })
  }, [])

  const updateVaultFilter = useCallback(
    (values: string[]) => {
      setVaultSearchParams(setSearchParams, values)
      clearSelection()
    },
    [clearSelection, setSearchParams]
  )

  function toggleDocument(document: DeletedDocumentSummary, checked: boolean) {
    const key = getDocumentKey(document)
    setSelection((current) => {
      const nextKeys = new Set(current.keys)
      if (checked) {
        nextKeys.add(key)
      } else {
        nextKeys.delete(key)
      }
      return { keys: nextKeys, lastKey: key }
    })
  }

  function toggleAllDocuments(checked: boolean) {
    setSelection({
      keys: checked ? new Set(visibleDocuments.map((document) => getDocumentKey(document))) : new Set(),
      lastKey: null,
    })
  }

  function openDocument(document: DeletedDocumentSummary) {
    navigate(`/trash/${document.id}`)
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, document: DeletedDocumentSummary) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ document, x: event.clientX, y: event.clientY })
  }

  function closePermanentDeleteDialog() {
    setPendingPermanentDelete([])
    setDeleteImpact(null)
    setDeleteImpactError(null)
    setIsDeleteImpactLoading(false)
  }

  function openPermanentDeleteDialog(nextDocuments: DeletedDocumentSummary[]) {
    setPendingPermanentDelete(nextDocuments)
    setDeleteImpact(null)
    setDeleteImpactError(null)

    if (nextDocuments.length === 0) {
      return
    }

    setIsDeleteImpactLoading(true)
    const request =
      nextDocuments.length === 1
        ? getDocumentDeletionImpact({
            vaultId: nextDocuments[0]!.vaultId,
            documentId: nextDocuments[0]!.id,
            includeDeleted: true,
            limit: 5,
          })
        : getBulkDocumentDeletionImpact({
            documents: nextDocuments.map((document) => ({
              vaultId: document.vaultId,
              documentId: document.id,
            })),
            includeDeleted: true,
          })

    void request
      .then(({ impact }) => {
        setDeleteImpact(impact)
      })
      .catch((error) => {
        setDeleteImpactError(error instanceof Error ? error.message : "Could not check affected conversations.")
      })
      .finally(() => {
        setIsDeleteImpactLoading(false)
      })
  }

  async function restoreDocuments({
    documents: targets,
    conflictStrategy,
  }: {
    documents: DeletedDocumentSummary[]
    conflictStrategy?: UploadConflictStrategy
  }) {
    if (targets.length === 0 || itemMutationPending) return

    setItemMutationPending(true)
    try {
      const results = await Promise.all(
        targets.map((document) =>
          restoreDocument({
            vaultId: document.vaultId,
            documentId: document.id,
            conflictStrategy,
          })
        )
      )
      const skipped = results.every((item) => item.skipped)

      toast.success(
        skipped
          ? "Restore skipped."
          : targets.length === 1
            ? (results[0]?.message ?? "File restored to original location")
            : `${targets.length} documents restored.`
      )
      clearSelection()
      setContextMenu(null)
      if (conflictStrategy !== undefined) {
        setRestoreConflict(null)
      }
      if (!skipped) {
        setDocuments((current) => current.filter((document) => !targets.some((target) => target.id === document.id)))
      }
      await refreshTrash()
    } catch (error) {
      const conflict = getDocumentDuplicateConflict(error)
      if (targets.length === 1 && conflict !== null && conflict.availableStrategies.length > 0) {
        setRestoreConflict({ documents: targets, conflict })
        return
      }

      toast.error(error instanceof Error ? error.message : "Could not restore documents.")
    } finally {
      setItemMutationPending(false)
    }
  }

  async function permanentlyDeleteDocuments(targets: DeletedDocumentSummary[]) {
    if (targets.length === 0 || itemMutationPending) return

    setItemMutationPending(true)
    try {
      await Promise.all(
        targets.map((document) =>
          permanentlyDeleteDocument({
            vaultId: document.vaultId,
            documentId: document.id,
          })
        )
      )
      toast.success(
        targets.length === 1
          ? "Document permanently deleted."
          : `${targets.length} documents permanently deleted.`
      )
      clearSelection()
      setContextMenu(null)
      closePermanentDeleteDialog()
      setDocuments((current) => current.filter((document) => !targets.some((target) => target.id === document.id)))
      await refreshTrash()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not permanently delete documents.")
    } finally {
      setItemMutationPending(false)
    }
  }

  return (
    <BaseLayout>
      <section className="flex h-[calc(100vh-6rem)] min-h-[620px] flex-col overflow-hidden border bg-background">
        <header className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b px-4 py-4 md:px-6">
            {selectedCount > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
                Clear
              </Button>
            ) : null}
            <VaultFilter
              vaults={vaults}
              selectedVaultIds={selectedVaultIds}
              label={selectedVaultsLabel}
              onChange={updateVaultFilter}
            />
            <Select value={browserSort} onValueChange={(value) => setBrowserSort(value as TrashSort)}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue aria-label="Sort trashed documents" />
              </SelectTrigger>
              <SelectContent>
                {trashSortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={visibleDocuments.length === 0 || itemMutationPending}
              onClick={() => openPermanentDeleteDialog(visibleDocuments)}
            >
              Empty trash
            </Button>
            <VaultsViewToggle />
        </header>

        {loading ? (
          <div className="flex h-20 shrink-0 items-center gap-2 border-b px-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading trash...
          </div>
        ) : null}

        {errorMessage ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive md:m-6">
            {errorMessage}
          </div>
        ) : null}

        {emptyState ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
            <div>
              <div className="mx-auto flex size-12 items-center justify-center rounded-md border bg-muted/30 text-muted-foreground">
                <Trash2 className="size-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold">Trash is empty</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Deleted documents will appear here until their retention window ends.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && !errorMessage && !emptyState ? (
          <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            {browserView === "list" ? (
              <TrashList
                documents={visibleDocuments}
                selectedKeys={selectedKeys}
                allItemsSelected={allItemsSelected}
                someItemsSelected={someItemsSelected}
                itemMutationPending={itemMutationPending}
                onToggleAll={toggleAllDocuments}
                onToggleDocument={toggleDocument}
                onOpenDocument={openDocument}
                onOpenContextMenu={openContextMenu}
                onRestore={(document) => void restoreDocuments({ documents: [document] })}
                onDelete={(document) => openPermanentDeleteDialog([document])}
              />
            ) : (
              <TrashGrid
                documents={visibleDocuments}
                selectedKeys={selectedKeys}
                itemMutationPending={itemMutationPending}
                onToggleDocument={toggleDocument}
                onOpenDocument={openDocument}
                onOpenContextMenu={openContextMenu}
                onRestore={(document) => void restoreDocuments({ documents: [document] })}
                onDelete={(document) => openPermanentDeleteDialog([document])}
              />
            )}
          </div>
        ) : null}

        <footer className="shrink-0 border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground md:px-6">
          Trashed documents stay here for {retentionDays} days before Arkivra removes them automatically.
        </footer>
      </section>

      {contextMenu !== null ? (
        <TrashItemContextMenu
          state={contextMenu}
          itemMutationPending={itemMutationPending}
          onClose={() => setContextMenu(null)}
          onOpen={(document) => openDocument(document)}
          onRestore={(document) => void restoreDocuments({ documents: [document] })}
          onDelete={(document) => openPermanentDeleteDialog([document])}
        />
      ) : null}

      <PermanentDeleteDialog
        documents={pendingPermanentDelete}
        visibleDocumentCount={visibleDocuments.length}
        impact={deleteImpact}
        isImpactLoading={isDeleteImpactLoading}
        impactError={deleteImpactError}
        isPending={itemMutationPending}
        onClose={closePermanentDeleteDialog}
        onConfirm={() => void permanentlyDeleteDocuments(pendingPermanentDelete)}
      />

      <RestoreConflictDialog
        state={restoreConflict}
        isPending={itemMutationPending}
        onClose={() => setRestoreConflict(null)}
        onResolve={(strategy) => {
          if (restoreConflict === null) return
          void restoreDocuments({ documents: restoreConflict.documents, conflictStrategy: strategy })
        }}
      />

      {selectedDocuments.length > 0 ? (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md border bg-background px-4 py-3 shadow-lg">
          <span className="text-sm font-medium">{selectedDocuments.length} selected</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={itemMutationPending}
            onClick={() => void restoreDocuments({ documents: selectedDocuments })}
          >
            <RotateCcw className="size-4" />
            Restore
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={itemMutationPending}
            onClick={() => openPermanentDeleteDialog(selectedDocuments)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      ) : null}
    </BaseLayout>
  )
}

function VaultFilter({
  vaults,
  selectedVaultIds,
  label,
  onChange,
}: {
  vaults: VaultSummary[]
  selectedVaultIds: string[]
  label: string
  onChange: (values: string[]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="w-40 justify-between">
          <span className="truncate">{label}</span>
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => onChange([])}>
          <Archive className="size-4" />
          All vaults
          {selectedVaultIds.length === 0 ? <Check className="ml-auto size-4" /> : null}
        </DropdownMenuItem>
        {vaults.map((vault) => {
          const checked = selectedVaultIds.includes(vault.id)
          return (
            <DropdownMenuCheckboxItem
              key={vault.id}
              checked={checked}
              onCheckedChange={(nextChecked) => {
                onChange(
                  nextChecked
                    ? [...selectedVaultIds, vault.id]
                    : selectedVaultIds.filter((id) => id !== vault.id)
                )
              }}
            >
              {vault.name}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TrashList({
  documents,
  selectedKeys,
  allItemsSelected,
  someItemsSelected,
  itemMutationPending,
  onToggleAll,
  onToggleDocument,
  onOpenDocument,
  onOpenContextMenu,
  onRestore,
  onDelete,
}: {
  documents: DeletedDocumentSummary[]
  selectedKeys: Set<string>
  allItemsSelected: boolean
  someItemsSelected: boolean
  itemMutationPending: boolean
  onToggleAll: (checked: boolean) => void
  onToggleDocument: (document: DeletedDocumentSummary, checked: boolean) => void
  onOpenDocument: (document: DeletedDocumentSummary) => void
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, document: DeletedDocumentSummary) => void
  onRestore: (document: DeletedDocumentSummary) => void
  onDelete: (document: DeletedDocumentSummary) => void
}) {
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="hidden grid-cols-[auto_minmax(0,1fr)_12rem_8rem_7rem_5rem] gap-3 border-b bg-muted/40 px-4 py-3 text-sm font-medium text-muted-foreground md:grid">
        <Checkbox
          aria-label="Select all trashed documents"
          checked={allItemsSelected ? true : someItemsSelected ? "indeterminate" : false}
          onCheckedChange={(checked) => onToggleAll(checked === true)}
        />
        <span>Name</span>
        <span>Original vault</span>
        <span>Deleted</span>
        <span>Size</span>
        <span />
      </div>
      {documents.map((document) => {
        const key = getDocumentKey(document)
        const isSelected = selectedKeys.has(key)
        const DocumentIcon = getDocumentFileIcon(document)
        return (
          <div
            key={document.id}
            data-trash-item
            role="link"
            tabIndex={0}
            className={cn(
              "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[auto_minmax(0,1fr)_12rem_8rem_7rem_5rem]",
              isSelected && "bg-accent/40"
            )}
            onClick={() => onOpenDocument(document)}
            onContextMenu={(event) => onOpenContextMenu(event, document)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onOpenDocument(document)
              }
            }}
          >
            <Checkbox
              aria-label={`Select ${document.name}`}
              checked={isSelected}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(checked) => onToggleDocument(document, checked === true)}
            />
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                <DocumentIcon className="size-5" strokeWidth={1.9} />
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{document.name}</div>
                <div className="mt-1 truncate text-sm text-muted-foreground md:hidden">
                  {document.vaultName} · {formatDate(document.deletedAt)} · {formatBytes(document.originalSize)}
                </div>
              </div>
            </div>
            <span className="hidden truncate text-sm text-muted-foreground md:block">{document.vaultName}</span>
            <span className="hidden text-sm text-muted-foreground md:block">{formatDate(document.deletedAt)}</span>
            <span className="hidden text-sm text-muted-foreground md:block">{formatBytes(document.originalSize)}</span>
            <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
              <Button asChild size="icon" variant="ghost" aria-label={`Open ${document.name}`}>
                <Link to={`/trash/${document.id}`}>
                  <Eye className="size-4" />
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Actions for ${document.name}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={itemMutationPending} onSelect={() => onRestore(document)}>
                    <RotateCcw className="size-4" />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={itemMutationPending}
                    className="text-destructive focus:text-destructive"
                    onSelect={() => onDelete(document)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TrashGrid({
  documents,
  selectedKeys,
  itemMutationPending,
  onToggleDocument,
  onOpenDocument,
  onOpenContextMenu,
  onRestore,
  onDelete,
}: {
  documents: DeletedDocumentSummary[]
  selectedKeys: Set<string>
  itemMutationPending: boolean
  onToggleDocument: (document: DeletedDocumentSummary, checked: boolean) => void
  onOpenDocument: (document: DeletedDocumentSummary) => void
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, document: DeletedDocumentSummary) => void
  onRestore: (document: DeletedDocumentSummary) => void
  onDelete: (document: DeletedDocumentSummary) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {documents.map((document) => {
        const key = getDocumentKey(document)
        const isSelected = selectedKeys.has(key)
        const DocumentIcon = getDocumentFileIcon(document)
        return (
          <Card
            key={document.id}
            data-trash-item
            role="link"
            tabIndex={0}
            className={cn(
              "relative cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              isSelected && "border-primary/60 bg-accent/40"
            )}
            onClick={() => onOpenDocument(document)}
            onContextMenu={(event) => onOpenContextMenu(event, document)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onOpenDocument(document)
              }
            }}
          >
            <div className="absolute top-3 left-3 z-10">
              <Checkbox
                aria-label={`Select ${document.name}`}
                checked={isSelected}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(checked) => onToggleDocument(document, checked === true)}
              />
            </div>
            <div className="absolute top-2 right-2 z-10" onClick={(event) => event.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" aria-label={`Actions for ${document.name}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={itemMutationPending} onSelect={() => onRestore(document)}>
                    <RotateCcw className="size-4" />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={itemMutationPending}
                    className="text-destructive focus:text-destructive"
                    onSelect={() => onDelete(document)}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <CardContent className="flex min-h-44 flex-col items-center justify-center p-4 text-center">
              <div className="flex size-11 items-center justify-center rounded-md border bg-background text-muted-foreground">
                <DocumentIcon className="size-5" strokeWidth={1.9} />
              </div>
              <h2 className="mt-3 max-w-full truncate text-sm font-semibold">{document.name}</h2>
              <div className="mt-3 flex max-w-full flex-col items-center gap-1 text-xs text-muted-foreground">
                <span className="max-w-full truncate">{document.vaultName}</span>
                <span>Deleted {formatDate(document.deletedAt)}</span>
                <span>{formatBytes(document.originalSize)}</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function TrashItemContextMenu({
  state,
  itemMutationPending,
  onClose,
  onOpen,
  onRestore,
  onDelete,
}: {
  state: TrashContextMenuState
  itemMutationPending: boolean
  onClose: () => void
  onOpen: (document: DeletedDocumentSummary) => void
  onRestore: (document: DeletedDocumentSummary) => void
  onDelete: (document: DeletedDocumentSummary) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ x: state.x, y: state.y })

  useEffect(() => {
    const menu = menuRef.current
    if (menu === null) return

    const viewportMargin = 8
    const rect = menu.getBoundingClientRect()
    const maxX = Math.max(viewportMargin, window.innerWidth - rect.width - viewportMargin)
    const maxY = Math.max(viewportMargin, window.innerHeight - rect.height - viewportMargin)
    setPosition({
      x: Math.min(Math.max(state.x, viewportMargin), maxX),
      y: Math.min(Math.max(state.y, viewportMargin), maxY),
    })
  }, [state.x, state.y])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      onClose()
    }

    function closeOnOutsideContextMenu(event: globalThis.MouseEvent) {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      onClose()
    }

    window.addEventListener("keydown", closeOnEscape)
    window.addEventListener("resize", onClose)
    window.addEventListener("scroll", onClose, { capture: true })
    window.document.addEventListener("pointerdown", closeOnOutsidePointer, { capture: true })
    window.document.addEventListener("contextmenu", closeOnOutsideContextMenu, { capture: true })

    return () => {
      window.removeEventListener("keydown", closeOnEscape)
      window.removeEventListener("resize", onClose)
      window.removeEventListener("scroll", onClose, { capture: true })
      window.document.removeEventListener("pointerdown", closeOnOutsidePointer, { capture: true })
      window.document.removeEventListener("contextmenu", closeOnOutsideContextMenu, { capture: true })
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${state.document.name}`}
      className="fixed z-50 min-w-48 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-xl"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ContextMenuButton
        icon={Eye}
        label="Open"
        onClick={() => {
          onClose()
          onOpen(state.document)
        }}
      />
      <ContextMenuButton
        icon={RotateCcw}
        label="Restore"
        disabled={itemMutationPending}
        onClick={() => {
          onClose()
          onRestore(state.document)
        }}
      />
      <ContextMenuButton
        icon={Trash2}
        label="Delete"
        tone="destructive"
        disabled={itemMutationPending}
        onClick={() => {
          onClose()
          onDelete(state.document)
        }}
      />
    </div>,
    document.body
  )
}

function ContextMenuButton({
  disabled,
  icon: Icon,
  label,
  tone = "default",
  onClick,
}: {
  disabled?: boolean
  icon: typeof Eye
  label: string
  tone?: "default" | "destructive"
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors",
        disabled
          ? "cursor-not-allowed opacity-55"
          : tone === "destructive"
            ? "cursor-pointer text-destructive hover:bg-destructive/10"
            : "cursor-pointer hover:bg-accent hover:text-accent-foreground"
      )}
      onClick={onClick}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

function PermanentDeleteDialog({
  documents,
  visibleDocumentCount,
  impact,
  isImpactLoading,
  impactError,
  isPending,
  onClose,
  onConfirm,
}: {
  documents: DeletedDocumentSummary[]
  visibleDocumentCount: number
  impact: DocumentDeletionImpactPreview | BulkDocumentDeletionImpactPreview | null
  isImpactLoading: boolean
  impactError: string | null
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const open = documents.length > 0
  const title =
    documents.length === 0
      ? "Delete?"
      : documents.length === 1
        ? `Delete ${documents[0]?.name}?`
        : `Delete ${documents.length} documents?`
  const description =
    documents.length === visibleDocumentCount && documents.length > 0
      ? "This permanently deletes every visible document in Trash. This action cannot be undone."
      : "This permanently deletes the selected document data from Arkivra. This action cannot be undone."
  const confirmLabel = documents.length === 1 ? "Delete document" : `Delete ${documents.length} documents`

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>
              {isImpactLoading ? (
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Checking affected conversations...
                </div>
              ) : impactError !== null ? (
                <div className="flex items-center gap-3 text-sm font-semibold text-destructive">
                  <AlertCircle className="size-4" />
                  {impactError}
                </div>
              ) : impact !== null && impact.affectedConversationCount > 0 ? (
                "affectedConversations" in impact ? (
                  <DocumentDeletionImpactWarning impact={impact} />
                ) : (
                  <BulkDocumentDeletionImpactWarning impact={impact} />
                )
              ) : (
                <span>{description}</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending || isImpactLoading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || isImpactLoading || impactError !== null}
            onClick={onConfirm}
          >
            {isPending ? "Deleting..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BulkDocumentDeletionImpactWarning({ impact }: { impact: BulkDocumentDeletionImpactPreview }) {
  return (
    <div className="space-y-3 text-sm leading-6 text-muted-foreground">
      <p>These documents are referenced by conversations.</p>
      <p>This may affect existing conversations.</p>
      <p>Affected conversations: {impact.affectedConversationCount}</p>
      <p>Deleting these documents will:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>permanently remove all versions</li>
        <li>preserve conversation history</li>
        <li>make affected conversations read-only</li>
      </ul>
    </div>
  )
}

function DocumentDeletionImpactWarning({ impact }: { impact: DocumentDeletionImpactPreview }) {
  const shownCount = impact.affectedConversations.length
  const hasMore = impact.affectedConversationCount > shownCount

  return (
    <div className="space-y-3 text-sm leading-6 text-muted-foreground">
      <p>This document contains {impact.versionCount} versions.</p>
      <p>
        Some versions are referenced by {impact.affectedConversationCount}{" "}
        {impact.affectedConversationCount === 1 ? "conversation" : "conversations"}.
      </p>
      <p>Deleting this document will:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>permanently remove all versions</li>
        <li>preserve conversation history</li>
        <li>make the affected conversations read-only</li>
      </ul>
      <p>Affected conversations{hasMore ? ` (${impact.affectedConversationCount})` : ""}:</p>
      <ul className="list-disc space-y-1 pl-5">
        {impact.affectedConversations.map((conversation) => (
          <li key={conversation.id} className="break-words">
            {conversation.title}
          </li>
        ))}
      </ul>
      {hasMore ? <p>Showing {shownCount} of {impact.affectedConversationCount} conversations.</p> : null}
    </div>
  )
}

function RestoreConflictDialog({
  state,
  isPending,
  onClose,
  onResolve,
}: {
  state: { documents: DeletedDocumentSummary[]; conflict: DocumentDuplicateConflict } | null
  isPending: boolean
  onClose: () => void
  onResolve: (strategy: UploadConflictStrategy) => void
}) {
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Document already exists</DialogTitle>
          <DialogDescription>
            {state?.conflict.message ?? "A document with this file already exists in this vault."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {state?.conflict.availableStrategies.map((strategy) => (
            <Button
              key={strategy}
              type="button"
              variant={strategy === "keep_both" ? "default" : "outline"}
              disabled={isPending}
              onClick={() => onResolve(strategy)}
            >
              {conflictStrategyLabel(strategy)}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
