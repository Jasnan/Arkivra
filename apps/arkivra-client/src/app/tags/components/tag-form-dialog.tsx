"use client"

import { useRef, type FormEvent } from "react"
import { Check, Lightbulb, Pipette, Plus, Save, Shuffle, TagIcon, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type TagFormDialogMode = "create" | "edit"

export const DEFAULT_TAG_COLOR = "#0EA5E9"
const TAG_NAME_MAX_LENGTH = 50

const DEFAULT_TAG_COLORS = [
  "#EF4444",
  "#F97316",
  "#FACC15",
  "#22C55E",
  "#0EA5E9",
  "#6366F1",
  "#A855F7",
]
const hexPrefixPattern = /^#/
const hexColorPattern = /^[\dA-F]{6}$/i

function expandShortHex(value: string) {
  return value
    .split("")
    .map((character) => `${character}${character}`)
    .join("")
}

function getHexRgb(value: string) {
  const normalized = value.trim().replace(hexPrefixPattern, "")
  const hex = normalized.length === 3 ? expandShortHex(normalized) : normalized

  if (!hexColorPattern.test(hex)) {
    return null
  }

  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function getReadableTextColor(backgroundColor: string) {
  const rgb = getHexRgb(backgroundColor)
  if (!rgb) return "#111827"

  const luminance = (0.299 * rgb.red + 0.587 * rgb.green + 0.114 * rgb.blue) / 255
  return luminance > 0.58 ? "#111827" : "#FFFFFF"
}

function getRandomTagColor() {
  return `#${Math.floor(Math.random() * 0x1000000).toString(16).padStart(6, "0").toUpperCase()}`
}

function PreviewTagBadge({ name, color }: { name: string; color: string | null }) {
  const dotColor = color ?? "#94a3b8"

  return (
    <span className="inline-flex w-fit max-w-full items-center gap-1.5 self-start rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span className="truncate">{name}</span>
    </span>
  )
}

export function TagFormDialog({
  open,
  mode,
  isPending,
  name,
  color,
  description,
  isDirty,
  onNameChange,
  onColorChange,
  onDescriptionChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  mode: TagFormDialogMode
  isPending: boolean
  name: string
  color: string
  description: string
  isDirty: boolean
  onNameChange: (value: string) => void
  onColorChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const colorInputRef = useRef<HTMLInputElement | null>(null)
  const title = mode === "create" ? "Create new tag" : "Edit tag"
  const descriptionText =
    mode === "create"
      ? "Organize your documents with tags"
      : "Update this label while preserving document organization."
  const submitLabel = mode === "create" ? "Create tag" : "Save"
  const pendingLabel = mode === "create" ? "Creating..." : "Saving..."
  const tagNameLabel = name.trim() || "Tag name"

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) =>
        (!isPending || nextOpen) && (!isDirty || nextOpen) && onOpenChange(nextOpen)
      }
    >
      <DialogContent showCloseButton={false} className="overflow-hidden p-0 sm:max-w-2xl">
        <form onSubmit={onSubmit}>
          <DialogHeader className="border-b px-6 pt-6 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className="flex size-14 shrink-0 items-center justify-center rounded-xl border text-primary"
                  style={{ backgroundColor: `${color}22`, borderColor: `${color}55` }}
                >
                  <TagIcon className="size-7" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-2xl">{title}</DialogTitle>
                  {descriptionText ? (
                    <DialogDescription className="mt-1 text-base">{descriptionText}</DialogDescription>
                  ) : null}
                </div>
              </div>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 rounded-xl bg-muted/60"
                  disabled={isPending}
                  aria-label="Close"
                >
                  <X className="size-5" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <div className="space-y-6 px-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="tag-name">
                Tag name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="tag-name"
                  autoFocus
                  required
                  maxLength={TAG_NAME_MAX_LENGTH}
                  value={name}
                  className="h-12 pr-16"
                  placeholder="Enter tag name"
                  onChange={(event) => onNameChange(event.target.value)}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted-foreground">
                  {name.length}/{TAG_NAME_MAX_LENGTH}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Color</Label>
              <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <div className="flex items-center">
                  <div
                    className="flex size-20 items-center justify-center rounded-2xl border shadow-sm"
                    style={{ backgroundColor: `${color}22`, borderColor: `${color}55` }}
                  >
                    <div className="size-14 rounded-xl shadow-inner" style={{ backgroundColor: color }} />
                  </div>
                </div>
                <div className="min-h-24 rounded-xl border bg-muted/20 p-5">
                  <div className="flex min-h-14 flex-nowrap items-center gap-3 overflow-x-auto">
                    {DEFAULT_TAG_COLORS.map((swatch) => {
                      const selected = color.toUpperCase() === swatch.toUpperCase()
                      return (
                        <button
                          key={swatch}
                          type="button"
                          aria-label={`Select color ${swatch}`}
                          aria-pressed={selected}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-full border transition-transform hover:scale-105",
                            selected && "ring-2 ring-ring ring-offset-2"
                          )}
                          style={{ backgroundColor: swatch }}
                          onClick={() => onColorChange(swatch)}
                        >
                          {selected ? (
                            <Check
                              className="size-4"
                              strokeWidth={3}
                              style={{ color: getReadableTextColor(swatch) }}
                            />
                          ) : null}
                        </button>
                      )
                    })}
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Choose custom color"
                        onClick={() => colorInputRef.current?.click()}
                      >
                        <Pipette className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Choose random color"
                        onClick={() => onColorChange(getRandomTagColor())}
                      >
                        <Shuffle className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <input
                  ref={colorInputRef}
                  type="color"
                  value={color}
                  className="sr-only"
                  onChange={(event) => onColorChange(event.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tag-description">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="tag-description"
                maxLength={256}
                value={description}
                className="min-h-24 resize-y"
                placeholder="Add a short description for this tag"
                onChange={(event) => onDescriptionChange(event.target.value)}
              />
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lightbulb className="size-4" />
                Use descriptions to help others understand what this tag is for.
              </p>
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-5 sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-background px-4 py-3 text-sm text-muted-foreground">
              <span className="shrink-0">Preview:</span>
              <PreviewTagBadge name={tagNameLabel} color={color} />
            </div>
            <div className="flex shrink-0 justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={name.trim().length === 0 || isPending}>
                {isPending ? pendingLabel : submitLabel}
                {mode === "create" ? <Plus className="size-4" /> : <Save className="size-4" />}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
