import type { FormEvent, MouseEvent } from 'react';
import { Fragment, useEffect, useRef } from 'react';
import { Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, Portal, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import { File, Folder, Home } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatBytes } from '@/features/documents/documents.utils';
import { getDocumentTypeLabel, getItemName } from './vault-browser.types';
import type { BrowserAction, BrowserContextItem, BrowserItem, ContextMenuState, InfoDialogTarget, ItemDialogTarget } from './vault-browser.types';

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

      {items.map((item) => {
        const name = getItemName(item);
        const updatedAt = item.type === 'folder' ? item.folder.updatedAt : item.document.updatedAt;
        const actions = getItemActions(item);

        return (
          <Box
            key={getItemKey(item)}
            borderBottomWidth="1px"
            borderColor="border.subtle"
            _last={{ borderBottomWidth: 0 }}
            onContextMenu={(event) => onOpenContextMenu(event, item)}
          >
            {item.type === 'folder' ? (
              <Grid
                display="grid"
                w="full"
                gridTemplateColumns={{ base: 'minmax(0, 1fr) auto', md: 'minmax(0, 1.4fr) 140px 132px 44px' }}
                gap="4"
                alignItems="center"
                px="6"
                py="3.5"
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
                templateColumns={{ base: 'minmax(0, 1fr) auto', md: 'minmax(0, 1.4fr) 140px 132px 44px' }}
                gap="4"
                alignItems="center"
                px="6"
                py="3.5"
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
      })}
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
    <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} gap="3">
      {items.map((item) => {
        const name = getItemName(item);
        const key = getItemKey(item);
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
            key={key}
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
          <Box key={key} onContextMenu={(event) => onOpenContextMenu(event, item)}>
            {body}
          </Box>
        );
      })}
    </SimpleGrid>
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
}: {
  target: ItemDialogTarget;
  value: string | null;
  destinations: Array<{ id: string | null; label: string }>;
  isPending: boolean;
  isLoading: boolean;
  onValueChange: (value: string | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (target === null) {
    return null;
  }

  const currentDestinationId = target.type === 'folder' ? target.folder.parentId : target.document.folderId;

  return (
    <ChakraDialog.Root open onOpenChange={(event) => { if (!event.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'md' }}>
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
                <chakra.label htmlFor="move-item-destination" fontSize="sm" fontWeight="medium" color="fg">
                  Destination
                </chakra.label>
                <Select
                  value={value ?? '__root__'}
                  onValueChange={(nextValue) => onValueChange(nextValue === '__root__' ? null : nextValue)}
                >
                  <SelectTrigger id="move-item-destination" aria-label="Destination" disabled={isLoading || isPending}>
                    <SelectValue placeholder="Choose a folder" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.map((destination) => (
                      <SelectItem key={destination.id ?? '__root__'} value={destination.id ?? '__root__'}>
                        {destination.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                disabled={isLoading || isPending || value === currentDestinationId}
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
