import type { ComponentPropsWithoutRef, DragEvent, FormEvent, KeyboardEvent, MouseEvent, Ref } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, File, FileText, FileType, Folder, Home, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
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
import { formatBytes } from '@/features/documents/documents.utils';
import { getBrowserItemKey, getDocumentTypeLabel, getItemName } from './vault-browser.types';
import type { BrowserAction, BrowserContextItem, BrowserDropTarget, BrowserItem, ContextMenuState, InfoDialogTarget, ItemDialogTarget, MoveDestination } from './vault-browser.types';

const BROWSER_SCROLL_HEIGHT = '100%';
const LIST_ROW_HEIGHT = 72;
const BREADCRUMB_LABEL_MAX_LENGTH = 10;
const LIST_GRID_COLUMNS = 'minmax(0, 1fr) 6rem 8.5rem 2.75rem';
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

function VirtuosoGridList({ style, ref, ...props }: ComponentPropsWithoutRef<'div'> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <Box
      ref={ref}
      {...props}
      style={{ ...style, paddingTop: '1rem' }}
      display="grid"
      gridTemplateColumns="repeat(auto-fill, minmax(13.5rem, 13.5rem))"
      gap="8"
      alignContent="start"
      px={{ base: '4', lg: '6' }}
      pb="4"
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

  return item.type === 'folder' ? item.folder.id : item.document.id;
}

function getItemKindLabel(item: BrowserContextItem) {
  if (item.type === 'root') {
    return 'Folder';
  }

  return item.type === 'folder' ? 'Folder' : getDocumentTypeLabel({ name: item.document.name, mimeType: item.document.mimeType });
}

