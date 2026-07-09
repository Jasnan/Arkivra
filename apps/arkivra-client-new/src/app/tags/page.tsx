"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react"
import { Link } from "react-router-dom"
import { Files, MoreHorizontal, Pencil, Plus, Search, Tags, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { formatShortDate as formatPreferredShortDate } from "@/lib/date-format"
import { cn } from "@/lib/utils"
import {
  DEFAULT_TAG_COLOR,
  TagFormDialog,
  type TagFormDialogMode,
} from "./components/tag-form-dialog"
import { createTag, deleteTag, listTagDocuments, listTags, updateTag, type Tag, type TagDocument } from "./tags.api"

interface ContextMenuState {
  tag: Tag
  x: number
  y: number
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)

  return `${formatted} ${units[exponent]}`
}

function formatShortDate(value?: string | null) {
  return formatPreferredShortDate(value, "Unknown date")
}

function TagBadge({ tag, name, color }: { tag?: Tag; name?: string; color?: string | null }) {
  const label = tag?.name ?? name ?? "Tag"
  const dotColor = tag?.color ?? color ?? "#94a3b8"

  return (
    <span className="inline-flex w-fit max-w-full items-center gap-1.5 self-start rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span className="truncate">{label}</span>
    </span>
  )
}

function getTagDescription(tag: Tag) {
  const description = tag.description?.trim()
  return description && description.length > 0 ? description : "-"
}

