/* eslint-disable react-refresh/only-export-components */
import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from 'react';
import { forwardRef, useState } from 'react';
import { Box, Checkbox as ChakraCheckbox, Flex, Grid, Text, chakra } from '@chakra-ui/react';
import { Folder } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoGridProps } from 'react-virtuoso';
import { ROUTES } from '@/app/routes';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DocumentFileIconGlyph } from '@/features/documents/components/document-file-icon';
import { getDocumentFileIconMeta } from '@/features/documents/components/document-file-icon.utils';
import { formatBytes } from '@/features/documents/documents.utils';
import { formatShortDate } from '@/lib/localization';
import {
  getBrowserItemKey,
  getFileDisplayName,
  getItemDisplayName,
  getItemName,
} from './vault-browser.types';
import type { BrowserAction, BrowserDropTarget, BrowserItem } from './vault-browser.types';

const listRowHeights = {
  compact: 48,
  comfortable: 56,
  relaxed: 72,
} as const;

function formatDateOnly(value: string | null) {
  return formatShortDate(value);
}

export function getDropTargetStyles(dropTarget: BrowserDropTarget | null, folderId: string | null) {
  if (dropTarget === null || dropTarget.folderId !== folderId) {
    return {};
  }

  return dropTarget.state === 'valid' ? { bg: 'teal.subtle' } : { bg: 'red.subtle' };
}

const LIST_GRID_COLUMNS = 'minmax(0, 1fr) 6rem 8.5rem 2.75rem';
const SELECTABLE_LIST_GRID_COLUMNS = '2.5rem minmax(0, 1fr) 6rem 8.5rem 2.75rem';
const GRID_ITEM_WIDTH = '10.75rem';
const GRID_ITEM_GAP = '0.8rem';
export const GRID_ITEM_HEIGHT = '8rem';
export const GRID_ITEM_PADDING = '0.75rem';
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

export interface BrowserListColumn {
  key: string;
  label: ReactNode;
}

export interface BrowserListCell {
  key: string;
  content: ReactNode;
}

export const virtuosoGridComponents: VirtuosoGridProps<BrowserItem, unknown>['components'] = {
  // eslint-disable-next-line react/no-forward-ref -- react-virtuoso's documented grid adapter passes its measured list ref this way.
  List: forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
    ({ style, children, ...props }, ref) => (
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
    ),
  ),
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

export function FileBrowserIcon({
  item,
  size = 'grid',
}: {
  item: BrowserItem;
  size?: 'list' | 'grid' | 'search';
}) {
  const { density } = useAccentColor();
  const isList = size === 'list';
  const isSearch = size === 'search';
  const listIconSize =
    density === 'compact'
      ? {
          container: '7',
          documentBox: '5.5',
          documentIcon: 20,
          folderIcon: 18,
        }
      : density === 'relaxed'
        ? {
            container: '10',
            documentBox: '7',
            documentIcon: 26,
            folderIcon: 23,
          }
        : {
            container: '8',
            documentBox: '6',
            documentIcon: 22,
            folderIcon: 20,
          };
  const containerSize = isSearch ? '8' : isList ? listIconSize.container : '12';
  const documentBoxSize = isSearch ? '8' : isList ? listIconSize.documentBox : '9';
  const documentIconSize = isSearch ? 30 : isList ? listIconSize.documentIcon : 36;
  const folderIconSize = isSearch ? 24 : isList ? listIconSize.folderIcon : 34;

  if (item.type === 'folder') {
    return (
      <Flex boxSize={containerSize} shrink={0} align="center" justify="center" color="fg.muted">
        <Folder size={folderIconSize} strokeWidth={1.5} />
      </Flex>
    );
  }

  const meta = getDocumentFileIconMeta({
    name: item.document.name,
    mimeType: item.document.mimeType,
  });

  return (
    <Flex boxSize={containerSize} shrink={0} align="center" justify="center" color={meta.color}>
      <Box
        boxSize={documentBoxSize}
        color={meta.color}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <DocumentFileIconGlyph meta={meta} iconSize={documentIconSize} strokeWidth={1.5} />
      </Box>
    </Flex>
  );
}

