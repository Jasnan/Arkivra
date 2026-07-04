'use client';

import type { LucideIcon } from 'lucide-react';
import { FolderOpen, History, MessageSquare, Settings2, Trash2, Users } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';
import type { VaultSummary } from '../vaults.api';

interface VaultAction {
  key: string;
  label: string;
  icon: LucideIcon;
  tone?: 'default' | 'destructive';
  disabled?: boolean;
  onSelect?: () => void;
}

export interface VaultItemContextMenuState {
  vault: VaultSummary;
  x: number;
  y: number;
}

export function VaultItemContextMenu({
  state,
  onClose,
  onOpenVault,
  onOpenMembers,
  onOpenSettings,
  onOpenActivity,
  onOpenChat,
  onDeleteVault,
  canUseChat,
  deleteDisabled,
}: {
  state: VaultItemContextMenuState;
  onClose: () => void;
  onOpenVault: (vault: VaultSummary) => void;
  onOpenMembers: (vault: VaultSummary) => void;
  onOpenSettings: (vault: VaultSummary) => void;
  onOpenActivity: (vault: VaultSummary) => void;
  onOpenChat: (vault: VaultSummary) => void;
  onDeleteVault: (vault: VaultSummary) => void;
  canUseChat: boolean;
  deleteDisabled?: boolean;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: state.x, y: state.y });
  const canManageVault =
    state.vault.role === 'owner' || state.vault.isAdmin || state.vault.accessMode === 'admin';
  const actions = useMemo<VaultAction[]>(
    () => [
      {
        key: 'open',
        label: 'Open',
        icon: FolderOpen,
        onSelect: () => onOpenVault(state.vault),
      },
      {
        key: 'members',
        label: 'Members',
        icon: Users,
        disabled: !canManageVault,
        onSelect: () => onOpenMembers(state.vault),
      },
      {
        key: 'settings',
        label: 'Settings',
        icon: Settings2,
        disabled: !canManageVault,
        onSelect: () => onOpenSettings(state.vault),
      },
      {
        key: 'activity',
        label: 'Activity',
        icon: History,
        disabled: !canManageVault,
        onSelect: () => onOpenActivity(state.vault),
      },
      {
        key: 'chat',
        label: 'Chat',
        icon: MessageSquare,
        disabled: !canUseChat,
        onSelect: () => onOpenChat(state.vault),
      },
      {
        key: 'delete',
        label: 'Delete',
        icon: Trash2,
        tone: 'destructive',
        disabled: !canManageVault || deleteDisabled,
        onSelect: () => onDeleteVault(state.vault),
      },
    ],
    [
      canManageVault,
      canUseChat,
      deleteDisabled,
      onDeleteVault,
      onOpenActivity,
      onOpenChat,
      onOpenMembers,
      onOpenSettings,
      onOpenVault,
      state.vault,
    ],
  );

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu === null) {
      return;
    }

    const viewportMargin = 8;
    const rect = menu.getBoundingClientRect();
    const maxX = Math.max(viewportMargin, window.innerWidth - rect.width - viewportMargin);
    const maxY = Math.max(viewportMargin, window.innerHeight - rect.height - viewportMargin);
    const nextPosition = {
      x: Math.min(Math.max(state.x, viewportMargin), maxX),
      y: Math.min(Math.max(state.y, viewportMargin), maxY),
    };

    setMenuPosition((currentPosition) =>
      currentPosition.x === nextPosition.x && currentPosition.y === nextPosition.y
        ? currentPosition
        : nextPosition,
    );
  }, [actions.length, state.x, state.y]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    function closeOnOutsideContextMenu(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, { capture: true });
    window.document.addEventListener('pointerdown', closeOnOutsidePointer, { capture: true });
    window.document.addEventListener('contextmenu', closeOnOutsideContextMenu, { capture: true });

    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, { capture: true });
      window.document.removeEventListener('pointerdown', closeOnOutsidePointer, { capture: true });
      window.document.removeEventListener('contextmenu', closeOnOutsideContextMenu, {
        capture: true,
      });
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Vault actions for ${state.vault.name}`}
      className="fixed z-50 min-w-48 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-xl"
      style={{ left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        const isDestructive = action.tone === 'destructive';

        return (
          <button
            key={action.key}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            className={cn(
              'flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors',
              action.disabled
                ? 'cursor-not-allowed opacity-55'
                : isDestructive
                  ? 'cursor-pointer text-destructive hover:bg-destructive/10'
                  : 'cursor-pointer hover:bg-accent hover:text-accent-foreground',
            )}
            onClick={() => {
              if (action.disabled) {
                return;
              }

              onClose();
              window.setTimeout(() => action.onSelect?.(), 0);
            }}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{action.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
