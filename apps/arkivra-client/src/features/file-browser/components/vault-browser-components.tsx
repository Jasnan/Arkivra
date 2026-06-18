import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Portal, Text, chakra } from '@chakra-ui/react';
import { Home } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ActionMenuItemIcon } from '@/components/ui/action-menu';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { getItemName } from './vault-browser.types';
import type {
  BrowserContextItem,
  BrowserContextMenuEntry,
  BrowserDropTarget,
  ContextMenuState,
} from './vault-browser.types';

const BREADCRUMB_LABEL_MAX_LENGTH = 10;

export interface VaultBreadcrumbEntry {
  key: string;
  label: string;
  to?: string;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  dropFolderId?: string | null;
}

function getItemId(item: BrowserContextItem) {
  if (item.type === 'root') {
    return item.vaultId;
  }

  if (item.type === 'background') {
    return item.folderId ?? item.vaultId;
  }

  return item.type === 'folder' ? item.folder.id : item.document.id;
}


function isDropTargetForFolder(dropTarget: BrowserDropTarget | null, folderId: string | null) {
  return dropTarget !== null && dropTarget.folderId === folderId;
}

function getDropTargetStyles(dropTarget: BrowserDropTarget | null, folderId: string | null) {
  if (dropTarget === null || dropTarget.folderId !== folderId) {
    return {};
  }

  return dropTarget.state === 'valid' ? { bg: 'teal.subtle' } : { bg: 'red.subtle' };
}

function getCurrentFolderDropZoneStyles(
  dropTarget: BrowserDropTarget | null,
  folderId: string | null,
) {
  if (dropTarget === null || dropTarget.folderId !== folderId) {
    return {};
  }

  return dropTarget.state === 'valid'
    ? {
        bg: 'teal.subtle',
        outline: '2px solid',
        outlineColor: 'teal.solid',
        outlineOffset: '-2px',
      }
    : {
        bg: 'red.subtle',
        outline: '2px solid',
        outlineColor: 'red.solid',
        outlineOffset: '-2px',
      };
}


function truncateBreadcrumbLabel(label: string) {
  if (label.length <= BREADCRUMB_LABEL_MAX_LENGTH) {
    return label;
  }

  return `${label.slice(0, BREADCRUMB_LABEL_MAX_LENGTH - 3).trimEnd()}...`;
}


function getVisibleVaultBreadcrumbs(entries: VaultBreadcrumbEntry[]) {
  if (entries.length <= 4) {
    return entries;
  }

  return [entries[0], entries[1], null, entries.at(-2)!, entries.at(-1)!];
}


