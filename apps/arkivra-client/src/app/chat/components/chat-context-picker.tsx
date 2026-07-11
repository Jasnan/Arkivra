"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { FileTextIcon, PaperclipIcon, SearchIcon, VaultIcon } from "lucide-react"
import { useAui, useAuiState } from "@assistant-ui/react"

import { searchAllDocuments, type SearchResultItem } from "@/app/search/search.api"
import { listVaults, type VaultSummary } from "@/app/vaults/vaults.api"
import {
  addDocumentsToDraftContext,
  addVaultsToDraftContext,
  createEmptyDraftContext,
  documentContextAttachmentId,
  documentKey,
  draftContextFromAttachments,
  draftContextFromSnapshot,
  draftContextKey,
  getDraftContextSummary,
  hydrateDraftContextLabels,
  normalizeDraftContext,
  searchResultToDraftDocument,
  vaultContextAttachmentId,
  type DraftChatContext,
  type DraftChatDocument,
  type DraftChatVault,
} from "@/app/chat/lib/chat-context-model"
import { TooltipIconButton } from "@/app/chat/components/assistant-ui/tooltip-icon-button"
import { useLiveThreadContextSnapshot } from "@/app/chat/components/runtime/chat-live-thread-context"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type ComposerAttachment = {
  id?: string
  name?: string
  contentType?: string
}

async function addVaultAttachment(aui: ReturnType<typeof useAui>, vault: DraftChatVault) {
  await aui.composer().addAttachment({
    id: vaultContextAttachmentId(vault.vaultId),
    type: "document",
    name: vault.name ?? "Vault",
    contentType: "application/vnd.arkivra.vault-context",
    content: [
      {
        type: "text",
        text: `Arkivra vault context\nvaultId: ${vault.vaultId}\nname: ${vault.name ?? ""}`,
      },
    ],
  })
}

export async function addDocumentContextAttachment(
  aui: ReturnType<typeof useAui>,
  document: DraftChatDocument,
) {
  await aui.composer().addAttachment({
    id: documentContextAttachmentId(document),
    type: "document",
    name: document.name ?? "Document",
    contentType: document.mimeType ?? "application/vnd.arkivra.document-context",
    content: [
      {
        type: "text",
        text: [
          "Arkivra document context",
          `vaultId: ${document.vaultId}`,
          `documentId: ${document.documentId}`,
          `name: ${document.name ?? ""}`,
          `vaultName: ${document.vaultName ?? ""}`,
        ].join("\n"),
      },
    ],
  })
}

async function addContextAttachments(aui: ReturnType<typeof useAui>, current: DraftChatContext, next: DraftChatContext) {
  const normalizedNext = normalizeDraftContext(next)
  const currentKey = draftContextKey(current)
  const nextKey = draftContextKey(normalizedNext)

  if (currentKey === nextKey) return

  await aui.composer().clearAttachments()

  for (const vault of normalizedNext.vaults) {
    await addVaultAttachment(aui, vault)
  }

  for (const document of normalizedNext.documents) {
    await addDocumentContextAttachment(aui, document)
  }
}

