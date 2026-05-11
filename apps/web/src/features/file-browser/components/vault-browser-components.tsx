import type { ComponentPropsWithoutRef, FormEvent, MouseEvent, Ref } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoGrid } from 'react-virtuoso';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, Portal, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, File, Folder, FolderOpen, Home, Search } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { SurfacePanel } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import {
  Breadcrumb,
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
import { getDocumentTypeLabel, getItemName } from './vault-browser.types';
import type { BrowserAction, BrowserContextItem, BrowserItem, ContextMenuState, InfoDialogTarget, ItemDialogTarget, MoveDestination } from './vault-browser.types';

const BROWSER_SCROLL_HEIGHT = 'clamp(24rem, calc(100vh - 18rem), 46rem)';
const LIST_ROW_HEIGHT = 72;

function VirtuosoGridList({ style, ref, ...props }: ComponentPropsWithoutRef<'div'> & { ref?: Ref<HTMLDivElement> }) {
  return (
    <Box
      ref={ref}
      {...props}
      style={style}
      display="grid"
      gridTemplateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }}
      gap="3"
      p="0.5"
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

function getItemKey(item: BrowserItem) {
  return item.type === 'folder' ? `folder-${item.folder.id}` : `document-${item.document.id}`;
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

function FileBrowserIcon({ item }: { item: BrowserItem }) {
  if (item.type === 'folder') {
    return (
      <Flex boxSize="10" shrink={0} align="center" justify="center" rounded="lg" bg="teal.subtle" color="teal.fg">
        <Folder size={20} />
      </Flex>
    );
  }

  const label = getDocumentTypeLabel({ name: item.document.name, mimeType: item.document.mimeType });

  return (
    <Flex boxSize="10" shrink={0} align="center" justify="center" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.subtle" color="fg">
      <Stack align="center" gap="0" lineHeight="none">
        <File size={14} />
        <Text as="span" fontSize="0.58rem" fontWeight="bold" letterSpacing="normal">
          {label}
        </Text>
      </Stack>
    </Flex>
  );
}

export function FolderBreadcrumbs({
  currentFolderId,
  breadcrumbs,
  onNavigateFolder,
  onOpenRootContextMenu,
}: {
  currentFolderId: string | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenRootContextMenu: (event: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {currentFolderId === null ? (
            <BreadcrumbPage display="inline-flex" alignItems="center" gap="1.5" onContextMenu={onOpenRootContextMenu}>
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
                  <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink as="button" type="button" onClick={() => onNavigateFolder(folder.id)}>
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
  onOpenFolder,
  getItemActions,
  onOpenContextMenu,
  isMutating,
}: {
  items: BrowserItem[];
  vaultId: string;
  onOpenFolder: (folderId: string) => void;
  getItemActions: (item: BrowserItem) => BrowserAction[];
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: BrowserItem) => void;
  isMutating?: boolean;
}) {
  return (
    <SurfacePanel overflow="hidden" p="0">
      <Grid
        display={{ base: 'none', md: 'grid' }}
        templateColumns="minmax(0, 1.4fr) 140px 132px 44px"
        gap="4"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        px="6"
        py="3"
        fontSize="sm"
        color="fg.muted"
      >
        <Text as="span">Name</Text>
        <Text as="span">Updated</Text>
        <Text as="span">Size</Text>
        <Text as="span" srOnly>Actions</Text>
      </Grid>

      <Box h={BROWSER_SCROLL_HEIGHT}>
        <Virtuoso
          data={items}
          fixedItemHeight={LIST_ROW_HEIGHT}
          computeItemKey={(_, item) => getItemKey(item)}
          initialItemCount={Math.min(items.length, 24)}
          style={{ height: '100%' }}
          itemContent={(_, item) => {
            const name = getItemName(item);
            const updatedAt = item.type === 'folder' ? item.folder.updatedAt : item.document.updatedAt;
            const actions = getItemActions(item);

            return (
              <Box
                h={`${LIST_ROW_HEIGHT}px`}
                borderBottomWidth="1px"
                borderColor="border.subtle"
                onContextMenu={(event) => onOpenContextMenu(event, item)}
              >
                {item.type === 'folder' ? (
                  <Grid
                    display="grid"
                    h="full"
                    w="full"
                    gridTemplateColumns={{ base: 'minmax(0, 1fr) auto', md: 'minmax(0, 1.4fr) 140px 132px 44px' }}
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
                      onClick={() => onOpenFolder(item.folder.id)}
                    >
                      <Flex minW="0" align="center" gap="3">
                        <FileBrowserIcon item={item} />
                        <Box minW="0">
                          <Text truncate fontWeight="semibold" color="fg">{name}</Text>
                          <Text display={{ md: 'none' }} mt="1" textStyle="xs" color="fg.muted">
                            Folder - Updated {formatDateOnly(updatedAt)}
                          </Text>
                        </Box>
                      </Flex>
                    </chakra.button>
                    <Text display={{ base: 'none', md: 'block' }} textStyle="sm">{formatDateOnly(updatedAt)}</Text>
                    <Text display={{ base: 'none', md: 'block' }} textStyle="sm" color="fg.muted">Folder</Text>
                    <BrowserItemActions item={item} actions={actions} disabled={isMutating} />
                  </Grid>
                ) : (
                  <Grid
                    h="full"
                    templateColumns={{ base: 'minmax(0, 1fr) auto', md: 'minmax(0, 1.4fr) 140px 132px 44px' }}
                    gap="4"
                    alignItems="center"
                    px="6"
                    transition="background-color 0.15s ease"
                    _hover={{ bg: 'bg.subtle' }}
                  >
                    <Link to={ROUTES.vaultDocument(vaultId, item.document.id)} style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
                      <Flex minW="0" align="center" gap="3">
                        <FileBrowserIcon item={item} />
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
                    <Link to={ROUTES.vaultDocument(vaultId, item.document.id)} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                      <Text display={{ base: 'none', md: 'block' }} textStyle="sm">{formatDateOnly(updatedAt)}</Text>
                    </Link>
                    <Link to={ROUTES.vaultDocument(vaultId, item.document.id)} style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
                      <Text display={{ base: 'none', md: 'block' }} textStyle="sm">{formatBytes(item.document.originalSize)}</Text>
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
    </SurfacePanel>
  );
}

export function BrowserItemGrid({
  items,
  vaultId,
  onOpenFolder,
  getItemActions,
  onOpenContextMenu,
  isMutating,
}: {
  items: BrowserItem[];
  vaultId: string;
  onOpenFolder: (folderId: string) => void;
  getItemActions: (item: BrowserItem) => BrowserAction[];
  onOpenContextMenu: (event: MouseEvent<HTMLElement>, item: BrowserItem) => void;
  isMutating?: boolean;
}) {
  return (
    <Box h={BROWSER_SCROLL_HEIGHT}>
      <VirtuosoGrid
        data={items}
        components={virtuosoGridComponents}
        computeItemKey={(_, item) => getItemKey(item)}
        initialItemCount={Math.min(items.length, 24)}
        style={{ height: '100%' }}
        itemContent={(_, item) => {
          const name = getItemName(item);
          const actions = getItemActions(item);
          const body = item.type === 'folder' ? (
            <SurfacePanel h="full" p="4" transition="background-color 0.15s ease, border-color 0.15s ease" _hover={{ bg: 'bg.subtle', borderColor: 'border' }}>
              <Stack minH="8.5rem" justify="space-between" gap="4">
                <Stack gap="3">
                  <Flex align="flex-start" justify="space-between" gap="3">
                    <FileBrowserIcon item={item} />
                    <BrowserItemActions
                      item={item}
                      actions={actions}
                      disabled={isMutating}
                    />
                  </Flex>
                  <Box minW="0">
                    <Text truncate fontWeight="semibold" color="fg">{name}</Text>
                    <Text mt="1" textStyle="xs" color="fg.muted">
                      Folder
                    </Text>
                  </Box>
                </Stack>
                <Text textStyle="xs" color="fg.muted">
                  Updated {formatDateOnly(item.folder.updatedAt)}
                </Text>
              </Stack>
            </SurfacePanel>
          ) : (
            <SurfacePanel h="full" p="4" transition="background-color 0.15s ease, border-color 0.15s ease" _hover={{ bg: 'bg.subtle', borderColor: 'border' }}>
              <Stack minH="8.5rem" justify="space-between" gap="4">
                <Stack gap="3">
                  <Flex align="flex-start" justify="space-between" gap="3">
                    <FileBrowserIcon item={item} />
                    <BrowserItemActions
                      item={item}
                      actions={actions}
                      disabled={isMutating}
                    />
                  </Flex>
                  <Link to={ROUTES.vaultDocument(vaultId, item.document.id)} style={{ color: 'inherit', textDecoration: 'none' }}>
                    <Box minW="0">
                      <Text truncate fontWeight="semibold" color="fg">{name}</Text>
                      <Text mt="1" textStyle="xs" color="fg.muted">
                        {`${formatBytes(item.document.originalSize)} - ${getDocumentTypeLabel({ name: item.document.name, mimeType: item.document.mimeType })}`}
                      </Text>
                    </Box>
                  </Link>
                </Stack>
                <Text textStyle="xs" color="fg.muted">
                  Updated {formatDateOnly(item.document.updatedAt)}
                </Text>
              </Stack>
            </SurfacePanel>
          );

          return item.type === 'folder' ? (
            <Box
              h="10rem"
              role="button"
              tabIndex={0}
              aria-label={`Open folder ${item.folder.name}`}
              textAlign="left"
              cursor="pointer"
              onClick={() => onOpenFolder(item.folder.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenFolder(item.folder.id);
                }
              }}
              onContextMenu={(event) => onOpenContextMenu(event, item)}
            >
              {body}
            </Box>
          ) : (
            <Box h="10rem" onContextMenu={(event) => onOpenContextMenu(event, item)}>
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
      key={getItemKey(target)}
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
                        const icon = destination.id === null ? <Home size={16} /> : <FolderOpen size={16} />;

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
