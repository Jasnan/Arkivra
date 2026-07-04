"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { DEFAULT_TAG_COLOR } from "@/app/tags/components/tag-form-dialog"
import type { Tag } from "@/app/tags/tags.api"
import type { DocumentSummary } from "@/app/vaults/vaults.api"

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

export function DocumentTagsCell({
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
              {selectedTags.length > 0 || unselectedTags.length > 0 ? (
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
