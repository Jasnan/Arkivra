import type { ComponentPropsWithoutRef, CSSProperties, DragEvent, FormEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Fragment, forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import type { VirtuosoGridProps } from 'react-virtuoso';
import { Box, Checkbox as ChakraCheckbox, CloseButton, Dialog as ChakraDialog, Flex, Grid, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, Folder, Home, Search } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Button } from '@/components/ui/button';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { getDocumentFileIconMeta } from '@/features/documents/components/document-file-icon.utils';
import { formatBytes } from '@/features/documents/documents.utils';
import { getBrowserItemKey, getDocumentTypeLabel, getFileDisplayName, getItemDisplayName, getItemName } from './vault-browser.types';
import type { BrowserAction, BrowserContextItem, BrowserContextMenuEntry, BrowserDropTarget, BrowserItem, ContextMenuState, InfoDialogTarget, ItemDialogTarget, MoveDestination, MoveDialogTarget } from './vault-browser.types';

const listRowHeights = {
  compact: 56,
  comfortable: 72,
  relaxed: 80,
} as const;
const BREADCRUMB_LABEL_MAX_LENGTH = 10;
const LIST_GRID_COLUMNS = 'minmax(0, 1fr) 6rem 8.5rem 2.75rem';
const SELECTABLE_LIST_GRID_COLUMNS = '2.5rem minmax(0, 1fr) 6rem 8.5rem 2.75rem';
const GRID_ITEM_WIDTH = '10.75rem';
const GRID_ITEM_GAP = '0.8rem';
const GRID_ITEM_HEIGHT = '8rem';
const GRID_ITEM_PADDING = '0.75rem';
const GRID_ITEM_NAME_MAX_LENGTH = 20;
const singleLineGridItemNameStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflowWrap: 'normal',
  wordBreak: 'normal',
};
const twoLineGridItemNameStyle: CSSProperties = {
  display: '-webkit-box',
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: '2',
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

export interface VaultBreadcrumbEntry {
  key: string;
  label: string;
  to?: string;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  dropFolderId?: string | null;
}

export interface BrowserListColumn {
  key: string;
  label: ReactNode;
}

export interface BrowserListCell {
  key: string;
  content: ReactNode;
}

const virtuosoGridComponents: VirtuosoGridProps<BrowserItem, unknown>['components'] = {
  // eslint-disable-next-line react/no-forward-ref -- react-virtuoso's documented grid adapter passes its measured list ref this way.
  List: forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(({ style, children, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        ...style,
      }}
    >
      {children}
    </div>
  )),
  Item: ({ children, ...props }) => (
    <div
      {...props}
      style={{
        padding: `calc(var(--arkivra-gridItemGap, ${GRID_ITEM_GAP}) / 2)`,
        width: `calc(${GRID_ITEM_WIDTH} + var(--arkivra-gridItemGap, ${GRID_ITEM_GAP}))`,
        display: 'flex',
        flex: 'none',
        alignContent: 'stretch',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  ),
};

function formatDateOnly(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
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

function getItemKindLabel(item: BrowserContextItem) {
  if (item.type === 'root') {
    return 'Folder';
  }

  if (item.type === 'background') {
    return 'Folder';
  }

  return item.type === 'folder' ? 'Folder' : getDocumentTypeLabel({ name: item.document.name, mimeType: item.document.mimeType });
}

export function FileBrowserIcon({ item, size = 'grid' }: { item: BrowserItem; size?: 'list' | 'grid' | 'search' }) {
  const isList = size === 'list';
  const isSearch = size === 'search';
  const containerSize = isSearch ? '8' : isList ? '10' : '12';
  const documentBoxSize = isSearch ? '8' : '9';
  const documentIconSize = isSearch ? 30 : 36;
  const folderIconSize = isSearch ? 24 : isList ? 30 : 34;
  const badgeMaxW = isSearch ? '6' : '8';
  const badgePaddingX = isSearch ? '0.5' : '1';
  const badgeFontSize = isSearch ? '0.34rem' : '0.46rem';

  if (item.type === 'folder') {
    return (
      <Flex boxSize={containerSize} shrink={0} align="center" justify="center" color="teal.fg">
        <Folder size={folderIconSize} strokeWidth={1.5} />
      </Flex>
    );
  }

  const { badgeBg, badgeColor, color, icon: DocumentIcon, label } = getDocumentFileIconMeta({
    name: item.document.name,
    mimeType: item.document.mimeType,
  });

  return (
    <Flex boxSize={containerSize} shrink={0} align="center" justify="center" color={color}>
      <Box position="relative" boxSize={documentBoxSize} color={color}>
        <DocumentIcon size={documentIconSize} strokeWidth={1.5} />
        <Text
          as="span"
          position="absolute"
          left="50%"
          top={isSearch ? '66%' : '64%'}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          transform="translate(-50%, -50%)"
          maxW={badgeMaxW}
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
          rounded="2px"
          bg={badgeBg}
          px={badgePaddingX}
          py="0.5"
          fontSize={badgeFontSize}
          fontWeight="bold"
          letterSpacing="normal"
          lineHeight="1"
          color={badgeColor}
        >
          {label}
        </Text>
      </Box>
    </Flex>
  );
}

function isDropTargetForFolder(dropTarget: BrowserDropTarget | null, folderId: string | null) {
  return dropTarget !== null && dropTarget.folderId === folderId;
}

function getDropTargetStyles(dropTarget: BrowserDropTarget | null, folderId: string | null) {
  if (dropTarget === null || dropTarget.folderId !== folderId) {
    return {};
  }

  return dropTarget.state === 'valid'
    ? { bg: 'teal.subtle' }
    : { bg: 'red.subtle' };
}

function getBrowserItemSurfaceStyles({
  isSelected,
  isDragSource,
  isContextTarget,
  contextBg = 'bg.subtle',
  contextBorderColor,
}: {
  isSelected: boolean;
  isDragSource: boolean;
  isContextTarget: boolean;
  contextBg?: string;
  contextBorderColor?: string;
}) {
  const styles: { bg?: string; borderColor?: string; opacity: number } = {
    opacity: isDragSource ? 0.65 : 1,
  };

  if (isContextTarget) {
    styles.bg = contextBg;
    styles.borderColor = contextBorderColor ?? 'border.strong';
  } else if (isSelected) {
    styles.bg = 'teal.subtle';
    styles.borderColor = 'teal.muted';
  }

  return styles;
}

function handleItemKeyboardSelection({
  event,
  item,
  onOpenItem,
  onSelectItem,
}: {
  event: KeyboardEvent<HTMLElement>;
  item: BrowserItem;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, item: BrowserItem) => void;
}) {
  if (event.key === 'Enter') {
    event.preventDefault();
    onOpenItem(item);
    return;
  }

  if (event.key === ' ') {
    event.preventDefault();
    onSelectItem(event, item);
  }
}

function truncateBreadcrumbLabel(label: string) {
  if (label.length <= BREADCRUMB_LABEL_MAX_LENGTH) {
    return label;
  }

  return `${label.slice(0, BREADCRUMB_LABEL_MAX_LENGTH - 3).trimEnd()}...`;
}

function truncateGridItemName(name: string) {
  if (name.length <= GRID_ITEM_NAME_MAX_LENGTH) {
    return name;
  }

  return `${name.slice(0, GRID_ITEM_NAME_MAX_LENGTH - 3).trimEnd()}...`;
}

function getVisibleVaultBreadcrumbs(entries: VaultBreadcrumbEntry[]) {
  if (entries.length <= 4) {
    return entries;
  }

  return [
    entries[0],
    entries[1],
    null,
    entries.at(-2)!,
    entries.at(-1)!,
  ];
}

function SelectionCheckbox({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean | 'indeterminate';
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <ChakraCheckbox.Root
      size="sm"
      checked={checked}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onCheckedChange={(event) => onCheckedChange(event.checked === true)}
    >
      <ChakraCheckbox.HiddenInput />
      <ChakraCheckbox.Control>
        <ChakraCheckbox.Indicator />
      </ChakraCheckbox.Control>
    </ChakraCheckbox.Root>
  );
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
      borderColor: dropTarget && isDropTargetForFolder(dropTarget, folderId) ? undefined : 'transparent',
      ...getDropTargetStyles(dropTarget ?? null, folderId),
      onDragOver: onDragOverFolder ? (event: DragEvent<HTMLElement>) => onDragOverFolder(event, folderId) : undefined,
      onDragLeave: onDragLeaveFolder ? (event: DragEvent<HTMLElement>) => onDragLeaveFolder(event, folderId) : undefined,
      onDrop: onDropOnFolder ? (event: DragEvent<HTMLElement>) => onDropOnFolder(event, folderId) : undefined,
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

          const label = showFullLastLabel && isLast ? entry.label : truncateBreadcrumbLabel(entry.label);

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
                  <Link to={entry.to} style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
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

function handleBrowserItemClick({
  event,
  item,
  onOpenItem,
  onSelectItem,
}: {
  event: MouseEvent<HTMLElement>;
  item: BrowserItem;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, item: BrowserItem) => void;
}) {
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    onSelectItem(event, item);
    return;
  }

  onOpenItem(item);
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
            <BreadcrumbPage display="inline-flex" alignItems="center" gap="1.5" onContextMenu={onOpenRootContextMenu} {...getBreadcrumbDropProps(null)}>
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
                  <BreadcrumbPage {...getBreadcrumbDropProps(folder.id)}>{folder.name}</BreadcrumbPage>
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

function BrowserItemActions({
  item,
  actions,
  disabled,
}: {
  item: BrowserItem;
  actions: BrowserAction[];
  disabled?: boolean;
}) {
  const availableActions = actions.filter(action => !action.disabled);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ActionMenuTriggerButton
          label={`Open actions for ${getItemName(item)}`}
          disabled={disabled || availableActions.length === 0}
          onClick={(event) => event.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minW="48">
        {availableActions.map((action) => (
          <DropdownMenuItem
            key={action.key}
            value={action.key}
            color={action.tone === 'destructive' ? 'fg.error' : undefined}
            onClick={(event) => event.stopPropagation()}
            onSelect={action.onSelect}
          >
            <ActionMenuItemIcon icon={action.icon} tone={action.tone === 'destructive' ? 'destructive' : 'default'} />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GridItemActions({
  item,
  actions,
  disabled,
}: {
  item: BrowserItem;
  actions: BrowserAction[];
  disabled?: boolean;
}) {
  return (
    <Box
      className="browser-grid-actions"
      position="absolute"
      top="2"
      right="2"
      zIndex="1"
      opacity="0"
      pointerEvents="none"
      transform="translateY(-2px)"
      transition="opacity 120ms ease, transform 120ms ease"
      css={{
        '@media (hover: none)': {
          opacity: 1,
          pointerEvents: 'auto',
          transform: 'none',
        },
      }}
    >
      <BrowserItemActions
        item={item}
        actions={actions}
        disabled={disabled}
      />
    </Box>
  );
}

export function GridItemName({
  density,
  name,
}: {
  density: string;
  name: string;
}) {
  const displayName = truncateGridItemName(name);

  return (
    <TooltipProvider delayDuration={20}>
      <Tooltip openDelay={20} closeDelay={0} positioning={{ placement: 'top' }}>
        <TooltipTrigger asChild>
          <Text
            data-grid-item-name
            aria-label={name}
            fontSize="sm"
            fontWeight="medium"
            lineHeight="short"
            color="fg"
            style={density === 'relaxed' ? twoLineGridItemNameStyle : singleLineGridItemNameStyle}
          >
            {displayName}
          </Text>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  const visibleEntries = actions.filter(entry => 'type' in entry || !entry.disabled);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ x: state.x, y: state.y });

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

    setMenuPosition((currentPosition) => (
      currentPosition.x === nextPosition.x && currentPosition.y === nextPosition.y
        ? currentPosition
        : nextPosition
    ));
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
      window.document.removeEventListener('contextmenu', closeOnOutsideContextMenu, { capture: true });
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
              return <Box key={entry.key} my="1.5" borderTopWidth="1px" borderColor="border.surface" />;
            }

            return (
              <Box key={entry.key} px="3" py="2" fontSize="sm" fontWeight="semibold" color="fg">
                {entry.label}
              </Box>
            );
          }

          return (
            <chakra.button
              key={entry.key}
              type="button"
              role="menuitem"
              display="flex"
              w="full"
              alignItems="center"
              gap="3"
              rounded="md"
              px="3"
              py="2"
              textAlign="left"
              fontSize="sm"
              fontWeight="medium"
              color={entry.tone === 'destructive' ? 'fg.error' : 'fg.muted'}
              _hover={{ bg: 'bg.subtle', color: entry.tone === 'destructive' ? 'fg.error' : 'fg' }}
              _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '2px' }}
              onClick={() => {
                onClose();
                window.setTimeout(entry.onSelect, 0);
              }}
            >
              <ActionMenuItemIcon icon={entry.icon} tone={entry.tone === 'destructive' ? 'destructive' : 'default'} />
              {entry.label}
            </chakra.button>
          );
        })}
      </Box>
    </Portal>
  );
}