export function VaultRouteBreadcrumbs({
  entries,
  showFullLastLabel = false,
  dropTarget,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
}: {
  entries: VaultBreadcrumbEntry[];
  showFullLastLabel?: boolean;
  dropTarget?: BrowserDropTarget | null;
  onDragOverFolder?: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder?: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder?: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
}) {
  const visibleEntries = getVisibleVaultBreadcrumbs(entries);

  function getBreadcrumbDropProps(entry: VaultBreadcrumbEntry) {
    if (!('dropFolderId' in entry)) {
      return {};
    }

    const folderId = entry.dropFolderId ?? null;

    return {
      rounded: 'md',
      px: '1',
      borderWidth: '1px',
      borderColor:
        dropTarget && isDropTargetForFolder(dropTarget, folderId) ? undefined : 'transparent',
      ...getDropTargetStyles(dropTarget ?? null, folderId),
      onDragOver: onDragOverFolder
        ? (event: DragEvent<HTMLElement>) => onDragOverFolder(event, folderId)
        : undefined,
      onDragLeave: onDragLeaveFolder
        ? (event: DragEvent<HTMLElement>) => onDragLeaveFolder(event, folderId)
        : undefined,
      onDrop: onDropOnFolder
        ? (event: DragEvent<HTMLElement>) => onDropOnFolder(event, folderId)
        : undefined,
    };
  }

  return (
    <Breadcrumb minW="0">
      <BreadcrumbList flexWrap="nowrap">
        {visibleEntries.map((entry, index) => {
          const isLast = index === visibleEntries.length - 1;

          if (entry === null) {
            return (
              <Fragment key="breadcrumb-ellipsis">
                {index > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem flexShrink={0}>
                  <BreadcrumbEllipsis boxSize="auto" px="0.5" />
                </BreadcrumbItem>
              </Fragment>
            );
          }

          const label =
            showFullLastLabel && isLast ? entry.label : truncateBreadcrumbLabel(entry.label);

          return (
            <Fragment key={entry.key}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem minW="0" flexShrink={isLast ? 1 : 0}>
                {entry.onClick && !isLast ? (
                  <BreadcrumbLink
                    as="button"
                    type="button"
                    title={entry.label}
                    minW="0"
                    onClick={entry.onClick}
                    onContextMenu={entry.onContextMenu}
                    {...getBreadcrumbDropProps(entry)}
                  >
                    <Text as="span" display="block" truncate>
                      {label}
                    </Text>
                  </BreadcrumbLink>
                ) : entry.to && !isLast ? (
                  <Link
                    to={entry.to}
                    style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}
                  >
                    <Text
                      title={entry.label}
                      truncate
                      fontWeight="medium"
                      transition="colors"
                      _hover={{ color: 'fg' }}
                      onContextMenu={entry.onContextMenu}
                      {...getBreadcrumbDropProps(entry)}
                    >
                      {label}
                    </Text>
                  </Link>
                ) : (
                  <BreadcrumbPage
                    title={entry.label}
                    minW="0"
                    onContextMenu={entry.onContextMenu}
                    {...getBreadcrumbDropProps(entry)}
                  >
                    <Text as="span" display="block" truncate>
                      {label}
                    </Text>
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}


export function FolderBreadcrumbs({
  currentFolderId,
  breadcrumbs,
  onNavigateFolder,
  onOpenRootContextMenu,
  dropTarget,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
}: {
  currentFolderId: string | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenRootContextMenu: (event: MouseEvent<HTMLElement>) => void;
  dropTarget: BrowserDropTarget | null;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
}) {
  function getBreadcrumbDropProps(folderId: string | null) {
    return {
      rounded: 'md',
      px: '1',
      borderWidth: '1px',
      borderColor: isDropTargetForFolder(dropTarget, folderId) ? undefined : 'transparent',
      ...getDropTargetStyles(dropTarget, folderId),
      onDragOver: (event: DragEvent<HTMLElement>) => onDragOverFolder(event, folderId),
      onDragLeave: (event: DragEvent<HTMLElement>) => onDragLeaveFolder(event, folderId),
      onDrop: (event: DragEvent<HTMLElement>) => onDropOnFolder(event, folderId),
    };
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {currentFolderId === null ? (
            <BreadcrumbPage
              display="inline-flex"
              alignItems="center"
              gap="1.5"
              onContextMenu={onOpenRootContextMenu}
              {...getBreadcrumbDropProps(null)}
            >
              <Home size={14} />
              Root
            </BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              as="button"
              type="button"
              display="inline-flex"
              alignItems="center"
              gap="1.5"
              onClick={() => onNavigateFolder(null)}
              onContextMenu={onOpenRootContextMenu}
              {...getBreadcrumbDropProps(null)}
            >
              <Home size={14} />
              Root
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {breadcrumbs.map((folder, index) => {
          const isCurrent = index === breadcrumbs.length - 1;
          return (
            <Fragment key={folder.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isCurrent ? (
                  <BreadcrumbPage {...getBreadcrumbDropProps(folder.id)}>
                    {folder.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    as="button"
                    type="button"
                    onClick={() => onNavigateFolder(folder.id)}
                    {...getBreadcrumbDropProps(folder.id)}
                  >
                    {folder.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function BrowserContextMenu({
  state,
  actions,
  onClose,
}: {
  state: Exclude<ContextMenuState, null>;
  actions: BrowserContextMenuEntry[];
  onClose: () => void;
}) {
  const visibleEntries = actions.filter((entry) => 'type' in entry || !entry.disabled);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: state.x, y: state.y });
  const menuIdentity = `${state.item.type}:${getItemId(state.item)}:${state.x}:${state.y}`;
  const [activeAction, setActiveAction] = useState<{
    menuIdentity: string;
    actionKey: string;
  } | null>(null);

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
  }, [state.x, state.y, visibleEntries.length]);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
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

    function closeOnOutsideContextMenu(event: globalThis.MouseEvent) {
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

  return (
    <Portal>
      <Box
        ref={menuRef}
        role="menu"
        aria-label={`Actions for ${getItemName(state.item)}`}
        position="fixed"
        zIndex="popover"
        minW="13rem"
        left={`${menuPosition.x}px`}
        top={`${menuPosition.y}px`}
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        p="1.5"
        shadow="xl"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {visibleEntries.map((entry) => {
          if ('type' in entry) {
            if (entry.type === 'separator') {
              return (
                <Box key={entry.key} my="1.5" borderTopWidth="1px" borderColor="border.surface" />
              );
            }

            return (
              <Box key={entry.key} px="3" py="2" fontSize="sm" fontWeight="semibold" color="fg">
                {entry.label}
              </Box>
            );
          }

          const isActive =
            activeAction?.menuIdentity === menuIdentity && activeAction.actionKey === entry.key;
          const isDestructive = entry.tone === 'destructive';
          const inactiveColor = isDestructive ? 'fg.error' : 'fg.muted';
          const activeColor = isDestructive ? 'fg.error' : 'teal.fg';

          return (
            <chakra.button
              key={entry.key}
              type="button"
              role="menuitem"
              data-active={isActive ? 'true' : undefined}
              display="flex"
              minH="9"
              w="full"
              alignItems="center"
              gap="3"
              rounded="md"
              borderWidth="1px"
              borderColor={isActive ? 'teal.muted' : 'transparent'}
              bg={isActive ? 'teal.subtle' : 'transparent'}
              px="3"
              py="2"
              textAlign="left"
              fontSize="sm"
              fontWeight="medium"
              lineHeight="1.25"
              color={isActive ? activeColor : inactiveColor}
              transition="background-color 120ms ease, border-color 120ms ease, color 120ms ease"
              _hover={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: activeColor }}
              _focus={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: activeColor }}
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'teal.solid',
                outlineOffset: '2px',
              }}
              onPointerEnter={() => setActiveAction({ menuIdentity, actionKey: entry.key })}
              onPointerMove={() => setActiveAction({ menuIdentity, actionKey: entry.key })}
              onPointerLeave={() =>
                setActiveAction((current) =>
                  current?.menuIdentity === menuIdentity && current.actionKey === entry.key
                    ? null
                    : current,
                )
              }
              onFocus={() => setActiveAction({ menuIdentity, actionKey: entry.key })}
              onBlur={() =>
                setActiveAction((current) =>
                  current?.menuIdentity === menuIdentity && current.actionKey === entry.key
                    ? null
                    : current,
                )
              }
              onClick={() => {
                onClose();
                window.setTimeout(entry.onSelect, 0);
              }}
            >
              <ActionMenuItemIcon
                icon={entry.icon}
                tone={isDestructive ? 'destructive' : 'default'}
              />
              {entry.label}
            </chakra.button>
          );
        })}
      </Box>
    </Portal>
  );
}

export function BrowserCurrentFolderDropZone({
  folderId,
  dropTarget,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
  children,
}: {
  folderId: string | null;
  dropTarget: BrowserDropTarget | null;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  children: ReactNode;
}) {
  return (
    <Box
      aria-label="Current folder drop zone"
      minW="0"
      flex="1"
      minH="0"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      transition="background-color 120ms ease, outline-color 120ms ease"
      {...getCurrentFolderDropZoneStyles(dropTarget, folderId)}
      onDragOver={(event) => onDragOverFolder(event, folderId)}
      onDragLeave={(event) => onDragLeaveFolder(event, folderId)}
      onDrop={(event) => onDropOnFolder(event, folderId)}
    >
      {children}
    </Box>
  );
}


export { ItemInfoDialog, MoveItemDialog, RenameItemDialog } from './vault-browser-dialogs';
export { BrowserItemGrid } from './vault-browser-grid';
export { BrowserItemList, FileBrowserIcon, GridItemName } from './vault-browser-items';
export type { BrowserListCell, BrowserListColumn } from './vault-browser-items';
