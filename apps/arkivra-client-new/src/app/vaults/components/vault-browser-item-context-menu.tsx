"use client"

import type { LucideIcon } from "lucide-react"
import {
  Download,
  Eye,
  Folder,
  History,
  Info,
  MoveRight,
  Pencil,
  RotateCw,
  Tags,
  Trash2,
} from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import type { FileBrowserItem } from "../vaults.api"

type BrowserItemContextMenuEntry = {
  key: string
  label: string
  icon: LucideIcon
  tone?: "default" | "destructive"
  disabled?: boolean
  onSelect?: () => void
}

export interface VaultBrowserItemContextMenuState {
  item: FileBrowserItem
  x: number
  y: number
}

function getItemName(item: FileBrowserItem) {
  return item.type === "folder" ? item.folder.name : item.document.name
}

export function VaultBrowserItemContextMenu({
  state,
  canDeleteItems,
  canMoveItems,
  itemMutationPending,
  onClose,
  onDownloadDocument,
  onOpenInfo,
  onMoveItem,
  onOpenItem,
  onRenameItem,
  onTrashItem,
  onVersions,
}: {
  state: VaultBrowserItemContextMenuState
  canDeleteItems: boolean
  canMoveItems: boolean
  itemMutationPending: boolean
  onClose: () => void
  onDownloadDocument: (item: Extract<FileBrowserItem, { type: "document" }>) => void
  onOpenInfo: (item: FileBrowserItem) => void
  onMoveItem: (item: FileBrowserItem) => void
  onOpenItem: (item: FileBrowserItem) => void
  onRenameItem: (item: FileBrowserItem) => void
  onTrashItem: (item: FileBrowserItem) => void
  onVersions: (item: Extract<FileBrowserItem, { type: "document" }>) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPosition, setMenuPosition] = useState({ x: state.x, y: state.y })
  const entries = useMemo<BrowserItemContextMenuEntry[]>(() => {
    const item = state.item

    if (item.type === "folder") {
      return [
        { key: "open", label: "Open", icon: Folder, onSelect: () => onOpenItem(item) },
        {
          key: "rename",
          label: "Rename",
          icon: Pencil,
          disabled: !canMoveItems || itemMutationPending,
          onSelect: () => onRenameItem(item),
        },
        {
          key: "move",
          label: "Move to",
          icon: MoveRight,
          disabled: !canMoveItems || itemMutationPending,
          onSelect: () => onMoveItem(item),
        },
        { key: "retry-processing", label: "Retry failed parsing", icon: RotateCw, disabled: true },
        { key: "info", label: "Info", icon: Info, onSelect: () => onOpenInfo(item) },
        {
          key: "trash",
          label: "Trash",
          icon: Trash2,
          tone: "destructive",
          disabled: !canDeleteItems || itemMutationPending,
          onSelect: () => onTrashItem(item),
        },
      ]
    }

    return [
      { key: "open", label: "Preview/open", icon: Eye, onSelect: () => onOpenItem(item) },
      {
        key: "download",
        label: "Download",
        icon: Download,
        onSelect: () => onDownloadDocument(item),
      },
      { key: "versions", label: "Versions", icon: History, onSelect: () => onVersions(item) },
      {
        key: "retry-processing",
        label: "Retry parsing",
        icon: RotateCw,
        disabled: true,
      },
      {
        key: "rename",
        label: "Rename",
        icon: Pencil,
        disabled: !canMoveItems || itemMutationPending,
        onSelect: () => onRenameItem(item),
      },
      {
        key: "move",
        label: "Move to",
        icon: MoveRight,
        disabled: !canMoveItems || itemMutationPending,
        onSelect: () => onMoveItem(item),
      },
      { key: "tags", label: "Tags", icon: Tags, disabled: true },
      { key: "info", label: "Info", icon: Info, onSelect: () => onOpenInfo(item) },
      {
        key: "trash",
        label: "Trash",
        icon: Trash2,
        tone: "destructive",
        disabled: !canDeleteItems || itemMutationPending,
        onSelect: () => onTrashItem(item),
      },
    ]
  }, [
    canDeleteItems,
    canMoveItems,
    itemMutationPending,
    onDownloadDocument,
    onOpenInfo,
    onMoveItem,
    onOpenItem,
    onRenameItem,
    onTrashItem,
    onVersions,
    state.item,
  ])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (menu === null) {
      return
    }

    const viewportMargin = 8
    const rect = menu.getBoundingClientRect()
    const maxX = Math.max(viewportMargin, window.innerWidth - rect.width - viewportMargin)
    const maxY = Math.max(viewportMargin, window.innerHeight - rect.height - viewportMargin)
    const nextPosition = {
      x: Math.min(Math.max(state.x, viewportMargin), maxX),
      y: Math.min(Math.max(state.y, viewportMargin), maxY),
    }

    setMenuPosition((currentPosition) =>
      currentPosition.x === nextPosition.x && currentPosition.y === nextPosition.y
        ? currentPosition
        : nextPosition
    )
  }, [entries.length, state.x, state.y])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
      }
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return
      }

      onClose()
    }

    function closeOnOutsideContextMenu(event: MouseEvent) {
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return
      }

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
      window.document.removeEventListener("contextmenu", closeOnOutsideContextMenu, {
        capture: true,
      })
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${getItemName(state.item)}`}
      className="fixed z-50 min-w-56 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-xl"
      style={{ left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry) => {
        const Icon = entry.icon
        const isDestructive = entry.tone === "destructive"

        return (
          <button
            key={entry.key}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            className={cn(
              "flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors",
              entry.disabled
                ? "cursor-not-allowed opacity-55"
                : isDestructive
                  ? "cursor-pointer text-destructive hover:bg-destructive/10"
                  : "cursor-pointer hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => {
              if (entry.disabled) {
                return
              }

              onClose()
              window.setTimeout(() => entry.onSelect?.(), 0)
            }}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{entry.label}</span>
          </button>
        )
      })}
    </div>,
    document.body
  )
}