export function ChatContextPicker() {
  const aui = useAui()
  const hydratedThreadContextKeyRef = useRef<string | null>(null)
  const isComposerContextAuthoritativeRef = useRef(false)
  const isApplyingContextAttachmentsRef = useRef(false)
  const previousComposerContextKeyRef = useRef("")
  const previousThreadKeyRef = useRef("")
  const wasThreadRunningRef = useRef(false)
  const threadId = useAuiState((state) => state.threadListItem.id)
  const threadRemoteId = useAuiState((state) => state.threadListItem.remoteId)
  const isThreadRunning = useAuiState((state) => state.thread.isRunning)
  const attachments = useAuiState((state) => state.composer.attachments as readonly ComposerAttachment[])
  const threadContextSnapshot = useAuiState((state) => state.threadListItem.custom?.contextSnapshot)
  const liveThreadContextSnapshot = useLiveThreadContextSnapshot({
    threadId,
    remoteId: threadRemoteId,
  })
  const [vaults, setVaults] = useState<VaultSummary[]>([])
  const [vaultsError, setVaultsError] = useState<string | null>(null)
  const [isLoadingVaults, setIsLoadingVaults] = useState(false)
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false)
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false)
  const [isComposerContextAuthoritative, setIsComposerContextAuthoritative] = useState(false)
  const composerContext = useMemo(() => draftContextFromAttachments(attachments), [attachments])
  const threadContext = useMemo(
    () => draftContextFromSnapshot(liveThreadContextSnapshot ?? threadContextSnapshot),
    [liveThreadContextSnapshot, threadContextSnapshot],
  )
  const composerContextKey = useMemo(() => draftContextKey(composerContext), [composerContext])
  const threadContextKey = useMemo(() => draftContextKey(threadContext), [threadContext])
  const threadKey = `${threadId}:${threadRemoteId ?? ""}`
  const activeContext = useMemo(() => {
    const normalizedComposerContext = normalizeDraftContext(composerContext)
    if (isComposerContextAuthoritative) return normalizedComposerContext

    return normalizedComposerContext.vaults.length > 0 || normalizedComposerContext.documents.length > 0
      ? normalizedComposerContext
      : threadContext
  }, [composerContext, isComposerContextAuthoritative, threadContext])
  const attachedContext = useMemo(() => hydrateDraftContextLabels({ context: activeContext, vaults }), [activeContext, vaults])
  const summary = getDraftContextSummary(attachedContext)

  useEffect(() => {
    let ignore = false
    setIsLoadingVaults(true)
    listVaults()
      .then((result) => {
        if (ignore) return
        setVaults(result.vaults)
        setVaultsError(null)
      })
      .catch((error) => {
        if (ignore) return
        setVaultsError(error instanceof Error ? error.message : "Unable to load vaults.")
      })
      .finally(() => {
        if (!ignore) setIsLoadingVaults(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (previousThreadKeyRef.current === threadKey) return

    previousThreadKeyRef.current = threadKey
    hydratedThreadContextKeyRef.current = null
    previousComposerContextKeyRef.current = composerContextKey
    isComposerContextAuthoritativeRef.current = false
    setIsComposerContextAuthoritative(false)
  }, [composerContextKey, threadKey])

  useEffect(() => {
    if (isThreadRunning) {
      wasThreadRunningRef.current = true
      isComposerContextAuthoritativeRef.current = false
      setIsComposerContextAuthoritative(false)
      return
    }

    if (!wasThreadRunningRef.current) return
    wasThreadRunningRef.current = false
    hydratedThreadContextKeyRef.current = null
  }, [isThreadRunning])

  useEffect(() => {
    const previousComposerContextKey = previousComposerContextKeyRef.current
    previousComposerContextKeyRef.current = composerContextKey

    if (previousComposerContextKey === composerContextKey) return
    if (isApplyingContextAttachmentsRef.current) return
    if (isThreadRunning) return

    if (previousComposerContextKey.length > 0 && composerContextKey.length === 0) {
      isComposerContextAuthoritativeRef.current = true
      setIsComposerContextAuthoritative(true)
    }
  }, [composerContextKey, isThreadRunning])

  useEffect(() => {
    if (threadContextKey.length === 0) {
      hydratedThreadContextKeyRef.current = null
      return
    }

    if (
      isThreadRunning ||
      isComposerContextAuthoritativeRef.current ||
      isComposerContextAuthoritative ||
      composerContextKey.length > 0 ||
      hydratedThreadContextKeyRef.current === threadContextKey
    ) {
      return
    }

    hydratedThreadContextKeyRef.current = threadContextKey
    isApplyingContextAttachmentsRef.current = true
    void addContextAttachments(aui, createEmptyDraftContext(), threadContext).finally(() => {
      isApplyingContextAttachmentsRef.current = false
      previousComposerContextKeyRef.current = threadContextKey
    })
  }, [aui, composerContextKey, isComposerContextAuthoritative, isThreadRunning, threadContext, threadContextKey])

  const applyVaults = async (selectedVaults: DraftChatVault[]) => {
    const nextContext = addVaultsToDraftContext(attachedContext, selectedVaults)
    isComposerContextAuthoritativeRef.current = true
    setIsComposerContextAuthoritative(true)
    isApplyingContextAttachmentsRef.current = true
    try {
      await addContextAttachments(aui, attachedContext, nextContext)
    } finally {
      isApplyingContextAttachmentsRef.current = false
    }
  }

  const applyDocuments = async (selectedDocuments: DraftChatDocument[]) => {
    const nextContext = addDocumentsToDraftContext(attachedContext, selectedDocuments)
    isComposerContextAuthoritativeRef.current = true
    setIsComposerContextAuthoritative(true)
    isApplyingContextAttachmentsRef.current = true
    try {
      await addContextAttachments(aui, attachedContext, nextContext)
    } finally {
      isApplyingContextAttachmentsRef.current = false
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <TooltipIconButton
            tooltip={summary.hasContext ? summary.label : "Select chat context"}
            side="bottom"
            variant="ghost"
            size="icon"
            className="aui-composer-add-attachment hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full p-1 text-xs font-semibold"
            aria-label="Select chat context"
          >
            <PaperclipIcon className="aui-attachment-add-icon size-4.5 stroke-[1.5px]" />
          </TooltipIconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => setVaultDialogOpen(true)}>
            <VaultIcon className="size-4" />
            Add vaults
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDocumentDialogOpen(true)}>
            <FileTextIcon className="size-4" />
            Add files
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <VaultSelectionDialog
        open={vaultDialogOpen}
        context={attachedContext}
        vaults={vaults}
        isLoading={isLoadingVaults}
        error={vaultsError}
        onOpenChange={setVaultDialogOpen}
        onConfirm={applyVaults}
      />
      <DocumentSelectionDialog
        open={documentDialogOpen}
        context={attachedContext}
        vaults={vaults}
        isLoadingVaults={isLoadingVaults}
        vaultsError={vaultsError}
        onOpenChange={setDocumentDialogOpen}
        onConfirm={applyDocuments}
      />
    </>
  )
}

function VaultSelectionDialog({
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
  isLoading: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (vaults: DraftChatVault[]) => void | Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const filteredVaults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return vaults
    return vaults.filter(
      (vault) =>
        vault.name.toLowerCase().includes(normalizedQuery) ||
        vault.description?.toLowerCase().includes(normalizedQuery),
    )
  }, [query, vaults])

  useEffect(() => {
    if (!open) return
    setSelectedIds(new Set(context.vaults.map((vault) => vault.vaultId)))
    setQuery("")
  }, [context.vaults, open])

  const confirm = async () => {
    await onConfirm(
      vaults
        .filter((vault) => selectedIds.has(vault.id))
        .map((vault) => ({ vaultId: vault.id, name: vault.name })),
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-2xl">
        <PickerHeader icon={<VaultIcon className="size-5" />} title="Add Vaults" description="Select vaults to narrow this chat to their documents." />
        <div className="space-y-3 px-6 py-5">
          <SearchField value={query} placeholder="Search vaults" onChange={setQuery} />
          <PickerList>
            {isLoading ? (
              <PickerEmpty>Loading vaults...</PickerEmpty>
            ) : error ? (
              <PickerEmpty>{error}</PickerEmpty>
            ) : filteredVaults.length === 0 ? (
              <PickerEmpty>No vaults found.</PickerEmpty>
            ) : (
              filteredVaults.map((vault) => (
                <SelectionRow
                  key={vault.id}
                  checked={selectedIds.has(vault.id)}
                  icon={<VaultIcon className="size-4" />}
                  title={vault.name}
                  description={vault.description?.trim() || "No description added."}
                  onToggle={() =>
                    setSelectedIds((current) => {
                      const next = new Set(current)
                      if (next.has(vault.id)) next.delete(vault.id)
                      else next.add(vault.id)
                      return next
                    })
                  }
                />
              ))
            )}
          </PickerList>
        </div>
        <PickerFooter selectedLabel={`${selectedIds.size} selected`} onCancel={() => onOpenChange(false)} onConfirm={confirm} />
      </DialogContent>
    </Dialog>
  )
}

function DocumentSelectionDialog({
  open,
  context,
  vaults,
  isLoadingVaults,
  vaultsError,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  context: DraftChatContext
  vaults: VaultSummary[]
  isLoadingVaults: boolean
  vaultsError: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (documents: DraftChatDocument[]) => void | Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [filterVaultIds, setFilterVaultIds] = useState<Set<string>>(() => new Set())
  const [documents, setDocuments] = useState<SearchResultItem[]>([])
  const [selectedDocuments, setSelectedDocuments] = useState<Map<string, DraftChatDocument>>(() => new Map())
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const normalizedContext = useMemo(() => normalizeDraftContext(context), [context])
  const selectedVaultIds = useMemo(() => new Set(normalizedContext.vaults.map((vault) => vault.vaultId)), [normalizedContext.vaults])
  const selectedFilterVaultIds = useMemo(
    () => (filterVaultIds.size > 0 ? Array.from(filterVaultIds) : undefined),
    [filterVaultIds],
  )
  const effectiveVaultIdsKey = selectedFilterVaultIds?.join(",") ?? "all"

  useEffect(() => {
    if (!open) return
    setQuery("")
    setFilterVaultIds(new Set())
    setSelectedDocuments(new Map(normalizedContext.documents.map((document) => [documentKey(document), document])))
  }, [normalizedContext.documents, open])

  useEffect(() => {
    if (!open || vaults.length === 0) {
      setDocuments([])
      return
    }

    let ignore = false
    setIsLoadingDocuments(true)
    searchAllDocuments({
      query,
      pageIndex: 0,
      pageSize: 100,
      vaultIds: selectedFilterVaultIds,
      sortBy: "name_asc",
    })
      .then((result) => {
        if (ignore) return
        setDocuments(result.results)
        setDocumentsError(null)
      })
      .catch((error) => {
        if (ignore) return
        setDocumentsError(error instanceof Error ? error.message : "Unable to load documents.")
      })
      .finally(() => {
        if (!ignore) setIsLoadingDocuments(false)
      })

    return () => {
      ignore = true
    }
  }, [effectiveVaultIdsKey, open, query, selectedFilterVaultIds, vaults.length])

  const filteredVaultLabel = filterVaultIds.size === 0 ? "All vaults" : `${filterVaultIds.size} vaults`
  const confirm = async () => {
    await onConfirm(Array.from(selectedDocuments.values()))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 sm:max-w-3xl">
        <PickerHeader icon={<FileTextIcon className="size-5" />} title="Add Files" description="Select individual documents from your accessible vaults." />
        <div className="space-y-3 px-6 py-5">
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
            <SearchField value={query} placeholder="Search files" onChange={setQuery} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="justify-start">
                  <VaultIcon className="size-4" />
                  <span className="truncate">{filteredVaultLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    setFilterVaultIds(new Set())
                  }}
                >
                  All vaults
                </DropdownMenuItem>
                {vaults.map((vault) => (
                  <DropdownMenuItem
                    key={vault.id}
                    onSelect={(event) => {
                      event.preventDefault()
                      setFilterVaultIds((current) => {
                        const next = new Set(current)
                        if (next.has(vault.id)) next.delete(vault.id)
                        else next.add(vault.id)
                        return next
                      })
                    }}
                  >
                    <Checkbox checked={filterVaultIds.has(vault.id)} tabIndex={-1} />
                    <span className="truncate">{vault.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <PickerList className="h-96">
            {isLoadingVaults ? (
              <PickerEmpty>Loading vaults...</PickerEmpty>
            ) : vaultsError ? (
              <PickerEmpty>{vaultsError}</PickerEmpty>
            ) : vaults.length === 0 ? (
              <PickerEmpty>No vaults available.</PickerEmpty>
            ) : isLoadingDocuments ? (
              <PickerEmpty>Loading files...</PickerEmpty>
            ) : documentsError ? (
              <PickerEmpty>{documentsError}</PickerEmpty>
            ) : documents.length === 0 ? (
              <PickerEmpty>No files found.</PickerEmpty>
            ) : (
              documents.map((document) => {
                const key = documentKey(document)
                const disabled = selectedVaultIds.has(document.vaultId)
                const checked = selectedDocuments.has(key) || disabled
                return (
                  <SelectionRow
                    key={key}
                    checked={checked}
                    disabled={disabled}
                    icon={<FileTextIcon className="size-4" />}
                    title={document.name}
                    description={disabled ? `Already included via ${document.vaultName}` : document.vaultName}
                    onToggle={() => {
                      if (disabled) return
                      setSelectedDocuments((current) => {
                        const next = new Map(current)
                        if (next.has(key)) next.delete(key)
                        else next.set(key, searchResultToDraftDocument(document))
                        return next
                      })
                    }}
                  />
                )
              })
            )}
          </PickerList>
        </div>
        <PickerFooter selectedLabel={`${selectedDocuments.size} selected`} onCancel={() => onOpenChange(false)} onConfirm={confirm} />
      </DialogContent>
    </Dialog>
  )
}

function PickerHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <DialogHeader className="border-b px-6 py-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
      </div>
    </DialogHeader>
  )
}

function SearchField({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} placeholder={placeholder} className="pl-9" onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function PickerList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ScrollArea className={cn("h-80 rounded-lg border bg-background", className)}>
      <div className="space-y-1 p-2">{children}</div>
    </ScrollArea>
  )
}

function PickerEmpty({ children }: { children: ReactNode }) {
  return <div className="flex min-h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">{children}</div>
}

function SelectionRow({
  checked,
  disabled,
  icon,
  title,
  description,
  onToggle,
}: {
  checked: boolean
  disabled?: boolean
  icon: ReactNode
  title: string
  description?: string
  onToggle: () => void
}) {
  const handleToggle = () => {
    if (!disabled) onToggle()
  }

  const handleCheckboxClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    handleToggle()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (event.key !== "Enter" && event.key !== " ") return

    event.preventDefault()
    handleToggle()
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
        checked && "bg-primary/10",
        !disabled && "hover:bg-muted",
        disabled && "cursor-not-allowed opacity-60",
      )}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        tabIndex={-1}
        onClick={handleCheckboxClick}
      />
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {description ? <div className="truncate text-xs text-muted-foreground">{description}</div> : null}
      </div>
    </div>
  )
}

function PickerFooter({
  selectedLabel,
  onCancel,
  onConfirm,
}: {
  selectedLabel: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  return (
    <DialogFooter className="items-center justify-between border-t px-6 py-4 sm:flex-row">
      <div className="text-sm text-muted-foreground">{selectedLabel}</div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm}>
          Add
        </Button>
      </div>
    </DialogFooter>
  )
}