export function BrowserItemList({
  items,
  vaultId,
  selectedItemKeys,
  selectable = false,
  allItemsSelected = false,
  someItemsSelected = false,
  contextItemKey,
  draggedItemKeys,
  dropTarget,
  onOpenItem,
  onSelectItem,
  onToggleAllItems,
  onToggleItem,
  getItemActions,
  getDocumentLink,
  listGridColumns,
  listColumns,
  renderDocumentListMetadata,
  onDragStartItem,
  onDragEndItem,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
  onOpenContextMenu,
  onOpenBackgroundContextMenu,
  isMutating,
  isDraggable = true,
}: {
  items: BrowserItem[];
  vaultId: string;
  selectedItemKeys: Set<string>;
  selectable?: boolean;
  allItemsSelected?: boolean;
  someItemsSelected?: boolean;
  contextItemKey?: string | null;
  draggedItemKeys: Set<string>;
  dropTarget: BrowserDropTarget | null;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, item: BrowserItem) => void;
  onToggleAllItems?: (checked: boolean) => void;
  onToggleItem?: (item: BrowserItem, checked: boolean) => void;
  getItemActions: (item: BrowserItem) => BrowserAction[];
  getDocumentLink?: (document: Extract<BrowserItem, { type: 'document' }>['document']) => string;
  listGridColumns?: string;
  listColumns?: BrowserListColumn[];
  renderDocumentListMetadata?: (item: Extract<BrowserItem, { type: 'document' }>) => BrowserListCell[];
  onDragStartItem: (event: DragEvent<HTMLElement>, item: BrowserItem) => void;
  onDragEndItem: () => void;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: BrowserItem) => void;
  onOpenBackgroundContextMenu: (event: MouseEvent<HTMLElement>) => void;
  isMutating?: boolean;
  isDraggable?: boolean;
}) {
  const { density } = useAccentColor();
  const listRowHeight = listRowHeights[density];
  const resolvedListGridColumns = listGridColumns ?? (selectable ? SELECTABLE_LIST_GRID_COLUMNS : LIST_GRID_COLUMNS);
  const resolvedListColumns = listColumns ?? [
    { key: 'name', label: 'Name' },
    { key: 'size', label: 'Size' },
    { key: 'modified', label: 'Modified' },
  ];
  const baseListGridColumns = selectable ? '2.5rem minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto';

  return (
    <Box
      role="listbox"
      aria-label="Folder items"
      aria-multiselectable="true"
      display="flex"
      flexDirection="column"
      flex="1"
      minH="0"
      overflow="hidden"
      borderColor="border.surface"
      bg="bg.workspace"
      onContextMenu={onOpenBackgroundContextMenu}
    >
      <Grid
        display={{ base: 'none', md: 'grid' }}
        templateColumns={resolvedListGridColumns}
        gap="4"
        borderBottomWidth="1px"
        borderColor="border.surface"
        flexShrink="0"
        px="6"
        py="var(--arkivra-listHeaderPaddingY, 0.75rem)"
        fontSize="sm"
        fontWeight="medium"
        color="fg.subtle"
      >
        {selectable ? (
          <SelectionCheckbox
            checked={someItemsSelected ? 'indeterminate' : allItemsSelected}
            label="Select all items"
            onCheckedChange={(checked) => onToggleAllItems?.(checked)}
          />
        ) : null}
        {resolvedListColumns.map((column) => (
          <Text key={column.key} as="span">{column.label}</Text>
        ))}
        <Text as="span" srOnly>Actions</Text>
      </Grid>

      <Box flex="1" minH="0" overflow="hidden">
        <Virtuoso
          data={items}
          fixedItemHeight={listRowHeight}
          computeItemKey={(index, item) => item ? getBrowserItemKey(item) : `__item_${index}`}
          initialItemCount={Math.min(items.length, 24)}
          style={{ height: '100%' }}
          itemContent={(index, item) => {
            if (item === undefined) {
              return null;
            }

            const name = getItemName(item);
            const displayName = getItemDisplayName(item);
            const updatedAt = item.type === 'folder' ? item.folder.updatedAt : item.document.updatedAt;
            const actions = getItemActions(item);
            const itemKey = getBrowserItemKey(item);
            const isSelected = selectedItemKeys.has(itemKey);
            const isContextTarget = contextItemKey === itemKey;
            const isDragSource = draggedItemKeys.has(itemKey);
            const itemSurfaceStyles = getBrowserItemSurfaceStyles({ isSelected, isDragSource, isContextTarget });
            const folderDropStyles = item.type === 'folder' ? getDropTargetStyles(dropTarget, item.folder.id) : {};
            const documentLink = item.type === 'document'
              ? getDocumentLink?.(item.document) ?? ROUTES.vaultDocument(vaultId, item.document.id)
              : null;
            const documentMetadataCells = item.type === 'document'
              ? renderDocumentListMetadata?.(item) ?? [
                  { key: 'size', content: formatBytes(item.document.originalSize) },
                  { key: 'modified', content: formatDateOnly(updatedAt) },
                ]
              : [];

            return (
              <Box
                role="option"
                aria-selected={isSelected}
                aria-label={name}
                tabIndex={0}
                draggable={isDraggable && !isMutating}
                h={`${listRowHeight}px`}
                borderBottomWidth={index === items.length - 1 ? '0' : '1px'}
                borderColor="border.divider"
                cursor="pointer"
                outline="none"
                {...itemSurfaceStyles}
                {...folderDropStyles}
                _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '-2px' }}
                onClick={(event) => handleBrowserItemClick({ event, item, onOpenItem, onSelectItem })}
                onKeyDown={(event) => handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })}
                onDragStart={isDraggable ? (event) => onDragStartItem(event, item) : undefined}
                onDragEnd={isDraggable ? onDragEndItem : undefined}
                onDragOver={isDraggable && item.type === 'folder' ? (event) => onDragOverFolder(event, item.folder.id) : undefined}
                onDragLeave={isDraggable && item.type === 'folder' ? (event) => onDragLeaveFolder(event, item.folder.id) : undefined}
                onDrop={isDraggable && item.type === 'folder' ? (event) => onDropOnFolder(event, item.folder.id) : undefined}
                onContextMenu={(event) => onOpenContextMenu(event, item)}
              >
                {item.type === 'folder' ? (
                  <Grid
                    display="grid"
                    h="full"
                    w="full"
                    gridTemplateColumns={{ base: baseListGridColumns, md: resolvedListGridColumns }}
                    gap="4"
                    alignItems="center"
                    px="6"
                    textAlign="left"
                    transition="background-color 0.15s ease"
                    _hover={{ bg: 'bg.subtle' }}
                  >
                    {selectable ? (
                      <SelectionCheckbox
                        checked={isSelected}
                        label={`Select ${name}`}
                        onCheckedChange={(checked) => onToggleItem?.(item, checked)}
                      />
                    ) : null}
                    <chakra.button
                      type="button"
                      minW="0"
                      textAlign="left"
                      cursor="pointer"
                      aria-label={`Open folder ${item.folder.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenItem(item);
                      }}
                    >
                      <Flex minW="0" align="center" gap="3">
                        <FileBrowserIcon item={item} size="list" />
                        <Box minW="0">
                          <Text truncate fontWeight="semibold" color="fg">{displayName}</Text>
                          <Text display={{ md: 'none' }} mt="1" textStyle="xs" color="fg.muted">
                            Folder - Updated {formatDateOnly(updatedAt)}
                          </Text>
                        </Box>
                      </Flex>
                    </chakra.button>
                    <Text display={{ base: 'none', md: 'block' }} textStyle="sm" color="fg.muted">Folder</Text>
                    <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm">{formatDateOnly(updatedAt)}</Text>
                    <BrowserItemActions item={item} actions={actions} disabled={isMutating} />
                  </Grid>
                ) : (
                  <Grid
                    h="full"
                    templateColumns={{ base: baseListGridColumns, md: resolvedListGridColumns }}
                    gap="4"
                    alignItems="center"
                    px="6"
                    transition="background-color 0.15s ease"
                    _hover={{ bg: 'bg.subtle' }}
                  >
                    {selectable ? (
                      <SelectionCheckbox
                        checked={isSelected}
                        label={`Select ${name}`}
                        onCheckedChange={(checked) => onToggleItem?.(item, checked)}
                      />
                    ) : null}
                    <Link
                      to={documentLink ?? ROUTES.vaultDocument(vaultId, item.document.id)}
                      style={{ minWidth: 0, color: 'inherit', cursor: 'pointer', textDecoration: 'none' }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Flex minW="0" align="center" gap="3">
                        <FileBrowserIcon item={item} size="list" />
                        <Box minW="0">
                          <Text truncate fontWeight="semibold" color="fg">{displayName}</Text>
                          {item.document.originalName !== item.document.name ? (
                            <Text mt="1" truncate textStyle="xs" color="fg.muted">
                              {getFileDisplayName(item.document.originalName)}
                            </Text>
                          ) : null}
                        </Box>
                      </Flex>
                    </Link>
                    {documentMetadataCells.map((cell) => (
                      <Link
                        key={cell.key}
                        to={documentLink ?? ROUTES.vaultDocument(vaultId, item.document.id)}
                        style={{ display: 'block', minWidth: 0, color: 'inherit', cursor: 'pointer', textDecoration: 'none' }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm">{cell.content}</Text>
                      </Link>
                    ))}
                    <BrowserItemActions
                      item={item}
                      actions={actions}
                      disabled={isMutating}
                    />
                  </Grid>
                )}
              </Box>
            );
          }}
        />
      </Box>
    </Box>
  );
}

export function BrowserItemGrid({
  items,
  vaultId,
  selectedItemKeys,
  selectable = false,
  contextItemKey,
  draggedItemKeys,
  dropTarget,
  onOpenItem,
  onSelectItem,
  onToggleItem,
  getItemActions,
  getDocumentLink,
  renderDocumentGridMeta,
  onDragStartItem,
  onDragEndItem,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
  onOpenContextMenu,
  onOpenBackgroundContextMenu,
  isMutating,
  isDraggable = true,
}: {
  items: BrowserItem[];
  vaultId: string;
  selectedItemKeys: Set<string>;
  selectable?: boolean;
  contextItemKey?: string | null;
  draggedItemKeys: Set<string>;
  dropTarget: BrowserDropTarget | null;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, item: BrowserItem) => void;
  onToggleItem?: (item: BrowserItem, checked: boolean) => void;
  getItemActions: (item: BrowserItem) => BrowserAction[];
  getDocumentLink?: (document: Extract<BrowserItem, { type: 'document' }>['document']) => string;
  renderDocumentGridMeta?: (item: Extract<BrowserItem, { type: 'document' }>) => ReactNode;
  onDragStartItem: (event: DragEvent<HTMLElement>, item: BrowserItem) => void;
  onDragEndItem: () => void;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: BrowserItem) => void;
  onOpenBackgroundContextMenu: (event: MouseEvent<HTMLElement>) => void;
  isMutating?: boolean;
  isDraggable?: boolean;
}) {
  const { density } = useAccentColor();

  return (
    <Box
      h="full"
      flex="1"
      minH="0"
      overflow="hidden"
      role="listbox"
      aria-label="Folder items"
      aria-multiselectable="true"
      boxSizing="border-box"
      borderColor="border.surface"
      bg="bg.workspace"
      px={{ base: '3', lg: '4' }}
      onContextMenu={onOpenBackgroundContextMenu}
    >
      <VirtuosoGrid
        data={items}
        components={virtuosoGridComponents}
        computeItemKey={(index, item) => item ? getBrowserItemKey(item) : `__item_${index}`}
        initialItemCount={Math.min(items.length, 24)}
        style={{ height: '100%', width: '100%' }}
        itemContent={(_, item) => {
          if (item === undefined) {
            return null;
          }

          const name = getItemName(item);
          const displayName = getItemDisplayName(item);
          const actions = getItemActions(item);
          const itemKey = getBrowserItemKey(item);
          const isSelected = selectedItemKeys.has(itemKey);
          const isContextTarget = contextItemKey === itemKey;
          const isDragSource = draggedItemKeys.has(itemKey);
          const itemSurfaceStyles = getBrowserItemSurfaceStyles({
            isSelected,
            isDragSource,
            isContextTarget,
            contextBg: 'bg.workspaceMuted',
            contextBorderColor: 'border.strong',
          });
          const folderDropStyles = item.type === 'folder' ? getDropTargetStyles(dropTarget, item.folder.id) : {};
          const documentLink = item.type === 'document'
            ? getDocumentLink?.(item.document) ?? ROUTES.vaultDocument(vaultId, item.document.id)
            : null;
          const body = item.type === 'folder' ? (
            <Box
              h="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
              p={`var(--arkivra-gridItemPadding, ${GRID_ITEM_PADDING})`}
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.workspace"
              transition="background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease"
              _hover={{
                bg: isSelected && !isContextTarget ? 'teal.subtle' : 'bg.workspaceMuted',
                borderColor: isSelected && !isContextTarget ? 'teal.muted' : 'border.strong',
              }}
              {...itemSurfaceStyles}
              {...folderDropStyles}
            >
              <Stack align="center" justify="center" gap="2.5" w="full" h="full" textAlign="center">
                <GridItemActions item={item} actions={actions} disabled={isMutating} />
                {selectable ? (
                  <Box position="absolute" top="2" left="2">
                    <SelectionCheckbox
                      checked={isSelected}
                      label={`Select ${name}`}
                      onCheckedChange={(checked) => onToggleItem?.(item, checked)}
                    />
                  </Box>
                ) : null}
                <Stack align="center" gap="2.5" w="full" minW="0">
                  <FileBrowserIcon item={item} />
                  <chakra.button
                    type="button"
                    w="full"
                    maxW="full"
                    minW="0"
                    textAlign="center"
                    cursor="pointer"
                    aria-label={`Open folder ${item.folder.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenItem(item);
                    }}
                  >
                    <Box w="full" minW="0" maxW="full" px="1">
                      <GridItemName name={displayName} density={density} />
                    </Box>
                  </chakra.button>
                </Stack>
              </Stack>
            </Box>
          ) : (
            <Box
              h="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
              p={`var(--arkivra-gridItemPadding, ${GRID_ITEM_PADDING})`}
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.workspace"
              transition="background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease"
              _hover={{
                bg: isSelected && !isContextTarget ? 'teal.subtle' : 'bg.workspaceMuted',
                borderColor: isSelected && !isContextTarget ? 'teal.muted' : 'border.strong',
              }}
              {...itemSurfaceStyles}
            >
              <Stack align="center" justify="center" gap="2.5" w="full" h="full" textAlign="center">
                <GridItemActions item={item} actions={actions} disabled={isMutating} />
                {selectable ? (
                  <Box position="absolute" top="2" left="2">
                    <SelectionCheckbox
                      checked={isSelected}
                      label={`Select ${name}`}
                      onCheckedChange={(checked) => onToggleItem?.(item, checked)}
                    />
                  </Box>
                ) : null}
                <Stack align="center" gap="2.5" w="full" minW="0">
                  <FileBrowserIcon item={item} />
                  <Link
                    to={documentLink ?? ROUTES.vaultDocument(vaultId, item.document.id)}
                    style={{ display: 'block', width: '100%', maxWidth: '100%', minWidth: 0, color: 'inherit', cursor: 'pointer', textDecoration: 'none' }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Box w="full" minW="0" maxW="full" px="1">
                      <GridItemName name={displayName} density={density} />
                    </Box>
                  </Link>
                  {renderDocumentGridMeta?.(item)}
                </Stack>
              </Stack>
            </Box>
          );

          return item.type === 'folder' ? (
            <Box
              position="relative"
              w="full"
              h={`var(--arkivra-gridItemHeight, ${GRID_ITEM_HEIGHT})`}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              aria-label={item.folder.name}
              draggable={isDraggable && !isMutating}
              textAlign="left"
              cursor="pointer"
              outline="none"
              onClick={(event) => handleBrowserItemClick({ event, item, onOpenItem, onSelectItem })}
              onKeyDown={(event) => handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })}
              onDragStart={isDraggable ? (event) => onDragStartItem(event, item) : undefined}
              onDragEnd={isDraggable ? onDragEndItem : undefined}
              onDragOver={isDraggable ? (event) => onDragOverFolder(event, item.folder.id) : undefined}
              onDragLeave={isDraggable ? (event) => onDragLeaveFolder(event, item.folder.id) : undefined}
              onDrop={isDraggable ? (event) => onDropOnFolder(event, item.folder.id) : undefined}
              onContextMenu={(event) => onOpenContextMenu(event, item)}
              _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '2px' }}
              css={{
                '&:hover .browser-grid-actions, &:focus-within .browser-grid-actions': {
                  opacity: 1,
                  pointerEvents: 'auto',
                  transform: 'none',
                },
              }}
            >
              {body}
            </Box>
          ) : (
            <Box
              position="relative"
              w="full"
              h={`var(--arkivra-gridItemHeight, ${GRID_ITEM_HEIGHT})`}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              aria-label={item.document.name}
              draggable={isDraggable && !isMutating}
              cursor="pointer"
              outline="none"
              onClick={(event) => handleBrowserItemClick({ event, item, onOpenItem, onSelectItem })}
              onKeyDown={(event) => handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })}
              onDragStart={isDraggable ? (event) => onDragStartItem(event, item) : undefined}
              onDragEnd={isDraggable ? onDragEndItem : undefined}
              onContextMenu={(event) => onOpenContextMenu(event, item)}
              _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '2px' }}
              css={{
                '&:hover .browser-grid-actions, &:focus-within .browser-grid-actions': {
                  opacity: 1,
                  pointerEvents: 'auto',
                  transform: 'none',
                },
              }}
            >
              {body}
            </Box>
          );
        }}
      />
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Grid templateColumns="8rem minmax(0, 1fr)" gap="4" alignItems="start">
      <Text fontSize="sm" color="fg.muted">{label}</Text>
      <Text minW="0" fontSize="sm" color="fg" wordBreak="break-word">{value}</Text>
    </Grid>
  );
}

