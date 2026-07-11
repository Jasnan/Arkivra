"use client"

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { FileTextIcon, FolderIcon, PaperclipIcon, SearchIcon, VaultIcon } from "lucide-react"
import { useAui, useAuiState } from "@assistant-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"

import {
  createEmptyDraftContext,
  documentContextAttachmentId,
  documentKey,
  draftContextFromAttachments,
  draftContextFromSnapshot,
  folderContextAttachmentId,
  folderKey,
  getDraftContextSummary,
  normalizeDraftContext,
  UNAVAILABLE_CONTEXT_CONTENT_TYPE,
  vaultContextAttachmentId,
  type ComposerContextAttachment,
  type DraftChatContext,
  type DraftChatDocument,
  type DraftChatFolder,
  type DraftChatVault,
} from "@/app/chat/lib/chat-context-model"
import { TooltipIconButton } from "@/app/chat/components/assistant-ui/tooltip-icon-button"
import { useLiveThreadContextSnapshot } from "@/app/chat/components/runtime/chat-live-thread-context"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { fetchJson } from "@/lib/api"
import { cn } from "@/lib/utils"

type ContextOptionFolder = { id: string; parentId: string | null; name: string; path: string }
type ContextOptionDocument = { id: string; folderId: string | null; name: string; mimeType: string; path: string }
type ContextOptionVault = { id: string; name: string; description: string | null; folders: ContextOptionFolder[]; documents: ContextOptionDocument[] }
type ContextOptionsResponse = { vaults: ContextOptionVault[] }
type PickerVirtualRow =
  | { kind: "unavailable-header"; key: string }
  | { kind: "unavailable"; key: string; ref: DraftChatVault | DraftChatFolder | DraftChatDocument }
  | { kind: "vault"; key: string; vault: ContextOptionVault }
  | { kind: "folder"; key: string; vault: ContextOptionVault; folder: ContextOptionFolder }
  | { kind: "document"; key: string; vault: ContextOptionVault; document: ContextOptionDocument }

function isDocumentRef(ref: DraftChatVault | DraftChatFolder | DraftChatDocument): ref is DraftChatDocument {
  return "documentId" in ref
}

function isFolderRef(ref: DraftChatVault | DraftChatFolder | DraftChatDocument): ref is DraftChatFolder {
  return !isDocumentRef(ref) && "folderId" in ref
}

function ancestorsFor(folderId: string | null, folders: Map<string, ContextOptionFolder>) {
  const result: string[] = []
  const seen = new Set<string>()
  let current = folderId ? folders.get(folderId) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    result.unshift(current.id)
    current = current.parentId ? folders.get(current.parentId) : undefined
  }
  return result
}

function hydrateContext(context: DraftChatContext, options: ContextOptionVault[]): DraftChatContext {
  const vaultsById = new Map(options.map((vault) => [vault.id, vault]))
  return normalizeDraftContext({
    vaults: context.vaults.map((ref) => {
      const vault = vaultsById.get(ref.vaultId)
      return vault
        ? { vaultId: vault.id, name: vault.name, availability: "available" }
        : { ...ref, availability: "unavailable" }
    }),
    folders: context.folders.map((ref) => {
      const vault = vaultsById.get(ref.vaultId)
      const folder = vault?.folders.find((item) => item.id === ref.folderId)
      if (!vault || !folder) return { ...ref, availability: "unavailable" }
      const folders = new Map(vault.folders.map((item) => [item.id, item]))
      return {
        vaultId: vault.id,
        folderId: folder.id,
        parentId: folder.parentId,
        ancestorIds: ancestorsFor(folder.parentId, folders),
        name: folder.name,
        vaultName: vault.name,
        path: folder.path,
        availability: "available",
      }
    }),
    documents: context.documents.map((ref) => {
      const vault = vaultsById.get(ref.vaultId)
      const document = vault?.documents.find((item) => item.id === ref.documentId)
      if (!vault || !document) return { ...ref, availability: "unavailable" }
      const folders = new Map(vault.folders.map((item) => [item.id, item]))
      return {
        vaultId: vault.id,
        documentId: document.id,
        folderId: document.folderId,
        ancestorFolderIds: ancestorsFor(document.folderId, folders),
        name: document.name,
        vaultName: vault.name,
        path: document.path,
        mimeType: document.mimeType,
        availability: "available",
      }
    }),
  })
}

