import type { ComponentPropsWithoutRef, DragEvent, FormEvent, KeyboardEvent, MouseEvent, ReactNode, Ref } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import { Box, Checkbox as ChakraCheckbox, CloseButton, Dialog as ChakraDialog, Flex, Grid, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, Folder, Home, Search } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Button } from '@/components/ui/button';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
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
import { getBrowserItemKey, getDocumentTypeLabel, getItemName } from './vault-browser.types';
import type { BrowserAction, BrowserContextItem, BrowserDropTarget, BrowserItem, ContextMenuState, InfoDialogTarget, ItemDialogTarget, MoveDestination } from './vault-browser.types';

const BROWSER_SCROLL_HEIGHT = '100%';
const listRowHeights = {
  compact: 56,
  comfortable: 72,
  relaxed: 80,
} as const;
const BREADCRUMB_LABEL_MAX_LENGTH = 10;
const LIST_GRID_COLUMNS = 'minmax(0, 1fr) 6rem 8.5rem 2.75rem';
const SELECTABLE_LIST_GRID_COLUMNS = '2.5rem minmax(0, 1fr) 6rem 8.5rem 2.75rem';
const gridItemNameStyles = {
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: '2',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
} as const;

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

function VirtuosoGridList({ style, ref, ...props }: ComponentPropsWithoutRef<'div'> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <Box
      ref={ref}
      {...props}
      style={{ ...style, paddingTop: 'var(--arkivra-gridItemGap, 2rem)' }}
      display="grid"
      gridTemplateColumns="repeat(auto-fill, minmax(13.5rem, 13.5rem))"
      gap="var(--arkivra-gridItemGap, 2rem)"
      alignContent="start"
      px={{ base: '4', lg: '6' }}
      pb="var(--arkivra-gridItemGap, 2rem)"
    />
  );
}

