import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Box, Stack, chakra } from '@chakra-ui/react';
import { Link } from '@tanstack/react-router';
import { VirtuosoGrid } from 'react-virtuoso';
import { ROUTES } from '@/app/routes';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { getBrowserItemKey, getItemDisplayName, getItemName } from './vault-browser.types';
import type { BrowserAction, BrowserDropTarget, BrowserItem } from './vault-browser.types';
import {
  FileBrowserIcon,
  GRID_ITEM_HEIGHT,
  GRID_ITEM_PADDING,
  GridItemActions,
  GridItemName,
  SelectionCheckbox,
  getBrowserItemSurfaceStyles,
  getDropTargetStyles,
  handleBrowserItemClick,
  handleItemKeyboardSelection,
  virtuosoGridComponents,
} from './vault-browser-items';

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
  onSelectItem: (
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    item: BrowserItem,
  ) => void;
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
      pt={{ base: '3', lg: '4' }}
      onContextMenu={onOpenBackgroundContextMenu}
    >
      <VirtuosoGrid
        data={items}
        components={virtuosoGridComponents}
        computeItemKey={(index, item) => (item ? getBrowserItemKey(item) : `__item_${index}`)}
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
            contextBg: 'bg.cardHover',
            contextBorderColor: 'border.strong',
          });
          const folderDropStyles =
            item.type === 'folder' ? getDropTargetStyles(dropTarget, item.folder.id) : {};
          const documentLink =
            item.type === 'document'
              ? (getDocumentLink?.(item.document) ??
                ROUTES.vaultDocument(vaultId, item.document.id))
              : null;
          const body =
            item.type === 'folder' ? (
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
                  bg: isSelected && !isContextTarget ? 'teal.subtle' : 'bg.cardHover',
                  borderColor: isSelected && !isContextTarget ? 'teal.muted' : 'border.strong',
                }}
                {...itemSurfaceStyles}
                {...folderDropStyles}
              >
                <Stack
                  align="center"
                  justify="center"
                  gap="2.5"
                  w="full"
                  h="full"
                  textAlign="center"
                >
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
                  bg: isSelected && !isContextTarget ? 'teal.subtle' : 'bg.cardHover',
                  borderColor: isSelected && !isContextTarget ? 'teal.muted' : 'border.strong',
                }}
                {...itemSurfaceStyles}
              >
                <Stack
                  align="center"
                  justify="center"
                  gap="2.5"
                  w="full"
                  h="full"
                  textAlign="center"
                >
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
                    <Stack align="center" gap="0.5" w="full" minW="0">
                      <Link
                        to={documentLink ?? ROUTES.vaultDocument(vaultId, item.document.id)}
                        style={{
                          display: 'block',
                          width: '100%',
                          maxWidth: '100%',
                          minWidth: 0,
                          color: 'inherit',
                          cursor: 'pointer',
                          textDecoration: 'none',
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Box w="full" minW="0" maxW="full" px="1">
                          <GridItemName name={displayName} density={density} />
                        </Box>
                      </Link>
                      {renderDocumentGridMeta?.(item)}
                    </Stack>
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
              onKeyDown={(event) =>
                handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })
              }
              onDragStart={isDraggable ? (event) => onDragStartItem(event, item) : undefined}
              onDragEnd={isDraggable ? onDragEndItem : undefined}
              onDragOver={
                isDraggable ? (event) => onDragOverFolder(event, item.folder.id) : undefined
              }
              onDragLeave={
                isDraggable ? (event) => onDragLeaveFolder(event, item.folder.id) : undefined
              }
              onDrop={isDraggable ? (event) => onDropOnFolder(event, item.folder.id) : undefined}
              onContextMenu={(event) => onOpenContextMenu(event, item)}
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'teal.solid',
                outlineOffset: '2px',
              }}
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
              onKeyDown={(event) =>
                handleItemKeyboardSelection({ event, item, onOpenItem, onSelectItem })
              }
              onDragStart={isDraggable ? (event) => onDragStartItem(event, item) : undefined}
              onDragEnd={isDraggable ? onDragEndItem : undefined}
              onContextMenu={(event) => onOpenContextMenu(event, item)}
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'teal.solid',
                outlineOffset: '2px',
              }}
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
