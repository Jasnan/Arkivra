"use client"

import type { LucideIcon } from "lucide-react"
import {
  FileUp,
  FolderPlus,
  FolderUp,
  History,
  MessageSquare,
  RotateCw,
  Settings2,
  Users,
} from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

type VaultContextMenuEntry =
  | {
      key: string
      label: string
      icon: LucideIcon
      disabled?: boolean
      onSelect?: () => void
    }
  | { key: string; type: "header"; label: string }
  | { key: string; type: "separator" }

export interface VaultContextMenuState {
  x: number
  y: number
  vaultName: string
}

export function VaultContextMenu({
  state,
  canCreateItems,
  onClose,
  onCreateFolder,
  onUploadFiles,
  onUploadFolder,
}: {
  state: VaultContextMenuState
  canCreateItems: boolean
  onClose: () => void
  onCreateFolder: () => void
  onUploadFiles: () => void
  onUploadFolder: () => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPosition, setMenuPosition] = useState({ x: state.x, y: state.y })
  const entries = useMemo<VaultContextMenuEntry[]>(
    () => [
      { key: "vault-name", type: "header", label: state.vaultName },
      { key: "after-vault-name", type: "separator" },
      {
        key: "new-folder",
        label: "New folder",
        icon: FolderPlus,
        disabled: !canCreateItems,
        onSelect: onCreateFolder,
      },
      { key: "after-new-folder", type: "separator" },
      {
        key: "upload-files",
        label: "Upload files",
        icon: FileUp,
        disabled: !canCreateItems,
        onSelect: onUploadFiles,
      },
      {
        key: "upload-folder",
        label: "Upload folder",
        icon: FolderUp,
        disabled: !canCreateItems,
        onSelect: onUploadFolder,
      },
      { key: "after-upload", type: "separator" },
      {
        key: "retry-processing",
        label: "Retry failed parsing",
        icon: RotateCw,
        disabled: true,
      },
      { key: "after-retry", type: "separator" },
      { key: "members", label: "Members", icon: Users, disabled: true },
      { key: "settings", label: "Settings", icon: Settings2, disabled: true },
      { key: "activity", label: "Activity", icon: History, disabled: true },
      { key: "chat", label: "Chat", icon: MessageSquare, disabled: true },
    ],
    [canCreateItems, onCreateFolder, onUploadFiles, onUploadFolder, state.vaultName]
  )

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
      aria-label={`Actions for ${state.vaultName}`}
      className="fixed z-50 min-w-56 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-xl"
      style={{ left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {entries.map((entry) => {
        if ("type" in entry) {
          if (entry.type === "separator") {
            return <div key={entry.key} className="my-1.5 border-t" />
          }

          return (
            <div key={entry.key} className="px-3 py-2 text-sm font-semibold">
              {entry.label}
            </div>
          )
        }

        const Icon = entry.icon

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
                : "cursor-pointer hover:bg-accent hover:text-accent-foreground"
            )}
            onClick={() => {
              if (entry.disabled) {
                return
              }

              entry.onSelect?.()
              onClose()
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