const virtuosoGridComponents = {
  List: VirtuosoGridList,
  Item: ({ children, ...props }: ComponentPropsWithoutRef<'div'>) => (
    <Box {...props} minW="0">
      {children}
    </Box>
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

function FileBrowserIcon({ item, size = 'grid' }: { item: BrowserItem; size?: 'list' | 'grid' }) {
  const isList = size === 'list';

  if (item.type === 'folder') {
    return (
      <Flex boxSize={isList ? '10' : '16'} shrink={0} align="center" justify="center" color="teal.fg">
        <Folder size={isList ? 30 : 42} strokeWidth={1.5} />
      </Flex>
    );
  }

  const { badgeBg, badgeColor, color, icon: DocumentIcon, label } = getDocumentFileIconMeta({
    name: item.document.name,
    mimeType: item.document.mimeType,
  });

  return (
    <Flex boxSize={isList ? '10' : '16'} shrink={0} align="center" justify="center" color={color}>
      <Box position="relative" boxSize={isList ? '9' : '11'} color={color}>
        <DocumentIcon size={isList ? 36 : 44} strokeWidth={1.5} />
        <Text
          as="span"
          position="absolute"
          left="50%"
          top="64%"
          transform="translate(-50%, -50%)"
          maxW="9"
          truncate
          rounded="2px"
          bg={badgeBg}
          px="1"
          py="0.5"
          fontSize={isList ? '0.46rem' : '0.52rem'}
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
    if (contextBorderColor) {
      styles.borderColor = contextBorderColor;
    }
  } else if (isSelected) {
    styles.bg = 'teal.subtle';
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
  dropTarget,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
}: {
  entries: VaultBreadcrumbEntry[];
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

          const label = truncateBreadcrumbLabel(entry.label);

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

export function BrowserContextMenu({
  state,
  actions,
  onClose,
}: {
  state: Exclude<ContextMenuState, null>;
  actions: BrowserAction[];
  onClose: () => void;
}) {
  const availableActions = actions.filter(action => !action.disabled);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
        left={`${state.x}px`}
        top={`${state.y}px`}
        rounded="lg"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.surface"
        p="1.5"
        shadow="xl"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {availableActions.map((action) => (
          <chakra.button
            key={action.key}
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
            color={action.tone === 'destructive' ? 'fg.error' : 'fg.muted'}
            _hover={{ bg: 'bg.subtle', color: action.tone === 'destructive' ? 'fg.error' : 'fg' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '2px' }}
            onClick={() => {
              onClose();
              window.setTimeout(action.onSelect, 0);
            }}
          >
            <ActionMenuItemIcon icon={action.icon} tone={action.tone === 'destructive' ? 'destructive' : 'default'} />
            {action.label}
          </chakra.button>
        ))}
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
      flex="1"
      minH="0"
      overflow="hidden"
      borderTopWidth="1px"
      borderColor="border.subtle"
      bg="bg.workspace"
      onContextMenu={onOpenBackgroundContextMenu}
    >
      <Grid
        display={{ base: 'none', md: 'grid' }}
        templateColumns={resolvedListGridColumns}
        gap="4"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        px="6"
        py="var(--arkivra-listHeaderPaddingY, 0.75rem)"
        fontSize="sm"
        color="fg.muted"
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

      <Box h={BROWSER_SCROLL_HEIGHT}>
        <Virtuoso
          data={items}
          fixedItemHeight={listRowHeight}
          computeItemKey={(index, item) => item ? getBrowserItemKey(item) : `__item_${index}`}
          initialItemCount={Math.min(items.length, 24)}
          style={{ height: '100%' }}
          itemContent={(_, item) => {
            if (item === undefined) {
              return null;
            }

            const name = getItemName(item);
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
                borderBottomWidth="1px"
                borderColor="border.subtle"
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
                          <Text truncate fontWeight="semibold" color="fg">{name}</Text>
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
                          <Text truncate fontWeight="semibold" color="fg">{name}</Text>
                          {item.document.originalName !== item.document.name ? (
                            <Text mt="1" truncate textStyle="xs" color="fg.muted">
                              {item.document.originalName}
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
  return (
    <Box
      h={BROWSER_SCROLL_HEIGHT}
      minH="0"
      flex="1"
      role="listbox"
      aria-label="Folder items"
      aria-multiselectable="true"
      borderTopWidth="1px"
      borderColor="border.subtle"
      bg="bg.workspace"
      onContextMenu={onOpenBackgroundContextMenu}
    >
      <VirtuosoGrid
        data={items}
        components={virtuosoGridComponents}
        computeItemKey={(index, item) => item ? getBrowserItemKey(item) : `__item_${index}`}
        initialItemCount={Math.min(items.length, 24)}
        style={{ height: '100%' }}
        itemContent={(_, item) => {
          if (item === undefined) {
            return null;
          }

          const name = getItemName(item);
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
              p="var(--arkivra-gridItemPadding, 1.25rem)"
              rounded="md"
              borderWidth="1px"
              borderColor="border.subtle"
              bg="bg.workspace"
              transition="background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease"
              _hover={{
                bg: isSelected && !isContextTarget ? 'teal.subtle' : 'bg.workspaceMuted',
                borderColor: isSelected && !isContextTarget ? 'teal.muted' : 'border.strong',
              }}
              {...itemSurfaceStyles}
              {...folderDropStyles}
            >
              <Stack align="center" justify="center" gap="4" w="full" h="full" textAlign="center">
                <Box position="absolute" top="3" right="3">
                  <BrowserItemActions
                    item={item}
                    actions={actions}
                    disabled={isMutating}
                  />
                </Box>
                {selectable ? (
                  <Box position="absolute" top="3" left="3">
                    <SelectionCheckbox
                      checked={isSelected}
                      label={`Select ${name}`}
                      onCheckedChange={(checked) => onToggleItem?.(item, checked)}
                    />
                  </Box>
                ) : null}
                <Stack align="center" gap="4" w="full" minW="0">
                  <FileBrowserIcon item={item} />
                  <chakra.button
                    type="button"
                    minW="0"
                    textAlign="center"
                    cursor="pointer"
                    aria-label={`Open folder ${item.folder.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenItem(item);
                    }}
                  >
                    <Box minW="0" maxW="full" px="2">
                      <Text fontSize="lg" fontWeight="medium" color="fg" {...gridItemNameStyles}>{name}</Text>
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
              p="var(--arkivra-gridItemPadding, 1.25rem)"
              rounded="md"
              borderWidth="1px"
              borderColor="border.subtle"
              bg="bg.workspace"
              transition="background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease"
              _hover={{
                bg: isSelected && !isContextTarget ? 'teal.subtle' : 'bg.workspaceMuted',
                borderColor: isSelected && !isContextTarget ? 'teal.muted' : 'border.strong',
              }}
              {...itemSurfaceStyles}
            >
              <Stack align="center" justify="center" gap="4" w="full" h="full" textAlign="center">
                <Box position="absolute" top="3" right="3">
                  <BrowserItemActions
                    item={item}
                    actions={actions}
                    disabled={isMutating}
                  />
                </Box>
                {selectable ? (
                  <Box position="absolute" top="3" left="3">
                    <SelectionCheckbox
                      checked={isSelected}
                      label={`Select ${name}`}
                      onCheckedChange={(checked) => onToggleItem?.(item, checked)}
                    />
                  </Box>
                ) : null}
                <Stack align="center" gap="4" w="full" minW="0">
                  <FileBrowserIcon item={item} />
                  <Link
                    to={documentLink ?? ROUTES.vaultDocument(vaultId, item.document.id)}
                    style={{ minWidth: 0, color: 'inherit', cursor: 'pointer', textDecoration: 'none' }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Box minW="0" maxW="full" px="2">
                      <Text fontSize="lg" fontWeight="medium" color="fg" {...gridItemNameStyles}>{name}</Text>
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
              h="var(--arkivra-gridItemHeight, 14rem)"
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
            >
              {body}
            </Box>
          ) : (
            <Box
              position="relative"
              h="var(--arkivra-gridItemHeight, 14rem)"
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

  return (
    <ChakraDialog.Root open={open} onOpenChange={(event) => { if (!event.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'md' }}>
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
  const dialogTarget = target ?? closedMoveDialogTarget;

  return (
    <OpenMoveItemDialog
      open={open}
      target={dialogTarget}
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
  target: ItemDialogTarget;
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
  target: BrowserItem;
}

function OpenMoveItemDialog({
  open,
  target,
  value,
  destinations,
  isPending,
  isLoading,
  onValueChange,
  onClose,
  onSubmit,
}: OpenMoveItemDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const targetKey = getBrowserItemKey(target);

  useEffect(() => {
    setSearchQuery('');
  }, [targetKey]);

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

  const currentDestinationId = target.type === 'folder' ? target.folder.parentId : target.document.folderId;
  const selectedDestination = destinations.find(destination => destination.id === value) ?? destinations[0] ?? null;
  const canSubmitMove = !isLoading && !isPending && selectedDestination !== null && value === selectedDestination.id && value !== currentDestinationId;

  return (
    <ChakraDialog.Root open={open} onOpenChange={(event) => { if (!event.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'lg' }}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{`Move ${getItemName(target)}`}</ChakraDialog.Title>
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
                    onChange={(event) => setSearchQuery(event.target.value)}
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
                  borderColor="border.subtle"
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
                      itemContent={(_, destination) => {
                        if (destination === undefined) {
                          return null;
                        }

                        const isSelected = destination.id === value;
                        const isCurrent = destination.id === currentDestinationId;
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
                            borderBottomWidth="1px"
                            borderColor="border.subtle"
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