function getDocumentIconMeta({ name, mimeType }: { name: string; mimeType: string }): {
  badgeBg: string;
  badgeColor: string;
  color: string;
  icon: LucideIcon;
  label: string;
} {
  const extension = name.split('.').pop()?.trim().toLowerCase();
  const neutralMeta = {
    badgeBg: 'teal.subtle',
    badgeColor: 'teal.fg',
    color: 'teal.fg',
  };

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return { ...neutralMeta, icon: FileText, label: 'PDF' };
  }

  if (
    extension === 'doc'
    || extension === 'docx'
    || mimeType.includes('word')
    || mimeType.includes('officedocument.wordprocessingml')
  ) {
    return { ...neutralMeta, icon: FileType, label: extension === 'doc' ? 'DOC' : 'DOCX' };
  }

  if (extension === 'txt' || extension === 'md' || mimeType.startsWith('text/')) {
    return { ...neutralMeta, icon: FileText, label: extension === 'md' ? 'MD' : 'TXT' };
  }

  return {
    ...neutralMeta,
    icon: File,
    label: getDocumentTypeLabel({ name, mimeType }),
  };
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

  const { badgeBg, badgeColor, color, icon: DocumentIcon, label } = getDocumentIconMeta({
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
}: {
  isSelected: boolean;
  isDragSource: boolean;
}) {
  return {
    backgroundColor: isSelected ? 'var(--chakra-colors-teal-subtle)' : undefined,
    opacity: isDragSource ? 0.65 : 1,
  };
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
  draggedItemKeys,
  dropTarget,
  onOpenItem,
  onSelectItem,
  getItemActions,
  onDragStartItem,
  onDragEndItem,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
  onOpenContextMenu,
  isMutating,
}: {
  items: BrowserItem[];
  vaultId: string;
  selectedItemKeys: Set<string>;
  draggedItemKeys: Set<string>;
  dropTarget: BrowserDropTarget | null;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, item: BrowserItem) => void;
  getItemActions: (item: BrowserItem) => BrowserAction[];
  onDragStartItem: (event: DragEvent<HTMLElement>, item: BrowserItem) => void;
  onDragEndItem: () => void;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: BrowserItem) => void;
  isMutating?: boolean;
}) {
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
    >
      <Grid
        display={{ base: 'none', md: 'grid' }}
        templateColumns={LIST_GRID_COLUMNS}
        gap="4"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        px="6"
        py="3"
        fontSize="sm"
        color="fg.muted"
      >
        <Text as="span">Name</Text>
        <Text as="span">Size</Text>
        <Text as="span">Modified</Text>
        <Text as="span" srOnly>Actions</Text>
      </Grid>

      <Box h={BROWSER_SCROLL_HEIGHT}>
        <Virtuoso
          data={items}
          fixedItemHeight={LIST_ROW_HEIGHT}
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
            const isDragSource = draggedItemKeys.has(itemKey);
            const itemSurfaceStyles = getBrowserItemSurfaceStyles({ isSelected, isDragSource });
            const folderDropStyles = item.type === 'folder' ? getDropTargetStyles(dropTarget, item.folder.id) : {};

            return (
              <Box
                role="option"
                aria-selected={isSelected}
                aria-label={name}
                tabIndex={0}
                draggable={!isMutating}
                h={`${LIST_ROW_HEIGHT}px`}
                borderBottomWidth="1px"
                borderColor="border.subtle"
                cursor="default"
                outline="none"
                {...itemSurfaceStyles}
                {...folderDropStyles}
                _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '-2px' }}
                onClick={(event) => handleBrowserItemClick({ event, item, onOpenItem, onSelectItem })}
                onKeyDown={(event) => handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })}
                onDragStart={(event) => onDragStartItem(event, item)}
                onDragEnd={onDragEndItem}
                onDragOver={item.type === 'folder' ? (event) => onDragOverFolder(event, item.folder.id) : undefined}
                onDragLeave={item.type === 'folder' ? (event) => onDragLeaveFolder(event, item.folder.id) : undefined}
                onDrop={item.type === 'folder' ? (event) => onDropOnFolder(event, item.folder.id) : undefined}
                onContextMenu={(event) => onOpenContextMenu(event, item)}
              >
                {item.type === 'folder' ? (
                  <Grid
                    display="grid"
                    h="full"
                    w="full"
                    gridTemplateColumns={{ base: 'minmax(0, 1fr) auto', md: LIST_GRID_COLUMNS }}
                    gap="4"
                    alignItems="center"
                    px="6"
                    textAlign="left"
                    transition="background-color 0.15s ease"
                    _hover={{ bg: 'bg.subtle' }}
                  >
                    <chakra.button
                      type="button"
                      minW="0"
                      textAlign="left"
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
                    templateColumns={{ base: 'minmax(0, 1fr) auto', md: LIST_GRID_COLUMNS }}
                    gap="4"
                    alignItems="center"
                    px="6"
                    transition="background-color 0.15s ease"
                    _hover={{ bg: 'bg.subtle' }}
                  >
                    <Link
                      to={ROUTES.vaultDocument(vaultId, item.document.id)}
                      style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}
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
                    <Link
                      to={ROUTES.vaultDocument(vaultId, item.document.id)}
                      style={{ display: 'block', minWidth: 0, color: 'inherit', textDecoration: 'none' }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm">{formatBytes(item.document.originalSize)}</Text>
                    </Link>
                    <Link
                      to={ROUTES.vaultDocument(vaultId, item.document.id)}
                      style={{ display: 'block', minWidth: 0, color: 'inherit', textDecoration: 'none' }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm">{formatDateOnly(updatedAt)}</Text>
                    </Link>
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
  draggedItemKeys,
  dropTarget,
  onOpenItem,
  onSelectItem,
  getItemActions,
  onDragStartItem,
  onDragEndItem,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
  onOpenContextMenu,
  isMutating,
}: {
  items: BrowserItem[];
  vaultId: string;
  selectedItemKeys: Set<string>;
  draggedItemKeys: Set<string>;
  dropTarget: BrowserDropTarget | null;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>, item: BrowserItem) => void;
  getItemActions: (item: BrowserItem) => BrowserAction[];
  onDragStartItem: (event: DragEvent<HTMLElement>, item: BrowserItem) => void;
  onDragEndItem: () => void;
  onDragOverFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDragLeaveFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onDropOnFolder: (event: DragEvent<HTMLElement>, folderId: string | null) => void;
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: BrowserItem) => void;
  isMutating?: boolean;
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
          const isDragSource = draggedItemKeys.has(itemKey);
          const itemSurfaceStyles = getBrowserItemSurfaceStyles({ isSelected, isDragSource });
          const folderDropStyles = item.type === 'folder' ? getDropTargetStyles(dropTarget, item.folder.id) : {};
          const body = item.type === 'folder' ? (
            <Box
              h="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
              p="5"
              rounded="md"
              borderWidth="1px"
              borderColor="border.subtle"
              bg="bg.workspace"
              transition="background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease"
              _hover={{ bg: isSelected ? 'teal.subtle' : 'bg.workspaceMuted', borderColor: isSelected ? 'teal.muted' : 'border.strong' }}
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
                <Stack align="center" gap="4" w="full" minW="0">
                  <FileBrowserIcon item={item} />
                  <chakra.button
                    type="button"
                    minW="0"
                    textAlign="center"
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
              p="5"
              rounded="md"
              borderWidth="1px"
              borderColor="border.subtle"
              bg="bg.workspace"
              transition="background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease"
              _hover={{ bg: isSelected ? 'teal.subtle' : 'bg.workspaceMuted', borderColor: isSelected ? 'teal.muted' : 'border.strong' }}
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
                <Stack align="center" gap="4" w="full" minW="0">
                  <FileBrowserIcon item={item} />
                  <Link
                    to={ROUTES.vaultDocument(vaultId, item.document.id)}
                    style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Box minW="0" maxW="full" px="2">
                      <Text fontSize="lg" fontWeight="medium" color="fg" {...gridItemNameStyles}>{name}</Text>
                    </Box>
                  </Link>
                </Stack>
              </Stack>
            </Box>
          );

          return item.type === 'folder' ? (
            <Box
              position="relative"
              h="14rem"
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              aria-label={item.folder.name}
              draggable={!isMutating}
              textAlign="left"
              cursor="default"
              outline="none"
              onClick={(event) => handleBrowserItemClick({ event, item, onOpenItem, onSelectItem })}
              onKeyDown={(event) => handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })}
              onDragStart={(event) => onDragStartItem(event, item)}
              onDragEnd={onDragEndItem}
              onDragOver={(event) => onDragOverFolder(event, item.folder.id)}
              onDragLeave={(event) => onDragLeaveFolder(event, item.folder.id)}
              onDrop={(event) => onDropOnFolder(event, item.folder.id)}
              onContextMenu={(event) => onOpenContextMenu(event, item)}
              _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '2px' }}
            >
              {body}
            </Box>
          ) : (
            <Box
              position="relative"
              h="14rem"
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              aria-label={item.document.name}
              draggable={!isMutating}
              cursor="default"
              outline="none"
              onClick={(event) => handleBrowserItemClick({ event, item, onOpenItem, onSelectItem })}
              onKeyDown={(event) => handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })}
              onDragStart={(event) => onDragStartItem(event, item)}
              onDragEnd={onDragEndItem}
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