function TagDocumentsButton({ tag, onOpen }: { tag: Tag; onOpen: (tag: Tag, trigger: HTMLElement) => void }) {
  const documentsCount = tag.documentsCount ?? 0
  const countClassName = "inline-flex h-8 items-center justify-start gap-2 text-sm"

  if (documentsCount === 0) {
    return (
      <span className={cn(countClassName, "text-muted-foreground")}>
        <Files className="size-4" />
        {documentsCount}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        countClassName,
        "rounded-md text-foreground transition-colors hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      onClick={(event) => onOpen(tag, event.currentTarget)}
    >
      <Files className="size-4" />
      {documentsCount}
    </button>
  )
}

function DeleteTagDialog({
  open,
  tag,
  tags,
  isPending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  tag?: Tag | null
  tags?: Tag[]
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const tagsToDelete = tags ?? (tag ? [tag] : [])
  const attachedDocuments = tagsToDelete.reduce((total, item) => total + (item.documentsCount ?? 0), 0)
  const title = tagsToDelete.length === 1 ? `Delete "${tagsToDelete[0]?.name ?? "tag"}"?` : `Delete ${tagsToDelete.length} tags?`
  const description =
    attachedDocuments > 0
      ? `Deleting ${tagsToDelete.length === 1 ? "this tag" : "these tags"} will remove ${tagsToDelete.length === 1 ? "it" : "them"} from ${attachedDocuments} attached document${attachedDocuments === 1 ? "" : "s"}.`
      : tagsToDelete.length === 1
        ? "This tag is not attached to any documents right now."
        : "These tags are not attached to any documents right now."

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!isPending || nextOpen) && onOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {tagsToDelete.length > 1 ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            {tagsToDelete.map((item) => item.name).join(", ")}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TagDocumentsDialog({
  open,
  tag,
  documents,
  isLoading,
  error,
  onOpenChange,
}: {
  open: boolean
  tag: Tag | null
  documents: TagDocument[]
  isLoading: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{tag ? `Documents tagged "${tag.name}"` : "Tagged documents"}</DialogTitle>
        </DialogHeader>
        {isLoading ? <div className="py-8 text-sm text-muted-foreground">Loading documents...</div> : null}
        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
        {!isLoading && !error && documents.length === 0 ? <div className="py-8 text-sm text-muted-foreground">No accessible documents use this tag.</div> : null}
        {!isLoading && !error && documents.length > 0 ? (
          <div className="max-h-[42rem] overflow-auto rounded-md border">
            {documents.map((document) => (
              <Link
                key={`${document.vaultId}-${document.id}`}
                to={`/vaults/${document.vaultId}/${document.id}`}
                className="grid gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-accent md:grid-cols-[minmax(0,1fr)_12rem_8rem]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{document.name}</div>
                  {document.originalName !== document.name ? <div className="truncate text-xs text-muted-foreground">{document.originalName}</div> : null}
                </div>
                <div className="truncate text-sm text-muted-foreground">{document.vaultName}</div>
                <div className="text-sm text-muted-foreground">
                  <div>{formatBytes(document.originalSize)}</div>
                  <div className="text-xs">{formatShortDate(document.updatedAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TagActions({
  tag,
  disabled,
  onEdit,
  onDelete,
}: {
  tag: Tag
  disabled: boolean
  onEdit: (tag: Tag, trigger?: HTMLButtonElement | null) => void
  onDelete: (tag: Tag, trigger?: HTMLButtonElement | null) => void
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={triggerRef} type="button" variant="ghost" size="icon" aria-label={`Open actions for ${tag.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(tag, triggerRef.current)}>
          <Pencil className="size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={disabled} variant="destructive" onSelect={() => onDelete(tag, triggerRef.current)}>
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TagsList({
  tags,
  selectedTagIds,
  allVisibleSelected,
  someVisibleSelected,
  mutationPending,
  onToggleAll,
  onToggleTag,
  onOpenDocuments,
  onEdit,
  onDelete,
  onOpenContextMenu,
}: {
  tags: Tag[]
  selectedTagIds: string[]
  allVisibleSelected: boolean
  someVisibleSelected: boolean
  mutationPending: boolean
  onToggleAll: (checked: boolean) => void
  onToggleTag: (tagId: string, checked: boolean) => void
  onOpenDocuments: (tag: Tag, trigger: HTMLElement) => void
  onEdit: (tag: Tag) => void
  onDelete: (tag: Tag) => void
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, tag: Tag) => void
}) {
  return (
    <div className="-mt-4 overflow-hidden border-b bg-background md:-mt-6">
      <div className="hidden grid-cols-[auto_minmax(0,1fr)_minmax(12rem,20rem)_7rem_7.5rem_3rem] gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid lg:px-6">
        <Checkbox
          checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
          aria-label="Select all visible tags"
          onCheckedChange={(checked) => onToggleAll(checked === true)}
        />
        <span>Tag</span>
        <span>Description</span>
        <span>Documents</span>
        <span>Created</span>
        <span />
      </div>
      <div>
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id)

          return (
            <div
              key={tag.id}
              data-state={isSelected ? "selected" : undefined}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-4 py-2 transition-colors last:border-b-0 hover:bg-accent/40 md:grid-cols-[auto_minmax(0,1fr)_minmax(12rem,20rem)_7rem_7.5rem_3rem] lg:px-6",
                isSelected && "bg-accent/40"
              )}
              onContextMenu={(event) => onOpenContextMenu(event, tag)}
            >
              <Checkbox
                checked={isSelected}
                aria-label={`Select ${tag.name}`}
                onCheckedChange={(checked) => onToggleTag(tag.id, checked === true)}
              />
              <div className="flex min-w-0 flex-col gap-1">
                <TagBadge tag={tag} />
                <div className="truncate text-xs text-muted-foreground md:hidden">
                  {(tag.documentsCount ?? 0)} document{(tag.documentsCount ?? 0) === 1 ? "" : "s"} · {formatShortDate(tag.createdAt)}
                </div>
              </div>
              <span className="hidden truncate text-sm text-muted-foreground md:block">{getTagDescription(tag)}</span>
              <div className="hidden md:block">
                <TagDocumentsButton tag={tag} onOpen={onOpenDocuments} />
              </div>
              <span className="hidden truncate text-sm text-muted-foreground md:block">{formatShortDate(tag.createdAt)}</span>
              <TagActions tag={tag} disabled={mutationPending} onEdit={onEdit} onDelete={onDelete} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TagContextMenu({
  state,
  disabled,
  onClose,
  onEdit,
  onDelete,
}: {
  state: ContextMenuState
  disabled: boolean
  onClose: () => void
  onEdit: (tag: Tag) => void
  onDelete: (tag: Tag) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", onClose)
    window.addEventListener("scroll", onClose, { capture: true })
    window.document.addEventListener("pointerdown", handlePointerDown, { capture: true })

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", onClose)
      window.removeEventListener("scroll", onClose, { capture: true })
      window.document.removeEventListener("pointerdown", handlePointerDown, { capture: true })
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Tag actions for ${state.tag.name}`}
      className="fixed z-50 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: state.x, top: state.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
        onClick={() => {
          onClose()
          onEdit(state.tag)
        }}
      >
        <Pencil className="size-4" />
        Edit
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
        onClick={() => {
          onClose()
          onDelete(state.tag)
        }}
      >
        <Trash2 className="size-4" />
        Delete
      </button>
    </div>
  )
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loadingTags, setLoadingTags] = useState(true)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [filterText, setFilterText] = useState("")
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [dialogMode, setDialogMode] = useState<TagFormDialogMode>("create")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formColor, setFormColor] = useState(DEFAULT_TAG_COLOR)
  const [tagPendingDelete, setTagPendingDelete] = useState<Tag | null>(null)
  const [tagsPendingBulkDelete, setTagsPendingBulkDelete] = useState<Tag[]>([])
  const [documentsTag, setDocumentsTag] = useState<Tag | null>(null)
  const [tagDocuments, setTagDocuments] = useState<TagDocument[]>([])
  const [loadingTagDocuments, setLoadingTagDocuments] = useState(false)
  const [tagDocumentsError, setTagDocumentsError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [mutationPending, setMutationPending] = useState(false)
  const createButtonRef = useRef<HTMLButtonElement | null>(null)

  const selectedTag = useMemo(() => tags.find((tag) => tag.id === editingTagId) ?? null, [editingTagId, tags])
  const filteredTags = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase()
    if (!normalizedFilter) return tags
    return tags.filter((tag) => `${tag.name} ${tag.description ?? ""}`.toLowerCase().includes(normalizedFilter))
  }, [filterText, tags])
  const selectedTags = useMemo(() => filteredTags.filter((tag) => selectedTagIds.includes(tag.id)), [filteredTags, selectedTagIds])
  const allVisibleSelected = filteredTags.length > 0 && filteredTags.every((tag) => selectedTagIds.includes(tag.id))
  const someVisibleSelected = filteredTags.some((tag) => selectedTagIds.includes(tag.id)) && !allVisibleSelected
  const isTagDialogDirty =
    dialogMode === "create"
      ? formName.trim().length > 0 || formDescription.trim().length > 0 || formColor !== DEFAULT_TAG_COLOR
      : selectedTag !== null && (formName !== selectedTag.name || formDescription !== (selectedTag.description ?? "") || formColor !== (selectedTag.color ?? DEFAULT_TAG_COLOR))

  const refreshTags = useCallback(async () => {
    setLoadingTags(true)
    setTagsError(null)
    try {
      const result = await listTags()
      setTags(result.tags)
    } catch (error) {
      setTagsError(error instanceof Error ? error.message : "Unable to load tags.")
    } finally {
      setLoadingTags(false)
    }
  }, [])

  useEffect(() => {
    void refreshTags()
  }, [refreshTags])

  useEffect(() => {
    let ignore = false
    async function loadTagDocuments() {
      if (!documentsTag) {
        setTagDocuments([])
        return
      }

      setLoadingTagDocuments(true)
      setTagDocumentsError(null)
      try {
        const result = await listTagDocuments({ tagId: documentsTag.id })
        if (!ignore) setTagDocuments(result.documents)
      } catch (error) {
        if (!ignore) setTagDocumentsError(error instanceof Error ? error.message : "Unable to load documents for this tag.")
      } finally {
        if (!ignore) setLoadingTagDocuments(false)
      }
    }

    void loadTagDocuments()
    return () => {
      ignore = true
    }
  }, [documentsTag])

  function openCreateDialog() {
    setDialogMode("create")
    setEditingTagId(null)
    setFormName("")
    setFormDescription("")
    setFormColor(DEFAULT_TAG_COLOR)
    setIsDialogOpen(true)
  }

  function openEditDialog(tag: Tag) {
    setDialogMode("edit")
    setEditingTagId(tag.id)
    setFormName(tag.name)
    setFormDescription(tag.description ?? "")
    setFormColor(tag.color ?? DEFAULT_TAG_COLOR)
    setIsDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutationPending || formName.trim().length === 0) return

    const payload = {
      name: formName.trim(),
      color: formColor || null,
      description: formDescription.trim() || null,
    }

    setMutationPending(true)
    try {
      if (dialogMode === "edit" && selectedTag?.id) {
        await updateTag({ ...payload, tagId: selectedTag.id })
        toast.success("Tag updated.")
      } else {
        await createTag(payload)
        toast.success("Tag created.")
      }
      setIsDialogOpen(false)
      await refreshTags()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : dialogMode === "edit" ? "Could not update tag." : "Could not create tag.")
    } finally {
      setMutationPending(false)
    }
  }

  async function confirmDelete(tagsToDelete: Tag[]) {
    if (mutationPending || tagsToDelete.length === 0) return

    setMutationPending(true)
    try {
      await Promise.all(tagsToDelete.map((tag) => deleteTag({ tagId: tag.id })))
      const deletedTagIds = new Set(tagsToDelete.map((tag) => tag.id))
      setSelectedTagIds((current) => current.filter((id) => !deletedTagIds.has(id)))
      setTagPendingDelete(null)
      setTagsPendingBulkDelete([])
      await refreshTags()
      toast.success(tagsToDelete.length === 1 ? "Tag deleted." : `${tagsToDelete.length} tags deleted.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete tag.")
    } finally {
      setMutationPending(false)
    }
  }

  function toggleTagSelection(tagId: string, checked: boolean) {
    setSelectedTagIds((current) => (checked ? Array.from(new Set([...current, tagId])) : current.filter((id) => id !== tagId)))
  }

  function toggleAllVisibleTags(checked: boolean) {
    setSelectedTagIds((current) => {
      if (checked) return Array.from(new Set([...current, ...filteredTags.map((tag) => tag.id)]))
      const visibleTagIds = new Set(filteredTags.map((tag) => tag.id))
      return current.filter((id) => !visibleTagIds.has(id))
    })
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, tag: Tag) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({
      tag,
      x: Math.min(event.clientX, window.innerWidth - 192),
      y: Math.min(event.clientY, window.innerHeight - 104),
    })
  }

  const tagControls = (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filterText}
            className="h-9 w-full cursor-text border-0 bg-transparent pr-3 pl-9 shadow-none focus-visible:ring-0"
            aria-label="Search tags"
            placeholder="Search tags"
            onChange={(event) => setFilterText(event.target.value)}
          />
      </div>
      <Button ref={createButtonRef} type="button" onClick={openCreateDialog}>
        <Plus className="size-4" />
        New tag
      </Button>
    </div>
  )

  return (
    <BaseLayout hideHeaderSearch headerContent={tagControls}>
      <div className="flex min-h-0 flex-col">
        {loadingTags ? (
          <div className="px-4 lg:px-6">
            <div className="flex h-64 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">Loading tags...</div>
          </div>
        ) : tagsError ? (
          <div className="px-4 lg:px-6">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{tagsError}</div>
          </div>
        ) : tags.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-4 py-8 text-center lg:px-6">
            <Tags className="size-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No tags yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">Create the first one to start organizing documents.</p>
          </div>
        ) : filteredTags.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-4 py-8 text-center lg:px-6">
            <Tags className="size-8 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">No tags found</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">No tags match that search.</p>
          </div>
        ) : (
          <TagsList
            tags={filteredTags}
            selectedTagIds={selectedTagIds}
            allVisibleSelected={allVisibleSelected}
            someVisibleSelected={someVisibleSelected}
            mutationPending={mutationPending}
            onToggleAll={toggleAllVisibleTags}
            onToggleTag={toggleTagSelection}
            onOpenDocuments={setDocumentsTag}
            onEdit={openEditDialog}
            onDelete={setTagPendingDelete}
            onOpenContextMenu={openContextMenu}
          />
        )}
      </div>

      {selectedTags.length > 0 ? (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md border bg-background px-4 py-3 shadow-lg">
          <span className="text-sm font-medium">{selectedTags.length} selected</span>
          <Button type="button" variant="destructive" size="sm" disabled={mutationPending} onClick={() => setTagsPendingBulkDelete(selectedTags)}>
            <Trash2 className="size-4" />
            Delete
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setSelectedTagIds([])}>
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <TagFormDialog
        open={isDialogOpen}
        mode={dialogMode}
        isPending={mutationPending}
        name={formName}
        color={formColor}
        description={formDescription}
        isDirty={isTagDialogDirty}
        onNameChange={setFormName}
        onColorChange={setFormColor}
        onDescriptionChange={setFormDescription}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
      />

      <DeleteTagDialog
        open={tagPendingDelete !== null}
        tag={tagPendingDelete}
        isPending={mutationPending}
        onOpenChange={(open) => !open && setTagPendingDelete(null)}
        onConfirm={() => tagPendingDelete && void confirmDelete([tagPendingDelete])}
      />

      <DeleteTagDialog
        open={tagsPendingBulkDelete.length > 0}
        tags={tagsPendingBulkDelete}
        isPending={mutationPending}
        onOpenChange={(open) => !open && setTagsPendingBulkDelete([])}
        onConfirm={() => void confirmDelete(tagsPendingBulkDelete)}
      />

      <TagDocumentsDialog
        open={documentsTag !== null}
        tag={documentsTag}
        documents={tagDocuments}
        isLoading={loadingTagDocuments}
        error={tagDocumentsError}
        onOpenChange={(open) => !open && setDocumentsTag(null)}
      />

      {contextMenu ? (
        <TagContextMenu
          state={contextMenu}
          disabled={mutationPending}
          onClose={() => setContextMenu(null)}
          onEdit={openEditDialog}
          onDelete={setTagPendingDelete}
        />
      ) : null}
    </BaseLayout>
  )
}
