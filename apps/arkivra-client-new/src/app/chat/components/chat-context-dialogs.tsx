"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { VirtualItem } from "@tanstack/react-virtual"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronsUpDown, Search, Vault } from "lucide-react"

import { searchAllDocuments, type SearchResultItem } from "@/app/search/search.api"
import { listVaults, type VaultSummary } from "@/app/vaults/vaults.api"
import { Button } from "@/components/ui/button"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import {
  documentKey,
  draftDocumentFromSearchResult,
  normalizeDraftContext,
  type DraftChatContext,
  type DraftChatDocument,
  type DraftChatVault,
} from "../chat-context-model"

function canReadVault(vault: VaultSummary) {
  return (
    vault.role === "owner" ||
    vault.role === "editor" ||
    vault.role === "viewer" ||
    vault.isAdmin === true ||
    vault.accessMode === "admin"
  )
}

export function useChatContextVaults() {
  const [vaults, setVaults] = useState<VaultSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadVaults() {
      setIsLoading(true)
      setError(null)

      try {
        const result = await listVaults()
        if (!cancelled) {
          setVaults(result.vaults)
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Failed to load vaults.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadVaults()

    return () => {
      cancelled = true
    }
  }, [])

  return { vaults, isLoading, error }
}

export function VaultSelectionDialog({
  open,
  context,
  vaults,
  isLoading,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  context: DraftChatContext
  vaults: VaultSummary[]
  isLoading?: boolean
  error?: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (vaults: DraftChatVault[]) => void
}) {
  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const availableVaults = useMemo(
    () => vaults.filter(canReadVault),
    [vaults]
  )
  const selectedVaultById = useMemo(
    () => new Map(normalizeDraftContext(context).vaults.map((vault) => [vault.vaultId, vault])),
    [context]
  )
  const filteredVaults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return availableVaults

    return availableVaults.filter(
      (vault) =>
        vault.name.toLowerCase().includes(normalizedQuery) ||
        vault.description?.toLowerCase().includes(normalizedQuery)
    )
  }, [availableVaults, query])
  const vaultListVirtualizer = useListVirtualizer({
    count: filteredVaults.length,
    estimateSize: 58,
  })

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set())
    setQuery("")
  }, [open])

  function toggleVault(vaultId: string) {
    if (selectedVaultById.has(vaultId)) return

    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(vaultId)) {
        next.delete(vaultId)
      } else {
        next.add(vaultId)
      }
      return next
    })
  }

  function confirm() {
    onConfirm(
      availableVaults
        .filter((vault) => selectedIds.has(vault.id))
        .map((vault) => ({ vaultId: vault.id, name: vault.name }))
    )
    setSelectedIds(new Set())
    setQuery("")
    onOpenChange(false)
  }

  function clearSelectedVaults() {
    setSelectedIds(new Set())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md border bg-muted">
              <Vault className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle>Add vaults</DialogTitle>
              <DialogDescription>Only vaults you can read are shown.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 px-6 py-5">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search vaults"
              className="pl-9"
              placeholder="Search vaults"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div
            ref={vaultListVirtualizer.scrollRef}
            className="h-80 overflow-auto rounded-md border"
          >
            <SelectionState
              isLoading={isLoading}
              error={error}
              isEmpty={filteredVaults.length === 0}
              emptyLabel="No vaults found."
              loadingLabel="Loading vaults..."
            >
              <div
                className="relative w-full"
                style={{ height: `${vaultListVirtualizer.totalSize}px` }}
              >
                {vaultListVirtualizer.virtualItems.map((virtualItem) => {
                  const vault = filteredVaults[virtualItem.index]
                  if (!vault) return null
                  const checked = selectedIds.has(vault.id)
                  const alreadySelected = selectedVaultById.has(vault.id)

                  return (
                    <div
                      key={vault.id}
                      className="absolute left-0 top-0 w-full p-1"
                      style={{
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={alreadySelected ? -1 : 0}
                        aria-disabled={alreadySelected}
                        className={cn(
                          "flex h-full w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent",
                          alreadySelected && "cursor-not-allowed opacity-50 hover:bg-transparent",
                          checked && "bg-accent"
                        )}
                        onClick={() => toggleVault(vault.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            toggleVault(vault.id)
                          }
                        }}
                      >
                        <Checkbox
                          checked={checked || alreadySelected}
                          disabled={alreadySelected}
                          aria-label={`Select ${vault.name}`}
                          onCheckedChange={() => toggleVault(vault.id)}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <div className="min-w-0 w-0 flex-1 overflow-hidden">
                          <div className="truncate text-sm font-medium">{vault.name}</div>
                          <div className="text-muted-foreground truncate text-xs">
                            {alreadySelected
                              ? "Already in conversation context"
                              : vault.description?.trim() || "No description added."}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SelectionState>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              {selectedIds.size === 1
                ? "1 vault selected"
                : `${selectedIds.size} vaults selected`}
            </span>
            {selectedIds.size > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={clearSelectedVaults}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DocumentSelectionDialog({
  open,
  context,
  vaults,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  context: DraftChatContext
  vaults: VaultSummary[]
  onOpenChange: (open: boolean) => void
  onConfirm: (documents: DraftChatDocument[]) => void
}) {
  const [query, setQuery] = useState("")
  const [selectedFilterVaultIds, setSelectedFilterVaultIds] = useState<string[]>([])
  const [selectedDocuments, setSelectedDocuments] = useState<Map<string, DraftChatDocument>>(
    () => new Map()
  )
  const [documents, setDocuments] = useState<SearchResultItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectableVaults = useMemo(
    () => vaults.filter(canReadVault),
    [vaults]
  )
  const selectedVaultById = useMemo(
    () => new Map(normalizeDraftContext(context).vaults.map((vault) => [vault.vaultId, vault])),
    [context]
  )
  const selectedDocumentKeys = useMemo(
    () => new Set(normalizeDraftContext(context).documents.map((document) => documentKey(document))),
    [context]
  )
  const effectiveVaultIds = useMemo(
    () =>
      selectedFilterVaultIds.length === 0
        ? selectableVaults.map((vault) => vault.id)
        : selectedFilterVaultIds,
    [selectableVaults, selectedFilterVaultIds]
  )
  const documentListVirtualizer = useListVirtualizer({
    count: documents.length,
    estimateSize: 58,
  })

  useEffect(() => {
    if (!open) return
    setSelectedDocuments(new Map())
    setQuery("")
    setSelectedFilterVaultIds([])
  }, [open])

  useEffect(() => {
    if (!open || effectiveVaultIds.length === 0) {
      setDocuments([])
      return
    }

    let cancelled = false

    async function loadDocuments() {
      setIsLoading(true)
      setError(null)

      try {
        const result = await searchAllDocuments({
          query,
          pageIndex: 0,
          pageSize: 100,
          vaultIds: effectiveVaultIds,
          sortBy: "name_asc",
        })
        if (!cancelled) {
          setDocuments(result.results)
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Failed to load documents.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    const timeoutId = window.setTimeout(() => void loadDocuments(), 200)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [effectiveVaultIds, open, query])

  function toggleFilterVault(vaultId: string) {
    setSelectedFilterVaultIds((current) =>
      current.includes(vaultId)
        ? current.filter((id) => id !== vaultId)
        : [...current, vaultId]
    )
  }

  function toggleDocument(document: SearchResultItem) {
    const key = documentKey(document)
    if (selectedVaultById.has(document.vaultId) || selectedDocumentKeys.has(key)) return

    setSelectedDocuments((current) => {
      const next = new Map(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, draftDocumentFromSearchResult(document))
      }
      return next
    })
  }

  function confirm() {
    onConfirm([...selectedDocuments.values()])
    setSelectedDocuments(new Map())
    setQuery("")
    setSelectedFilterVaultIds([])
    onOpenChange(false)
  }

  function clearSelectedDocuments() {
    setSelectedDocuments(new Map())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="border-b px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <DialogTitle>Add documents</DialogTitle>
              <DialogDescription>
                Only documents from vaults you can read are shown.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                aria-label="Search documents"
                className="pl-9"
                placeholder="Search documents"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <VaultFilterMenu
              vaults={selectableVaults}
              selectedVaultIds={selectedFilterVaultIds}
              onToggleVault={toggleFilterVault}
              onClear={() => setSelectedFilterVaultIds([])}
            />
          </div>

          <div
            ref={documentListVirtualizer.scrollRef}
            className="h-96 overflow-auto rounded-md border"
          >
            <SelectionState
              isLoading={isLoading}
              error={error}
              isEmpty={documents.length === 0}
              emptyLabel={
                effectiveVaultIds.length === 0
                  ? "No AI-enabled vaults are available."
                  : "No documents found."
              }
              loadingLabel="Loading documents..."
            >
              <div
                className="relative w-full"
                style={{ height: `${documentListVirtualizer.totalSize}px` }}
              >
                {documentListVirtualizer.virtualItems.map((virtualItem) => {
                  const document = documents[virtualItem.index]
                  if (!document) return null
                  const key = documentKey(document)
                  const checked = selectedDocuments.has(key)
                  const selectedVault = selectedVaultById.get(document.vaultId)
                  const alreadySelected = selectedDocumentKeys.has(key)
                  const disabled = Boolean(selectedVault) || alreadySelected

                  return (
                    <div
                      key={key}
                      className="absolute left-0 top-0 w-full p-1"
                      style={{
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        aria-disabled={disabled}
                        className={cn(
                          "flex h-full w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent",
                          disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                          checked && "bg-accent"
                        )}
                        onClick={() => toggleDocument(document)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            toggleDocument(document)
                          }
                        }}
                      >
                        <Checkbox
                          checked={checked || disabled}
                          disabled={disabled}
                          aria-label={`Select ${document.name}`}
                          onCheckedChange={() => toggleDocument(document)}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <div className="min-w-0 w-0 flex-1 overflow-hidden">
                          <div className="truncate text-sm font-medium">{document.name}</div>
                          <div className="text-muted-foreground truncate text-xs">
                            {selectedVault
                              ? `Already included via ${selectedVault.name ?? document.vaultName}`
                              : alreadySelected
                                ? "Already in conversation context"
                              : document.vaultName}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SelectionState>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              {selectedDocuments.size === 1
                ? "1 document selected"
                : `${selectedDocuments.size} documents selected`}
            </span>
            {selectedDocuments.size > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={clearSelectedDocuments}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VaultFilterMenu({
  vaults,
  selectedVaultIds,
  onToggleVault,
  onClear,
}: {
  vaults: VaultSummary[]
  selectedVaultIds: string[]
  onToggleVault: (vaultId: string) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState("")
  const selectedVaults = vaults.filter((vault) => selectedVaultIds.includes(vault.id))
  const selectedSet = useMemo(() => new Set(selectedVaultIds), [selectedVaultIds])
  const filteredVaults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return vaults
    return vaults.filter((vault) => vault.name.toLowerCase().includes(normalizedQuery))
  }, [query, vaults])
  const label =
    selectedVaults.length === 0
      ? "All vaults"
      : selectedVaults.length <= 2
        ? selectedVaults.map((vault) => vault.name).join(", ")
        : `${selectedVaults[0].name}, ${selectedVaults[1].name} +${selectedVaults.length - 2}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="min-w-0 justify-between">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="text-muted-foreground size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-3">
          <div className="text-sm font-medium">Vaults</div>
          <Input
            value={query}
            className="mt-2"
            placeholder="Search vaults"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-auto p-2">
          {filteredVaults.length === 0 ? (
            <div className="text-muted-foreground px-2 py-6 text-center text-sm">
              No results found.
            </div>
          ) : (
            filteredVaults.map((vault) => {
              const checked = selectedSet.has(vault.id)

              return (
                <label
                  key={vault.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleVault(vault.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{vault.name}</span>
                </label>
              )
            })
          )}
        </div>
        {selectedVaultIds.length > 0 ? (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onClear}>
              Clear vaults
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function SelectionState({
  isLoading,
  error,
  isEmpty,
  emptyLabel,
  loadingLabel,
  children,
}: {
  isLoading?: boolean
  error?: string | null
  isEmpty: boolean
  emptyLabel: string
  loadingLabel: string
  children: ReactNode
}) {
  if (isLoading) {
    return (
      <div className="text-muted-foreground flex h-full min-h-64 items-center justify-center px-6 text-sm">
        {loadingLabel}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-destructive flex h-full min-h-64 items-center justify-center px-6 text-center text-sm">
        {error}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="text-muted-foreground flex h-full min-h-64 items-center justify-center px-6 text-sm">
        {emptyLabel}
      </div>
    )
  }

  return <>{children}</>
}

function useListVirtualizer({
  count,
  estimateSize,
}: {
  count: number
  estimateSize: number
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
    initialRect: {
      height: estimateSize * 6,
      width: 576,
    },
  })
  const virtualItems = virtualizer.getVirtualItems()

  return {
    scrollRef,
    totalSize: virtualizer.getTotalSize(),
    virtualItems:
      virtualItems.length > 0
        ? virtualItems
        : getFallbackVirtualItems({ count, estimateSize }),
  }
}

function getFallbackVirtualItems({
  count,
  estimateSize,
}: {
  count: number
  estimateSize: number
}): VirtualItem[] {
  return Array.from(
    { length: Math.min(count, 12) },
    (_, index): VirtualItem => ({
      end: (index + 1) * estimateSize,
      index,
      key: index,
      lane: 0,
      size: estimateSize,
      start: index * estimateSize,
    })
  )
}