function contextRenderKey(context: DraftChatContext) {
  const value = normalizeDraftContext(context)
  return [...value.vaults, ...value.folders, ...value.documents]
    .map((ref) => `${"vaultId" in ref ? ref.vaultId : ""}:${"folderId" in ref ? ref.folderId : ""}:${"documentId" in ref ? ref.documentId : ""}:${ref.name ?? ""}:${ref.availability ?? ""}`)
    .join("|")
}

async function replaceAttachments(aui: ReturnType<typeof useAui>, context: DraftChatContext) {
  const value = normalizeDraftContext(context)
  await aui.composer().clearAttachments()
  for (const vault of value.vaults) {
    const unavailable = vault.availability === "unavailable"
    await aui.composer().addAttachment({
      id: vaultContextAttachmentId(vault.vaultId), type: "document",
      name: unavailable ? `Deleted vault: ${vault.name ?? "Vault"}` : vault.name ?? "Vault",
      contentType: unavailable ? UNAVAILABLE_CONTEXT_CONTENT_TYPE : "application/vnd.arkivra.vault-context",
      content: [{ type: "text", text: `Arkivra vault context\nvaultId: ${vault.vaultId}\nname: ${vault.name ?? ""}` }],
    })
  }
  for (const folder of value.folders) {
    const unavailable = folder.availability === "unavailable"
    await aui.composer().addAttachment({
      id: folderContextAttachmentId(folder), type: "document",
      name: unavailable ? `Deleted folder: ${folder.name ?? "Folder"}` : folder.name ?? "Folder",
      contentType: unavailable ? UNAVAILABLE_CONTEXT_CONTENT_TYPE : "application/vnd.arkivra.folder-context",
      content: [{ type: "text", text: `Arkivra folder context\nvaultId: ${folder.vaultId}\nfolderId: ${folder.folderId}\nname: ${folder.name ?? ""}` }],
    })
  }
  for (const document of value.documents) {
    const unavailable = document.availability === "unavailable"
    await aui.composer().addAttachment({
      id: documentContextAttachmentId(document), type: "document",
      name: unavailable ? `Deleted file: ${document.name ?? "File"}` : document.name ?? "File",
      contentType: unavailable ? UNAVAILABLE_CONTEXT_CONTENT_TYPE : document.mimeType ?? "application/vnd.arkivra.document-context",
      content: [{ type: "text", text: `Arkivra document context\nvaultId: ${document.vaultId}\ndocumentId: ${document.documentId}\nname: ${document.name ?? ""}` }],
    })
  }
}