export function getBrowserItemSurfaceStyles({
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

export function handleItemKeyboardSelection({
  event,
  item,
  onOpenItem,
  onSelectItem,
}: {
  event: KeyboardEvent<HTMLElement>;
  item: BrowserItem;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    item: BrowserItem,
  ) => void;
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

function truncateGridItemName(name: string) {
  if (name.length <= GRID_ITEM_NAME_MAX_LENGTH) {
    return name;
  }

  return `${name.slice(0, GRID_ITEM_NAME_MAX_LENGTH - 3).trimEnd()}...`;
}

export function SelectionCheckbox({
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

export function handleBrowserItemClick({
  event,
  item,
  onOpenItem,
  onSelectItem,
}: {
  event: MouseEvent<HTMLElement>;
  item: BrowserItem;
  onOpenItem: (item: BrowserItem) => void;
  onSelectItem: (
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    item: BrowserItem,
  ) => void;
}) {
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    onSelectItem(event, item);
    return;
  }

  onOpenItem(item);
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
  const availableActions = actions.filter((action) => !action.disabled);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ActionMenuTriggerButton
          label={`Open actions for ${getItemName(item)}`}
          disabled={disabled || availableActions.length === 0}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minW="48">
        <BrowserActionDropdownItems actions={availableActions} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BrowserActionDropdownItems({ actions }: { actions: BrowserAction[] }) {
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  return actions.map((action) => {
    const isActive = activeActionKey === action.key;
    const isDestructive = action.tone === 'destructive';
    const inactiveColor = isDestructive ? 'fg.error' : 'fg.muted';
    const activeColor = isDestructive ? 'fg.error' : 'teal.fg';

    return (
      <DropdownMenuItem
        key={action.key}
        value={action.key}
        data-active={isActive ? 'true' : undefined}
        borderWidth="1px"
        borderColor={isActive ? 'teal.muted' : 'transparent'}
        bg={isActive ? 'teal.subtle' : 'transparent'}
        color={isActive ? activeColor : inactiveColor}
        transition="background-color 120ms ease, border-color 120ms ease, color 120ms ease"
        _hover={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: activeColor }}
        _focus={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: activeColor }}
        _highlighted={{ bg: 'transparent', borderColor: 'transparent', color: inactiveColor }}
        onPointerEnter={() => setActiveActionKey(action.key)}
        onPointerMove={() => setActiveActionKey(action.key)}
        onPointerLeave={() =>
          setActiveActionKey((current) => (current === action.key ? null : current))
        }
        onFocus={() => setActiveActionKey(action.key)}
        onBlur={() => setActiveActionKey((current) => (current === action.key ? null : current))}
        onClick={(event) => event.stopPropagation()}
        onSelect={action.onSelect}
      >
        <ActionMenuItemIcon icon={action.icon} tone={isDestructive ? 'destructive' : 'default'} />
        {action.label}
      </DropdownMenuItem>
    );
  });
}

export function GridItemActions({
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
      <BrowserItemActions item={item} actions={actions} disabled={disabled} />
    </Box>
  );
}

function ListItemActions({
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
      className="browser-list-actions"
      opacity="0"
      pointerEvents="none"
      transform="translateY(-1px)"
      transition="opacity 120ms ease, transform 120ms ease"
      css={{
        '@media (hover: none)': {
          opacity: 1,
          pointerEvents: 'auto',
          transform: 'none',
        },
      }}
    >
      <BrowserItemActions item={item} actions={actions} disabled={disabled} />
    </Box>
  );
}

export function GridItemName({ density, name }: { density: string; name: string }) {
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
  hideActionsUntilHover = false,
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
  onSelectItem: (
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    item: BrowserItem,
  ) => void;
  onToggleAllItems?: (checked: boolean) => void;
  onToggleItem?: (item: BrowserItem, checked: boolean) => void;
  getItemActions: (item: BrowserItem) => BrowserAction[];
  getDocumentLink?: (document: Extract<BrowserItem, { type: 'document' }>['document']) => string;
  listGridColumns?: string;
  listColumns?: BrowserListColumn[];
  renderDocumentListMetadata?: (
    item: Extract<BrowserItem, { type: 'document' }>,
  ) => BrowserListCell[];
  hideActionsUntilHover?: boolean;
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
  const resolvedListGridColumns =
    listGridColumns ?? (selectable ? SELECTABLE_LIST_GRID_COLUMNS : LIST_GRID_COLUMNS);
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
          <Text key={column.key} as="span">
            {column.label}
          </Text>
        ))}
        <Text as="span" srOnly>
          Actions
        </Text>
      </Grid>

      <Box flex="1" minH="0" overflow="hidden">
        <Virtuoso
          data={items}
          fixedItemHeight={listRowHeight}
          computeItemKey={(index, item) => (item ? getBrowserItemKey(item) : `__item_${index}`)}
          initialItemCount={Math.min(items.length, 24)}
          style={{ height: '100%' }}
          itemContent={(index, item) => {
            if (item === undefined) {
              return null;
            }

            const name = getItemName(item);
            const displayName = getItemDisplayName(item);
            const updatedAt =
              item.type === 'folder' ? item.folder.updatedAt : item.document.updatedAt;
            const actions = getItemActions(item);
            const itemKey = getBrowserItemKey(item);
            const isSelected = selectedItemKeys.has(itemKey);
            const isContextTarget = contextItemKey === itemKey;
            const isDragSource = draggedItemKeys.has(itemKey);
            const itemSurfaceStyles = getBrowserItemSurfaceStyles({
              isSelected,
              isDragSource,
              isContextTarget,
            });
            const folderDropStyles =
              item.type === 'folder' ? getDropTargetStyles(dropTarget, item.folder.id) : {};
            const documentLink =
              item.type === 'document'
                ? (getDocumentLink?.(item.document) ??
                  ROUTES.vaultDocument(vaultId, item.document.id))
                : null;
            const documentMetadataCells =
              item.type === 'document'
                ? (renderDocumentListMetadata?.(item) ?? [
                    { key: 'size', content: formatBytes(item.document.originalSize) },
                    { key: 'modified', content: formatDateOnly(updatedAt) },
                  ])
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
                _focusVisible={{
                  outline: '2px solid',
                  outlineColor: 'teal.solid',
                  outlineOffset: '-2px',
                }}
                onClick={(event) =>
                  handleBrowserItemClick({ event, item, onOpenItem, onSelectItem })
                }
                onKeyDown={(event) =>
                  handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })
                }
                onDragStart={isDraggable ? (event) => onDragStartItem(event, item) : undefined}
                onDragEnd={isDraggable ? onDragEndItem : undefined}
                onDragOver={
                  isDraggable && item.type === 'folder'
                    ? (event) => onDragOverFolder(event, item.folder.id)
                    : undefined
                }
                onDragLeave={
                  isDraggable && item.type === 'folder'
                    ? (event) => onDragLeaveFolder(event, item.folder.id)
                    : undefined
                }
                onDrop={
                  isDraggable && item.type === 'folder'
                    ? (event) => onDropOnFolder(event, item.folder.id)
                    : undefined
                }
                onContextMenu={(event) => onOpenContextMenu(event, item)}
                css={
                  hideActionsUntilHover
                    ? {
                        '&:hover .browser-list-actions, &:focus-within .browser-list-actions': {
                          opacity: 1,
                          pointerEvents: 'auto',
                          transform: 'none',
                        },
                      }
                    : undefined
                }
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
                          <Text truncate fontWeight="normal" color="fg">
                            {displayName}
                          </Text>
                          <Text display={{ md: 'none' }} mt="1" textStyle="xs" color="fg.muted">
                            Folder - Updated {formatDateOnly(updatedAt)}
                          </Text>
                        </Box>
                      </Flex>
                    </chakra.button>
                    <Text display={{ base: 'none', md: 'block' }} textStyle="sm" color="fg.muted">
                      Folder
                    </Text>
                    <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm">
                      {formatDateOnly(updatedAt)}
                    </Text>
                    {hideActionsUntilHover ? (
                      <ListItemActions item={item} actions={actions} disabled={isMutating} />
                    ) : (
                      <BrowserItemActions item={item} actions={actions} disabled={isMutating} />
                    )}
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
                      style={{
                        minWidth: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        textDecoration: 'none',
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Flex minW="0" align="center" gap="3">
                        <FileBrowserIcon item={item} size="list" />
                        <Box minW="0">
                          <Text truncate fontWeight="normal" color="fg">
                            {displayName}
                          </Text>
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
                        style={{
                          display: 'block',
                          minWidth: 0,
                          color: 'inherit',
                          cursor: 'pointer',
                          textDecoration: 'none',
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm">
                          {cell.content}
                        </Text>
                      </Link>
                    ))}
                    {hideActionsUntilHover ? (
                      <ListItemActions item={item} actions={actions} disabled={isMutating} />
                    ) : (
                      <BrowserItemActions item={item} actions={actions} disabled={isMutating} />
                    )}
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