export function RenameItemDialog({
  target,
  value,
  isPending,
  onValueChange,
  onClose,
  onSubmit,
}: {
  target: ItemDialogTarget;
  value: string;
  isPending: boolean;
  onValueChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (target === null) {
    return null;
  }

  return (
    <ChakraDialog.Root open onOpenChange={(event) => { if (!event.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'md' }}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{`Rename ${target.type}`}</ChakraDialog.Title>
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
  target,
  value,
  destinations,
  isPending,
  isLoading,
  onValueChange,
  onClose,
  onSubmit,
}: MoveItemDialogProps) {
  if (target === null) {
    return null;
  }

  return (
    <OpenMoveItemDialog
      key={getBrowserItemKey(target)}
      target={target}
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
  target: BrowserItem;
}

function OpenMoveItemDialog({
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
    <ChakraDialog.Root open onOpenChange={(event) => { if (!event.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'lg' }}>
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
  target,
  folderPath,
  onClose,
}: {
  target: InfoDialogTarget;
  folderPath: string;
  onClose: () => void;
}) {
  if (target === null) {
    return null;
  }

  return (
    <ChakraDialog.Root open onOpenChange={(event) => { if (!event.open) onClose(); }} size={{ mdDown: 'full', md: 'md' }}>
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
                <InfoRow label="Name" value={getItemName(target)} />
                <InfoRow label="Type" value={getItemKindLabel(target)} />
                {target.type !== 'root' ? <InfoRow label="Location" value={folderPath} /> : null}
                {target.type === 'document' ? (
                  <>
                    <InfoRow label="Size" value={formatBytes(target.document.originalSize)} />
                    <InfoRow label="Original file" value={target.document.originalName} />
                    <InfoRow label="MIME type" value={target.document.mimeType} />
                  </>
                ) : null}
                {target.type !== 'root' ? (
                  <>
                    <InfoRow label="Created" value={formatDateOnly(target.type === 'folder' ? target.folder.createdAt : target.document.createdAt)} />
                    <InfoRow label="Updated" value={formatDateOnly(target.type === 'folder' ? target.folder.updatedAt : target.document.updatedAt)} />
                  </>
                ) : null}
                <InfoRow label={target.type === 'root' ? 'Vault ID' : 'ID'} value={getItemId(target)} />
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