export function ChatContextPicker() {
  const aui = useAui()
  const threadId = useAuiState((state) => state.threadListItem.id)
  const remoteId = useAuiState((state) => state.threadListItem.remoteId)
  const isRunning = useAuiState((state) => state.thread.isRunning)
  const attachments = useAuiState((state) => state.composer.attachments as readonly ComposerContextAttachment[])
  const storedSnapshot = useAuiState((state) => state.threadListItem.custom?.contextSnapshot)
  const liveSnapshot = useLiveThreadContextSnapshot({ threadId, remoteId })
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ContextOptionVault[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const applyingRef = useRef(false)
  const userEditedRef = useRef(false)
  const threadKeyRef = useRef("")
  const lastRenderKeyRef = useRef("")
  const currentThreadKey = `${threadId}:${remoteId ?? ""}`
  const threadChanged = threadKeyRef.current !== currentThreadKey
  if (threadChanged) {
    threadKeyRef.current = currentThreadKey
    userEditedRef.current = false
    lastRenderKeyRef.current = ""
  }
  const composerContext = useMemo(() => draftContextFromAttachments(attachments), [attachments])
  const threadContext = useMemo(() => draftContextFromSnapshot(liveSnapshot ?? storedSnapshot), [liveSnapshot, storedSnapshot])
  const activeContext = threadChanged
    ? threadContext
    : hasAny(composerContext) || userEditedRef.current
      ? composerContext
      : threadContext
  const hydratedContext = useMemo(
    () => loading || error ? activeContext : hydrateContext(activeContext, options),
    [activeContext, error, loading, options],
  )
  const summary = getDraftContextSummary(hydratedContext)

  useEffect(() => {
    let ignore = false
    setLoading(true)
    fetchJson<ContextOptionsResponse>("/api/chats/context-options")
      .then((response) => { if (!ignore) { setOptions(response.vaults); setError(null) } })
      .catch((cause) => { if (!ignore) setError(cause instanceof Error ? cause.message : "Unable to load attachments.") })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [])

  useEffect(() => {
    if (isRunning || applyingRef.current || loading) return
    const key = contextRenderKey(hydratedContext)
    if (!key || key === lastRenderKeyRef.current) return
    lastRenderKeyRef.current = key
    applyingRef.current = true
    void replaceAttachments(aui, hydratedContext).finally(() => { applyingRef.current = false })
  }, [aui, hydratedContext, isRunning, loading])

  useEffect(() => {
    if (applyingRef.current || isRunning) return
    if (attachments.length === 0 && lastRenderKeyRef.current) userEditedRef.current = true
  }, [attachments.length, isRunning])

  const apply = async (context: DraftChatContext) => {
    userEditedRef.current = true
    const hydrated = hydrateContext(context, options)
    lastRenderKeyRef.current = contextRenderKey(hydrated)
    applyingRef.current = true
    try { await replaceAttachments(aui, hydrated) } finally { applyingRef.current = false }
  }

  return <>
    <TooltipIconButton
      tooltip={summary.hasContext ? summary.label : "Select chat context"}
      side="bottom" variant="ghost" size="icon" aria-label="Select chat context"
      className="aui-composer-add-attachment hover:bg-muted-foreground/15 size-7 rounded-full p-1"
      onClick={() => setOpen(true)}
    >
      <PaperclipIcon className="size-4.5 stroke-[1.5px]" />
    </TooltipIconButton>
    <UnifiedContextDialog open={open} context={hydratedContext} options={options} loading={loading} error={error} onOpenChange={setOpen} onConfirm={apply} />
  </>
}

function hasAny(context: DraftChatContext) { return context.vaults.length + context.folders.length + context.documents.length > 0 }

function UnifiedContextDialog({ open, context, options, loading, error, onOpenChange, onConfirm }: {
  open: boolean; context: DraftChatContext; options: ContextOptionVault[]; loading: boolean; error: string | null
  onOpenChange: (open: boolean) => void; onConfirm: (context: DraftChatContext) => Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<DraftChatContext>(createEmptyDraftContext())
  useEffect(() => { if (open) { setSelected(context); setQuery("") } }, [context, open])
  const normalized = useMemo(() => normalizeDraftContext(selected), [selected])
  const deferredQuery = useDeferredValue(query)
  const needle = deferredQuery.trim().toLocaleLowerCase()
  const unavailable = useMemo(
    () => [...normalized.vaults, ...normalized.folders, ...normalized.documents]
      .filter((ref) => ref.availability === "unavailable"),
    [normalized],
  )
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const rows = useMemo(() => {
    const next: PickerVirtualRow[] = []
    if (unavailable.length > 0) {
      next.push({ kind: "unavailable-header", key: "unavailable-header" })
      for (const ref of unavailable) {
        const key = isDocumentRef(ref) ? documentKey(ref) : isFolderRef(ref) ? folderKey(ref) : ref.vaultId
        next.push({ kind: "unavailable", key: `unavailable:${key}`, ref })
      }
    }
    for (const vault of options) {
      const vaultMatches = !needle || `${vault.name} ${vault.description ?? ""}`.toLocaleLowerCase().includes(needle)
      const visibleFolders = vault.folders.filter((folder) => !needle || `${folder.name} ${folder.path}`.toLocaleLowerCase().includes(needle))
      const visibleDocuments = vault.documents.filter((document) => !needle || `${document.name} ${document.path}`.toLocaleLowerCase().includes(needle))
      if (!vaultMatches && visibleFolders.length === 0 && visibleDocuments.length === 0) continue
      next.push({ kind: "vault", key: `vault:${vault.id}`, vault })
      if (normalized.vaults.some((ref) => ref.vaultId === vault.id)) continue
      for (const folder of visibleFolders) next.push({ kind: "folder", key: `folder:${vault.id}:${folder.id}`, vault, folder })
      for (const document of visibleDocuments) next.push({ kind: "document", key: `document:${vault.id}:${document.id}`, vault, document })
    }
    return next
  }, [needle, normalized.vaults, options, unavailable])
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    initialRect: { width: 0, height: 448 },
    estimateSize: (index) => rows[index]?.kind === "unavailable-header" ? 34 : 58,
    getItemKey: (index) => rows[index]?.key ?? index,
    overscan: 12,
  })
  useLayoutEffect(() => {
    if (!open || loading || rows.length === 0 || !scrollElement) return
    rowVirtualizer.measure()
  }, [loading, open, rowVirtualizer, rows.length, scrollElement])
  useEffect(() => { scrollElement?.scrollTo({ top: 0 }) }, [needle, scrollElement])

  const toggleVault = (vault: ContextOptionVault) => setSelected((current) => {
    const exists = current.vaults.some((ref) => ref.vaultId === vault.id)
    return normalizeDraftContext({ ...current, vaults: exists ? current.vaults.filter((ref) => ref.vaultId !== vault.id) : [...current.vaults, { vaultId: vault.id, name: vault.name, availability: "available" }] })
  })
  const toggleFolder = (vault: ContextOptionVault, folder: ContextOptionFolder) => setSelected((current) => {
    const folders = new Map(vault.folders.map((item) => [item.id, item]))
    const exists = current.folders.some((ref) => folderKey(ref) === `${vault.id}:${folder.id}`)
    const ref: DraftChatFolder = { vaultId: vault.id, folderId: folder.id, parentId: folder.parentId, ancestorIds: ancestorsFor(folder.parentId, folders), name: folder.name, vaultName: vault.name, path: folder.path, availability: "available" }
    return normalizeDraftContext({ ...current, folders: exists ? current.folders.filter((item) => folderKey(item) !== folderKey(ref)) : [...current.folders, ref] })
  })
  const toggleDocument = (vault: ContextOptionVault, document: ContextOptionDocument) => setSelected((current) => {
    const folders = new Map(vault.folders.map((item) => [item.id, item]))
    const exists = current.documents.some((ref) => documentKey(ref) === `${vault.id}:${document.id}`)
    const ref: DraftChatDocument = { vaultId: vault.id, documentId: document.id, folderId: document.folderId, ancestorFolderIds: ancestorsFor(document.folderId, folders), name: document.name, vaultName: vault.name, path: document.path, mimeType: document.mimeType, availability: "available" }
    return normalizeDraftContext({ ...current, documents: exists ? current.documents.filter((item) => documentKey(item) !== documentKey(ref)) : [...current.documents, ref] })
  })
  const removeUnavailable = (target: DraftChatVault | DraftChatFolder | DraftChatDocument) => setSelected((current) => normalizeDraftContext({
    vaults: !isFolderRef(target) && !isDocumentRef(target) ? current.vaults.filter((ref) => ref.vaultId !== target.vaultId) : current.vaults,
    folders: isFolderRef(target) ? current.folders.filter((ref) => folderKey(ref) !== folderKey(target)) : current.folders,
    documents: isDocumentRef(target) ? current.documents.filter((ref) => documentKey(ref) !== documentKey(target)) : current.documents,
  }))

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="p-0 sm:max-w-3xl">
      <DialogHeader className="px-6 pt-6">
        <DialogTitle>Attach context</DialogTitle>
        <DialogDescription>Select vaults, folders, or files. Broader selections automatically replace covered items.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 px-6">
        <div className="relative"><SearchIcon className="text-muted-foreground absolute left-3 top-2.5 size-4" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search vaults, folders, and files" className="pl-9" /></div>
        <div ref={setScrollElement} className="h-[28rem] overflow-auto rounded-md border">
          {loading ? <Empty>Loading attachments…</Empty> : error ? <Empty>{error}</Empty> : options.length === 0 ? <Empty>No readable vaults with chat access.</Empty> : rows.length === 0 ? <Empty>No matching attachments.</Empty> : <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              return <div key={row.key} className="absolute left-0 top-0 w-full px-2" style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}>
                {row.kind === "unavailable-header" ? <p className="px-2 pt-2 text-xs font-medium text-destructive">Unavailable attachments — remove them to continue</p> : row.kind === "unavailable" ? <PickerRow checked icon={iconFor(row.ref)} title={row.ref.name ?? "Deleted attachment"} description="Deleted" destructive onClick={() => removeUnavailable(row.ref)} /> : row.kind === "vault" ? <PickerRow checked={normalized.vaults.some((ref) => ref.vaultId === row.vault.id)} icon={<VaultIcon className="size-4" />} title={row.vault.name} description={`${row.vault.documents.length} available ${row.vault.documents.length === 1 ? "file" : "files"}`} disabled={row.vault.documents.length === 0} onClick={() => toggleVault(row.vault)} /> : row.kind === "folder" ? (() => {
                  const checked = normalized.folders.some((ref) => folderKey(ref) === `${row.vault.id}:${row.folder.id}`)
                  const eligibleCount = row.vault.documents.filter((document) => document.folderId === row.folder.id || document.path.startsWith(`${row.folder.path}/`)).length
                  return <PickerRow checked={checked} icon={<FolderIcon className="size-4" />} title={row.folder.name} description={row.folder.path} indent={Math.min(row.folder.path.split("/").length, 5)} disabled={eligibleCount === 0} onClick={() => toggleFolder(row.vault, row.folder)} />
                })() : (() => {
                  const covered = normalized.folders.some((folder) => folder.vaultId === row.vault.id && (folder.folderId === row.document.folderId || row.document.path.startsWith(`${folder.path}/`)))
                  const checked = covered || normalized.documents.some((ref) => documentKey(ref) === `${row.vault.id}:${row.document.id}`)
                  return <PickerRow checked={checked} icon={<FileTextIcon className="size-4" />} title={row.document.name} description={covered ? "Covered by selected folder" : row.document.path} indent={Math.min(row.document.path.split("/").length, 6)} disabled={covered} onClick={() => toggleDocument(row.vault, row.document)} />
                })()}
              </div>
            })}
          </div>}
        </div>
      </div>
      <DialogFooter className="border-t px-6 py-4 sm:justify-between">
        <span className="text-muted-foreground text-sm">{getDraftContextSummary(normalized).label}</span>
        <div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={async () => { await onConfirm(normalized); onOpenChange(false) }}>Apply</Button></div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function iconFor(ref: DraftChatVault | DraftChatFolder | DraftChatDocument) {
  if (isDocumentRef(ref)) return <FileTextIcon className="size-4" />
  if (isFolderRef(ref)) return <FolderIcon className="size-4" />
  return <VaultIcon className="size-4" />
}

function PickerRow({ checked, icon, title, description, indent = 0, disabled = false, destructive = false, onClick }: { checked: boolean; icon: React.ReactNode; title: string; description: string; indent?: number; disabled?: boolean; destructive?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ paddingInlineStart: `${0.5 + indent * 0.75}rem` }} className={cn("hover:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45", destructive && "text-destructive")}>
    <Checkbox checked={checked} tabIndex={-1} className="border-foreground/45 dark:border-foreground/65" /><span className="shrink-0">{icon}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{title}</span><span className="text-muted-foreground block truncate text-xs">{description}</span></span>
  </button>
}
function Empty({ children }: { children: React.ReactNode }) { return <div className="text-muted-foreground flex h-40 items-center justify-center p-6 text-center text-sm">{children}</div> }