const closedMoveDialogTarget: BrowserItem = {
  type: 'folder',
  folder: {
    id: '__closed_move_dialog__',
    vaultId: '',
    parentId: null,
    name: 'item',
    createdBy: '',
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: '',
    updatedAt: '',
  },
};

function getMoveDialogTargets(target: MoveDialogTarget) {
  if (Array.isArray(target)) {
    return target;
  }

  return target === null ? [] : [target];
}

function getMoveDialogTargetKey(targets: BrowserItem[]) {
  if (targets.length === 0) {
    return '__closed_move_dialog__';
  }

  return targets.map(item => getBrowserItemKey(item)).join('|');
}

function getMoveDialogTitle(targets: BrowserItem[]) {
  if (targets.length === 1) {
    return `Move ${getItemName(targets[0]!)}`;
  }

  return `Move ${targets.length} items`;
}

function getCommonDestinationId(targets: BrowserItem[]) {
  if (targets.length === 0) {
    return null;
  }

  const [firstTarget] = targets;
  const firstDestinationId = firstTarget.type === 'folder' ? firstTarget.folder.parentId : firstTarget.document.folderId;

  return targets.every((target) => {
    const destinationId = target.type === 'folder' ? target.folder.parentId : target.document.folderId;
    return destinationId === firstDestinationId;
  })
    ? firstDestinationId
    : undefined;
}

export function RenameItemDialog({
  open,
  target,
  value,
  isPending,
  onValueChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  target: ItemDialogTarget;
  value: string;
  isPending: boolean;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const targetType = target?.type ?? 'item';
  const originalName = target ? getItemName(target) : '';
  const isRenameFormDirty = value !== originalName;
  const canDismissRenameDialog = !isRenameFormDirty && !isPending;

  return (
    <ChakraDialog.Root open={open} closeOnEscape={canDismissRenameDialog} closeOnInteractOutside={canDismissRenameDialog} onOpenChange={(event) => { if (!event.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'md' }}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{`Rename ${targetType}`}</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <chakra.form id="rename-item-form" display="flex" flexDirection="column" gap="4" onSubmit={onSubmit}>
                <chakra.label htmlFor="rename-item-name" fontSize="sm" fontWeight="medium" color="fg">
                  Name
                </chakra.label>
                <Input
                  id="rename-item-name"
                  autoFocus
                  value={value}
                  maxLength={255}
                  onChange={(event) => onValueChange(event.target.value)}
                />
              </chakra.form>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <ChakraDialog.ActionTrigger asChild>
                <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
                  Cancel
                </Button>
              </ChakraDialog.ActionTrigger>
              <Button type="submit" form="rename-item-form" disabled={value.trim().length === 0 || isPending}>
                {isPending ? 'Renaming...' : 'Rename'}
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function MoveItemDialog({
  open,
  target,
  value,
  destinations,
  isPending,
  isLoading,
  onValueChange,
  onClose,
  onSubmit,
}: MoveItemDialogProps) {
  const dialogTargets = getMoveDialogTargets(target);

  return (
    <OpenMoveItemDialog
      open={open}
      targets={dialogTargets.length > 0 ? dialogTargets : [closedMoveDialogTarget]}
      value={value}
      destinations={destinations}
      isPending={isPending}
      isLoading={isLoading}
      onValueChange={onValueChange}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

interface MoveItemDialogProps {
  open: boolean;
  target: MoveDialogTarget;
  value: string | null;
  destinations: MoveDestination[];
  isPending: boolean;
  isLoading: boolean;
  onValueChange: (value: string | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface OpenMoveItemDialogProps extends Omit<MoveItemDialogProps, 'target'> {
  open: boolean;
  targets: BrowserItem[];
}

function OpenMoveItemDialog({
  open,
  targets,
  value,
  destinations,
  isPending,
  isLoading,
  onValueChange,
  onClose,
  onSubmit,
}: OpenMoveItemDialogProps) {
  const targetKey = getMoveDialogTargetKey(targets);
  const [searchState, setSearchState] = useState({ targetKey: '', value: '' });
  const searchQuery = searchState.targetKey === targetKey ? searchState.value : '';

  const filteredDestinations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    if (normalizedQuery.length === 0) {
      return destinations;
    }

    return destinations.filter((destination) => {
      const searchableText = `${destination.name} ${destination.label}`.toLocaleLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [destinations, searchQuery]);

  const currentDestinationId = getCommonDestinationId(targets);
  const selectedDestination = destinations.find(destination => destination.id === value) ?? destinations[0] ?? null;
  const hasMoveSelectionChanged = currentDestinationId === undefined ? value !== null : value !== currentDestinationId;
  const isMoveFormDirty = searchQuery.trim().length > 0 || hasMoveSelectionChanged;
  const canDismissMoveDialog = !isMoveFormDirty && !isPending;
  const canSubmitMove = !isLoading
    && !isPending
    && targets.length > 0
    && selectedDestination !== null
    && value === selectedDestination.id
    && (currentDestinationId === undefined || value !== currentDestinationId);

  return (
    <ChakraDialog.Root open={open} closeOnEscape={canDismissMoveDialog} closeOnInteractOutside={canDismissMoveDialog} onOpenChange={(event) => { if (!event.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'lg' }}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{getMoveDialogTitle(targets)}</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <chakra.form id="move-item-form" display="flex" flexDirection="column" gap="4" onSubmit={onSubmit}>
                <chakra.label htmlFor="move-item-folder-search" fontSize="sm" fontWeight="medium" color="fg">
                  Search folders
                </chakra.label>
                <Box position="relative">
                  <Flex
                    position="absolute"
                    top="0"
                    bottom="0"
                    left="3"
                    align="center"
                    color="fg.muted"
                    pointerEvents="none"
                  >
                    <Search size={16} />
                  </Flex>
                  <Input
                    id="move-item-folder-search"
                    autoFocus
                    value={searchQuery}
                    disabled={isLoading || isPending}
                    pl="9"
                    placeholder="Find a destination"
                    onChange={(event) => setSearchState({ targetKey, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                      }
                    }}
                  />
                </Box>
                <Box
                  role="listbox"
                  aria-label="Move destination"
                  h={{ base: '18rem', md: '20rem' }}
                  overflow="hidden"
                  rounded="lg"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                >
                  {isLoading ? (
                    <Flex h="full" align="center" justify="center" px="4">
                      <Text fontSize="sm" color="fg.muted">Loading folders...</Text>
                    </Flex>
                  ) : filteredDestinations.length === 0 ? (
                    <Flex h="full" align="center" justify="center" px="4">
                      <Text fontSize="sm" color="fg.muted">No folders found.</Text>
                    </Flex>
                  ) : (
                    <Virtuoso
                      data={filteredDestinations}
                      computeItemKey={(index, destination) => destination?.id ?? `__destination_${index}`}
                      initialItemCount={Math.min(filteredDestinations.length, 32)}
                      style={{ height: '100%' }}
                      itemContent={(index, destination) => {
                        if (destination === undefined) {
                          return null;
                        }

                        const isSelected = destination.id === value;
                        const isCurrent = currentDestinationId !== undefined && destination.id === currentDestinationId;
                        const icon = destination.id === null ? <Home size={16} /> : <Folder size={16} />;

                        return (
                          <chakra.button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            disabled={isPending}
                            display="flex"
                            w="full"
                            minH="3rem"
                            alignItems="center"
                            gap="3"
                            borderBottomWidth={index === filteredDestinations.length - 1 ? '0' : '1px'}
                            borderColor="border.surface"
                            bg={isSelected ? 'teal.subtle' : 'transparent'}
                            px="3"
                            py="2"
                            textAlign="left"
                            transition="background-color 0.15s ease"
                            _hover={{ bg: isSelected ? 'teal.subtle' : 'bg.subtle' }}
                            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '-2px' }}
                            onClick={() => onValueChange(destination.id)}
                          >
                            <Flex
                              minW="0"
                              flex="1"
                              align="center"
                              gap="3"
                              ps={`${Math.min(destination.depth, 8) * 0.75}rem`}
                            >
                              <Flex
                                boxSize="7"
                                shrink={0}
                                align="center"
                                justify="center"
                                rounded="md"
                                bg={destination.id === null ? 'bg.subtle' : 'teal.subtle'}
                                color={destination.id === null ? 'fg.muted' : 'teal.fg'}
                              >
                                {icon}
                              </Flex>
                              <Box minW="0">
                                <Flex minW="0" align="center" gap="2">
                                  <Text truncate fontSize="sm" fontWeight="semibold" color="fg">
                                    {destination.name}
                                  </Text>
                                  {isCurrent ? (
                                    <Text as="span" flexShrink={0} textStyle="xs" color="fg.muted">
                                      Current
                                    </Text>
                                  ) : null}
                                </Flex>
                                {destination.label !== destination.name ? (
                                  <Text mt="0.5" truncate textStyle="xs" color="fg.muted">
                                    {destination.label}
                                  </Text>
                                ) : null}
                              </Box>
                            </Flex>
                            <Flex boxSize="5" shrink={0} align="center" justify="center" color={isSelected ? 'teal.fg' : 'transparent'}>
                              <Check size={16} />
                            </Flex>
                          </chakra.button>
                        );
                      }}
                    />
                  )}
                </Box>
                {selectedDestination !== null ? (
                  <Text fontSize="sm" color="fg.muted">
                    Destination: {selectedDestination.label}
                  </Text>
                ) : null}
              </chakra.form>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <ChakraDialog.ActionTrigger asChild>
                <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
                  Cancel
                </Button>
              </ChakraDialog.ActionTrigger>
              <Button
                type="submit"
                form="move-item-form"
                disabled={!canSubmitMove}
              >
                {isPending ? 'Moving...' : 'Move'}
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function ItemInfoDialog({
  open,
  target,
  folderPath,
  onClose,
}: {
  open: boolean;
  target: InfoDialogTarget;
  folderPath: string;
  onClose: () => void;
}) {
  const titleTarget: BrowserContextItem = target ?? {
    type: 'background',
    vaultId: '',
    folderId: null,
    name: 'Current folder',
  };

  return (
    <ChakraDialog.Root open={open} onOpenChange={(event) => { if (!event.open) onClose(); }} size={{ mdDown: 'full', md: 'md' }}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>Info</ChakraDialog.Title>
              <ChakraDialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Stack gap="3">
                <InfoRow label="Name" value={getItemName(titleTarget)} />
                <InfoRow label="Type" value={getItemKindLabel(titleTarget)} />
                {titleTarget.type !== 'root' && titleTarget.type !== 'background' ? <InfoRow label="Location" value={folderPath} /> : null}
                {titleTarget.type === 'document' ? (
                  <>
                    <InfoRow label="Size" value={formatBytes(titleTarget.document.originalSize)} />
                    <InfoRow label="Original file" value={titleTarget.document.originalName} />
                    <InfoRow label="MIME type" value={titleTarget.document.mimeType} />
                  </>
                ) : null}
                {titleTarget.type === 'folder' || titleTarget.type === 'document' ? (
                  <>
                    <InfoRow label="Created" value={formatDateOnly(titleTarget.type === 'folder' ? titleTarget.folder.createdAt : titleTarget.document.createdAt)} />
                    <InfoRow label="Updated" value={formatDateOnly(titleTarget.type === 'folder' ? titleTarget.folder.updatedAt : titleTarget.document.updatedAt)} />
                  </>
                ) : null}
                <InfoRow label={titleTarget.type === 'root' ? 'Vault ID' : 'ID'} value={getItemId(titleTarget)} />
              </Stack>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button type="button" onClick={onClose}>
                Close
              </Button>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}
