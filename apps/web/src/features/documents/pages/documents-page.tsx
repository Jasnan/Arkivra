import type { FormEvent, MouseEvent } from 'react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActionBar, Box, CloseButton, Dialog as ChakraDialog, Flex, Grid, HStack, Portal, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import { Download, Eye, File, Folder, FolderPlus, Grid3X3, Home, Info, List, MoveRight, Pencil, Tags, Trash2, Upload } from 'lucide-react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import {
  EmptyState,
  PageIntro,
  SurfacePanel,
} from '@/components/layout/vault-ui';
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
import { getDocumentDownloadUrl, moveDocument, renameDocument, softDeleteDocument } from '@/features/documents/documents.api';
import { formatBytes } from '@/features/documents/documents.utils';
import {
  DocumentLibraryTable,
  getDocumentSelectionKey,
} from '@/features/documents/components/document-library-list';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import {
  DocumentSearchControls,
} from '@/features/documents/components/document-search-controls';
import { documentQueryKeys, useDocumentsQuery } from '@/features/documents/documents.queries';
import type { DocumentSummary } from '@/features/documents/documents.types';
import { createFolder, moveFolder, renameFolder, softDeleteFolder } from '@/features/file-browser/file-browser.api';
import { fileBrowserQueryKeys, useFolderItemsQuery, useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import type { FolderSummary, FolderTreeEntry } from '@/features/file-browser/file-browser.types';
import { searchQueryKeys, useVaultSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchSortBy } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';
import { useVaultQuery } from '@/features/vaults/vaults.queries';
import type { VaultMemberPermission } from '@/features/vaults/vaults.types';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 8;
const FILE_BROWSER_VIEW_STORAGE_KEY = 'arkivra:file-browser:view';
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest upload' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
];

type FileBrowserView = 'list' | 'grid';
interface BrowserDocumentItem {
  type: 'document';
  document: DocumentSummary;
}
interface BrowserFolderItem {
  type: 'folder';
  folder: FolderSummary;
}
interface BrowserRootItem {
  type: 'root';
  vaultId: string;
}
type BrowserItem = BrowserFolderItem | BrowserDocumentItem;
type BrowserContextItem = BrowserItem | BrowserRootItem;
type BrowserActionTone = 'default' | 'destructive';
type BrowserAction = {
  key: string;
  label: string;
  icon: typeof Eye;
  tone?: BrowserActionTone;
  disabled?: boolean;
  onSelect: () => void;
};
type ItemDialogTarget = BrowserItem | null;
type InfoDialogTarget = BrowserContextItem | null;
type ContextMenuState = {
  item: BrowserContextItem;
  x: number;
  y: number;
} | null;

function getInitialBrowserView(): FileBrowserView {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return 'list';
  }

  try {
    return window.localStorage.getItem(FILE_BROWSER_VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function getDocumentTypeLabel({ name, mimeType }: { name: string; mimeType: string }) {
  const extension = name.split('.').pop()?.trim().toUpperCase();

  if (extension && extension.length <= 5) {
    return extension;
  }

  if (mimeType === 'application/pdf') {
    return 'PDF';
  }

  if (mimeType.startsWith('image/')) {
    return 'IMG';
  }

  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return 'XLS';
  }

  if (mimeType.includes('word') || mimeType.includes('document')) {
    return 'DOC';
  }

  if (mimeType.startsWith('text/')) {
    return 'TXT';
  }

  return 'FILE';
}

function getItemName(item: BrowserContextItem) {
  if (item.type === 'root') {
    return 'Vault root';
  }

  return item.type === 'folder' ? item.folder.name : item.document.name;
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

function FolderBreadcrumbs({
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

function BrowserContextMenu({
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

function BrowserItemList({
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
                        Folder • Updated {formatDateOnly(updatedAt)}
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

function BrowserItemGrid({
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
                      {`${formatBytes(item.document.originalSize)} • ${getDocumentTypeLabel({ name: item.document.name, mimeType: item.document.mimeType })}`}
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

function hasVaultPermission({
  vault,
  permission,
}: {
  vault: { role: 'owner' | 'member' | null; permissions: VaultMemberPermission[]; isGlobalAdmin: boolean } | null | undefined;
  permission: VaultMemberPermission;
}) {
  return Boolean(
    vault?.isGlobalAdmin
    || vault?.role === 'owner'
    || vault?.permissions.includes(permission),
  );
}

function isFolderDescendant({
  folders,
  folderId,
  candidateId,
}: {
  folders: FolderTreeEntry[];
  folderId: string;
  candidateId: string;
}) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  let current = byId.get(candidateId) ?? null;
  const seen = new Set<string>();

  while (current !== null) {
    if (current.id === folderId) {
      return true;
    }

    if (current.parentId === null || seen.has(current.id)) {
      return false;
    }

    seen.add(current.id);
    current = byId.get(current.parentId) ?? null;
  }

  return false;
}

function getMoveDestinations({
  folders,
  target,
}: {
  folders: FolderTreeEntry[];
  target: ItemDialogTarget;
}) {
  const allowedFolders = target?.type === 'folder'
    ? folders.filter(folder =>
        folder.id !== target.folder.id
        && !isFolderDescendant({ folders, folderId: target.folder.id, candidateId: folder.id }),
      )
    : folders;

  return [
    { id: null, label: 'Vault root' },
    ...allowedFolders.map(folder => ({
      id: folder.id,
      label: folder.path,
    })),
  ];
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <Grid templateColumns="8rem minmax(0, 1fr)" gap="4" alignItems="start">
      <Text fontSize="sm" color="fg.muted">{label}</Text>
      <Text minW="0" fontSize="sm" color="fg" wordBreak="break-word">{value}</Text>
    </Grid>
  );
}

function RenameItemDialog({
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

function MoveItemDialog({
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

function ItemInfoDialog({
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

function toInputDateValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildPresetRange(preset: Exclude<DatePreset, 'custom'>) {
  const today = new Date();
  const dateTo = toInputDateValue(today);

  if (preset === 'any') {
    return { dateFrom: undefined, dateTo: undefined };
  }

  const start = new Date(today);
  start.setDate(start.getDate() - (preset === 'last_7_days' ? 6 : 29));

  return {
    dateFrom: toInputDateValue(start),
    dateTo,
  };
}

function formatDateRangeLabel(dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) {
    return 'Any time';
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const fromLabel = dateFrom ? formatter.format(new Date(`${dateFrom}T00:00:00`)) : 'Start';
  const toLabel = dateTo ? formatter.format(new Date(`${dateTo}T00:00:00`)) : 'Now';

  return `${fromLabel} - ${toLabel}`;
}

function getDateFilterLabel({
  preset,
  dateFrom,
  dateTo,
}: {
  preset: DatePreset;
  dateFrom?: string;
  dateTo?: string;
}) {
  if (preset === 'last_7_days') {
    return 'Last 7 days';
  }

  if (preset === 'last_30_days') {
    return 'Last 30 days';
  }

  if (preset === 'custom') {
    return formatDateRangeLabel(dateFrom, dateTo);
  }

  return 'Any time';
}

export function DocumentsPage() {
  const params = useParams({ strict: false }) as { vaultId?: string };
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const vaultId = params.vaultId ?? '';
  const currentFolderId = search.folderId ?? null;
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SearchSortBy>('created_desc');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedDocumentKeys, setSelectedDocumentKeys] = useState<string[]>([]);
  const [browserView, setBrowserView] = useState<FileBrowserView>(getInitialBrowserView);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<ItemDialogTarget>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<ItemDialogTarget>(null);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null);
  const [infoTarget, setInfoTarget] = useState<InfoDialogTarget>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const debouncedSearchText = useDebouncedValue(searchText.trim(), 280);
  const appliedDateRange = useMemo(() => {
    if (datePreset === 'custom') {
      return {
        dateFrom: customDateFrom || undefined,
        dateTo: customDateTo || undefined,
      };
    }

    return buildPresetRange(datePreset);
  }, [customDateFrom, customDateTo, datePreset]);

  const folderItemsQuery = useFolderItemsQuery({
    vaultId,
    folderId: currentFolderId,
    enabled: debouncedSearchText.length === 0,
  });
  const folderTreeQuery = useFolderTreeQuery({
    vaultId,
    enabled: moveTarget !== null || infoTarget?.type === 'folder' || (infoTarget?.type === 'document' && infoTarget.document.folderId !== null),
  });
  const vaultQuery = useVaultQuery({ vaultId });
  const documentsQuery = useDocumentsQuery({
    vaultId,
    tagId: selectedTagId || undefined,
    sortBy,
    folderId: currentFolderId,
    enabled: debouncedSearchText.length === 0,
  });
  const tagsQuery = useTagsQuery({ vaultId });
  const searchQuery = useVaultSearchDocumentsQuery({
    vaultId,
    query: debouncedSearchText,
    pageIndex,
    pageSize: PAGE_SIZE,
    tagId: selectedTagId || undefined,
    dateFrom: appliedDateRange.dateFrom,
    dateTo: appliedDateRange.dateTo,
    sortBy,
    enabled: debouncedSearchText.length > 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (documents: Array<{ vaultId: string; documentId: string }>) =>
      Promise.all(documents.map((document) => softDeleteDocument(document))),
    onSuccess: async (_data, documents) => {
      toast.success(
        documents.length === 1
          ? 'Document moved to trash.'
          : `${documents.length} documents moved to trash.`,
      );
      const deletedKeys = new Set(
        documents.map((document) => getDocumentSelectionKey(document.vaultId, document.documentId)),
      );
      setSelectedDocumentKeys((current) => current.filter((key) => !deletedKeys.has(key)));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });
  const createFolderMutation = useMutation({
    mutationFn: () => createFolder({
      vaultId,
      parentId: createFolderParentId,
      name: folderName,
    }),
    onSuccess: async () => {
      toast.success('Folder created.');
      setFolderName('');
      setCreateFolderParentId(null);
      setIsCreateFolderOpen(false);
      await queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create folder.');
    },
  });
  const renameMutation = useMutation({
    mutationFn: async ({ target, name }: { target: BrowserItem; name: string }) => {
      if (target.type === 'folder') {
        return renameFolder({ vaultId, folderId: target.folder.id, name });
      }

      return renameDocument({ vaultId, documentId: target.document.id, name });
    },
    onSuccess: async (_data, variables) => {
      toast.success(`${variables.target.type === 'folder' ? 'Folder' : 'Document'} renamed.`);
      setRenameTarget(null);
      setRenameValue('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename item.');
    },
  });
  const moveMutation = useMutation({
    mutationFn: async ({ target, destinationId }: { target: BrowserItem; destinationId: string | null }) => {
      if (target.type === 'folder') {
        return moveFolder({ vaultId, folderId: target.folder.id, parentId: destinationId });
      }

      return moveDocument({ vaultId, documentId: target.document.id, folderId: destinationId });
    },
    onSuccess: async (_data, variables) => {
      toast.success(`${variables.target.type === 'folder' ? 'Folder' : 'Document'} moved.`);
      setMoveTarget(null);
      setMoveDestinationId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not move item.');
    },
  });
  const deleteFolderMutation = useMutation({
    mutationFn: (folder: FolderSummary) => softDeleteFolder({ vaultId, folderId: folder.id }),
    onSuccess: async () => {
      toast.success('Folder moved to trash.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete folder.');
    },
  });

  const filteredDocuments = useMemo(
    () =>
      (documentsQuery.data?.documents ?? []).filter((document) => {
        const documentDateValue = document.documentDate
          ? new Date(document.documentDate)
          : document.createdAt
            ? new Date(document.createdAt)
            : null;
        const dateFromValue = appliedDateRange.dateFrom
          ? new Date(appliedDateRange.dateFrom)
          : null;
        const dateToValue = appliedDateRange.dateTo ? new Date(appliedDateRange.dateTo) : null;

        if (dateFromValue && (!documentDateValue || documentDateValue < dateFromValue)) {
          return false;
        }

        if (dateToValue) {
          const inclusiveDateTo = new Date(dateToValue);
          inclusiveDateTo.setHours(23, 59, 59, 999);

          if (!documentDateValue || documentDateValue > inclusiveDateTo) {
            return false;
          }
        }

        return true;
      }),
    [appliedDateRange.dateFrom, appliedDateRange.dateTo, documentsQuery.data?.documents],
  );

  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleDocuments = filteredDocuments.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE,
  );
  const usingSearch = debouncedSearchText.length > 0;
  const folderItems = useMemo(
    () => folderItemsQuery.data?.folders ?? [],
    [folderItemsQuery.data?.folders],
  );
  const browserItems = useMemo<BrowserItem[]>(
    () => [
      ...folderItems.map(folder => ({ type: 'folder' as const, folder })),
      ...visibleDocuments.map(document => ({ type: 'document' as const, document })),
    ].sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1;
      }

      return getItemName(left).localeCompare(getItemName(right), undefined, { sensitivity: 'base' });
    }),
    [folderItems, visibleDocuments],
  );
  const searchResultCount = searchQuery.data?.resultsCount ?? 0;
  const activeResultCount = usingSearch ? searchResultCount : filteredDocuments.length + folderItems.length;
  const activePageCount = Math.max(1, Math.ceil((usingSearch ? searchResultCount : filteredDocuments.length) / PAGE_SIZE));
  const activePageIndex = usingSearch ? pageIndex : safePageIndex;
  const activeIsLoading = usingSearch
    ? searchQuery.isLoading
    : documentsQuery.isLoading || folderItemsQuery.isLoading;
  const activeIsError = usingSearch
    ? searchQuery.isError
    : documentsQuery.isError || folderItemsQuery.isError;
  const activeDocuments = useMemo(
    () => (
      usingSearch
        ? (searchQuery.data?.results ?? []).map((result) => ({
            documentId: result.documentId,
            vaultId,
            name: result.name,
            mimeType: result.mimeType,
            originalName: result.originalName,
            originalSize: result.originalSize,
            createdAt: result.createdAt,
            updatedAt: result.updatedAt,
            tags: result.tags,
            snippet: result.bestChunk
              ? tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                  part.highlighted ? (
                    <Box
                      as="mark"
                      key={`${result.documentId}-${part.key}`}
                      rounded="md"
                      bg="teal.subtle"
                      color="fg"
                      px="1.5"
                      py="0.5"
                    >
                      {part.text}
                    </Box>
                  ) : (
                    <Text as="span" key={`${result.documentId}-${part.key}`}>
                      {part.text}
                    </Text>
                  ),
                )
              : undefined,
          }))
        : visibleDocuments.map((document) => ({
            documentId: document.id,
            vaultId,
            name: document.name,
            mimeType: document.mimeType,
            originalName: document.originalName,
            originalSize: document.originalSize,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
          }))
    ),
    [searchQuery.data?.results, usingSearch, vaultId, visibleDocuments],
  );
  const selectedDocuments = useMemo(() => {
    const documentsByKey = new Map(
      activeDocuments.map((document) => [
        getDocumentSelectionKey(document.vaultId, document.documentId),
        document,
      ]),
    );

    return selectedDocumentKeys
      .map((key) => documentsByKey.get(key))
      .filter((document): document is (typeof activeDocuments)[number] => Boolean(document));
  }, [activeDocuments, selectedDocumentKeys]);
  const selectedTag = (tagsQuery.data?.tags ?? []).find((tag) => tag.id === selectedTagId);
  const activeFilters = [
    ...(selectedTag
      ? [
          {
            key: `tag-${selectedTag.id}`,
            label: selectedTag.name,
            onRemove: () => {
              setSelectedTagId('');
              setPageIndex(0);
            },
          },
        ]
      : []),
    ...(datePreset !== 'any'
      ? [
          {
            key: 'date-range',
            label: getDateFilterLabel({
              preset: datePreset,
              dateFrom: appliedDateRange.dateFrom,
              dateTo: appliedDateRange.dateTo,
            }),
            onRemove: () => {
              setDatePreset('any');
              setCustomDateFrom('');
              setCustomDateTo('');
              setPageIndex(0);
            },
          },
        ]
      : []),
  ];
  const emptyState =
    !activeIsLoading &&
    !activeIsError &&
    (usingSearch ? (searchQuery.data?.results.length ?? 0) === 0 : browserItems.length === 0);
  const canUpdateItems = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'documents.update' });
  const canDeleteItems = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'documents.delete' });
  const canDownloadItems = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'documents.download' });
  const canManageTags = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'tags.manage' });
  const canCreateItems = hasVaultPermission({ vault: vaultQuery.data?.vault, permission: 'documents.create' });
  const itemMutationPending = deleteMutation.isPending
    || deleteFolderMutation.isPending
    || renameMutation.isPending
    || moveMutation.isPending;
  const moveDestinations = useMemo(
    () => getMoveDestinations({ folders: folderTreeQuery.data?.folders ?? [], target: moveTarget }),
    [folderTreeQuery.data?.folders, moveTarget],
  );
  const infoFolderPath = useMemo(() => {
    if (infoTarget === null) {
      return 'Vault root';
    }

    if (infoTarget.type === 'root') {
      return 'Vault root';
    }

    if (infoTarget.type === 'document') {
      if (infoTarget.document.folderId === null) {
        return 'Vault root';
      }

      return folderTreeQuery.data?.folders.find(folder => folder.id === infoTarget.document.folderId)?.path ?? 'Folder';
    }

    return folderTreeQuery.data?.folders.find(folder => folder.id === infoTarget.folder.id)?.path ?? 'Folder';
  }, [folderTreeQuery.data?.folders, infoTarget]);

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string }>).detail;

      if (!detail?.vaultId || detail.vaultId !== vaultId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
      ]);
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, [queryClient, vaultId]);

  useEffect(() => {
    try {
      window.localStorage?.setItem?.(FILE_BROWSER_VIEW_STORAGE_KEY, browserView);
    } catch {
    }
  }, [browserView]);

  if (!vaultId) {
    return <Text fontSize="sm" color="fg.error">Invalid vault id.</Text>;
  }

  function clearFilters() {
    setSelectedTagId('');
    setDatePreset('any');
    setCustomDateFrom('');
    setCustomDateTo('');
    setPageIndex(0);
  }

  function toggleDocumentSelection(selectionKey: string, checked: boolean) {
    setSelectedDocumentKeys((current) => (
      checked
        ? current.includes(selectionKey) ? current : [...current, selectionKey]
        : current.filter((key) => key !== selectionKey)
    ));
  }

  function toggleAllDocumentSelection(selectionKeys: string[], checked: boolean) {
    setSelectedDocumentKeys((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...selectionKeys]));
      }

      const selectionSet = new Set(selectionKeys);
      return current.filter((key) => !selectionSet.has(key));
    });
  }

  function downloadDocuments(documents: Array<{ vaultId: string; documentId: string }>) {
    for (const document of documents) {
      const link = window.document.createElement('a');
      link.href = getDocumentDownloadUrl(document);
      link.download = '';
      link.rel = 'noopener';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
    }
  }

  function navigateToFolder(folderId: string | null) {
    setPageIndex(0);
    setSelectedDocumentKeys([]);
    void navigate({
      to: ROUTES.vaultRoot(vaultId),
      search: folderId === null ? {} : { folderId },
      replace: false,
    } as any);
  }

  function deleteDocument(document: DocumentSummary) {
    deleteMutation.mutate([{ vaultId, documentId: document.id }]);
  }

  function openCreateFolderDialog(parentId: string | null) {
    setCreateFolderParentId(parentId);
    setIsCreateFolderOpen(true);
  }

  function openItem(item: BrowserContextItem) {
    if (item.type === 'root') {
      navigateToFolder(null);
      return;
    }

    if (item.type === 'folder') {
      navigateToFolder(item.folder.id);
      return;
    }

    void navigate({ to: ROUTES.vaultDocument(vaultId, item.document.id) } as any);
  }

  function openRenameDialog(item: BrowserItem) {
    setContextMenu(null);
    setRenameTarget(item);
    setRenameValue(getItemName(item));
  }

  function openMoveDialog(item: BrowserItem) {
    setContextMenu(null);
    setMoveTarget(item);
    setMoveDestinationId(item.type === 'folder' ? item.folder.parentId : item.document.folderId);
  }

  function openInfoDialog(item: BrowserContextItem) {
    setContextMenu(null);
    setInfoTarget(item);
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, item: BrowserContextItem) {
    const actions = getItemActions(item).filter(action => !action.disabled);

    if (actions.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      item,
      x: Math.min(event.clientX, window.innerWidth - 224),
      y: Math.min(event.clientY, window.innerHeight - 320),
    });
  }

  function getItemActions(item: BrowserContextItem): BrowserAction[] {
    if (item.type === 'root') {
      return [
        { key: 'open', label: 'Open root', icon: Home, disabled: currentFolderId === null, onSelect: () => openItem(item) },
        { key: 'new-folder', label: 'New folder', icon: FolderPlus, disabled: !canCreateItems, onSelect: () => openCreateFolderDialog(null) },
        {
          key: 'upload',
          label: 'Upload',
          icon: Upload,
          disabled: !canCreateItems,
          onSelect: () => void navigate({ to: ROUTES.transfersWithLock(vaultId, null) } as any),
        },
        { key: 'info', label: 'Info', icon: Info, onSelect: () => openInfoDialog(item) },
      ];
    }

    if (item.type === 'folder') {
      return [
        { key: 'open', label: 'Open', icon: Folder, onSelect: () => openItem(item) },
        { key: 'rename', label: 'Rename', icon: Pencil, disabled: !canUpdateItems, onSelect: () => openRenameDialog(item) },
        { key: 'move', label: 'Move to', icon: MoveRight, disabled: !canUpdateItems, onSelect: () => openMoveDialog(item) },
        { key: 'info', label: 'Info', icon: Info, onSelect: () => openInfoDialog(item) },
        {
          key: 'trash',
          label: 'Move to trash',
          icon: Trash2,
          tone: 'destructive',
          disabled: !canDeleteItems || deleteFolderMutation.isPending,
          onSelect: () => deleteFolderMutation.mutate(item.folder),
        },
      ];
    }

    return [
      { key: 'open', label: 'Preview/open', icon: Eye, onSelect: () => openItem(item) },
      {
        key: 'download',
        label: 'Download',
        icon: Download,
        disabled: !canDownloadItems,
        onSelect: () => downloadDocuments([{ vaultId, documentId: item.document.id }]),
      },
      { key: 'rename', label: 'Rename', icon: Pencil, disabled: !canUpdateItems, onSelect: () => openRenameDialog(item) },
      { key: 'move', label: 'Move to', icon: MoveRight, disabled: !canUpdateItems, onSelect: () => openMoveDialog(item) },
      {
        key: 'tags',
        label: 'Tags',
        icon: Tags,
        disabled: !canManageTags,
        onSelect: () => void navigate({ to: ROUTES.vaultDocument(vaultId, item.document.id) } as any),
      },
      { key: 'info', label: 'Info', icon: Info, onSelect: () => openInfoDialog(item) },
      {
        key: 'trash',
        label: 'Move to trash',
        icon: Trash2,
        tone: 'destructive',
        disabled: !canDeleteItems || deleteMutation.isPending,
        onSelect: () => deleteDocument(item.document),
      },
    ];
  }

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (renameTarget === null || renameValue.trim().length === 0) {
      return;
    }

    renameMutation.mutate({ target: renameTarget, name: renameValue });
  }

  function handleMoveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (moveTarget === null) {
      return;
    }

    moveMutation.mutate({ target: moveTarget, destinationId: moveDestinationId });
  }

  function handleCreateFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (folderName.trim().length === 0) {
      return;
    }

    createFolderMutation.mutate();
  }

  return (
    <Flex as="section" direction="column" gap="6" pb="8">
      <PageIntro
        title="Documents"
        actions={
          <HStack flexWrap="wrap" gap="3">
            <Link to={ROUTES.vaultTrash(vaultId)} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4, fontSize: '0.875rem', fontWeight: 500 }}>
              Deleted documents
            </Link>
            <Link to={ROUTES.vaultTags(vaultId)} style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 4, fontSize: '0.875rem', fontWeight: 500 }}>
              Tags
            </Link>
            <Button type="button" variant="outline" onClick={() => openCreateFolderDialog(currentFolderId)}>
              <FolderPlus size={16} />
              New folder
            </Button>
            <Link to={ROUTES.transfersWithLock(vaultId, currentFolderId)} style={{ textDecoration: 'none' }}>
              <Flex
                display="inline-flex"
                h="11"
                align="center"
                justify="center"
                gap="2"
                rounded="xl"
                bg="teal.solid"
                px="5"
                fontSize="sm"
                fontWeight="semibold"
                color="fg.inverted"
              >
                <Upload size={16} />
                Upload
              </Flex>
            </Link>
          </HStack>
        }
      />
      <DocumentSearchControls
        query={searchText}
        onQueryChange={(value) => {
          setSearchText(value);
          setPageIndex(0);
        }}
        searchPlaceholder="Search documents"
        searchAriaLabel="Search documents"
        isFiltersOpen={isFiltersOpen}
        onOpenFilters={() => setIsFiltersOpen(true)}
        onCloseFilters={() => setIsFiltersOpen(false)}
        onResetFilters={clearFilters}
        activeFilterCount={activeFilters.length}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        sortBy={sortBy}
        onSortChange={(value) => {
          setSortBy(value);
          setPageIndex(0);
        }}
        sortOptions={sortOptions}
        sortSelectId="vault-documents-sort"
        sortAriaLabel="Sort documents"
        filtersTitle="Filters"
        filtersContent={
          <>
            <Box gap="3">
              <Text
                as="span"
                id="vault-documents-tag-filter-label"
                fontSize="sm"
                fontWeight="semibold"
                color="fg"
              >
                Tag
              </Text>
              <Select
                value={selectedTagId || '__all__'}
                onValueChange={(value) => {
                  setSelectedTagId(value === '__all__' ? '' : value);
                  setPageIndex(0);
                }}
              >
                <SelectTrigger
                  aria-label="Tag filter"
                  aria-labelledby="vault-documents-tag-filter-label"
                  h="10"
                  rounded="lg"
                  borderColor="border.subtle"
                  bg="bg.surface"
                  mt="3"
                >
                  <SelectValue placeholder="All tags" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All tags</SelectItem>
                  {(tagsQuery.data?.tags ?? []).map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>

            <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="4">
              <Text fontSize="sm" fontWeight="semibold" color="fg">
                Date
              </Text>

              <DatePresetSelector
                idPrefix="vault-documents-date-filter"
                value={datePreset}
                onValueChange={(value) => {
                  setDatePreset(value);
                  setPageIndex(0);
                }}
                customDateFrom={customDateFrom}
                customDateTo={customDateTo}
                onCustomDateFromChange={(nextValue) => {
                  setCustomDateFrom(nextValue);

                  if (customDateTo && nextValue && nextValue > customDateTo) {
                    setCustomDateTo(nextValue);
                  }

                  setPageIndex(0);
                }}
                onCustomDateToChange={(nextValue) => {
                  setCustomDateTo(nextValue);

                  if (customDateFrom && nextValue && nextValue < customDateFrom) {
                    setCustomDateFrom(nextValue);
                  }

                  setPageIndex(0);
                }}
              />
            </Box>
          </>
        }
      />

      <SurfacePanel display="flex" flexDirection={{ base: 'column', lg: 'row' }} alignItems={{ lg: 'center' }} justifyContent="space-between" gap="3">
        <Stack gap="2" minW="0">
          <FolderBreadcrumbs
            currentFolderId={currentFolderId}
            breadcrumbs={folderItemsQuery.data?.breadcrumbs ?? []}
            onNavigateFolder={navigateToFolder}
            onOpenRootContextMenu={(event) => openContextMenu(event, { type: 'root', vaultId })}
          />
          <Text fontSize="sm" color="fg.muted">
            {activeResultCount} item{activeResultCount === 1 ? '' : 's'}
          </Text>
        </Stack>
        <Flex align="center" gap="2">
          <Button
            type="button"
            size="sm"
            variant={browserView === 'list' ? 'solid' : 'outline'}
            aria-label="List view"
            onClick={() => setBrowserView('list')}
          >
            <List size={16} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={browserView === 'grid' ? 'solid' : 'outline'}
            aria-label="Grid view"
            onClick={() => setBrowserView('grid')}
          >
            <Grid3X3 size={16} />
          </Button>
        </Flex>
      </SurfacePanel>

      {activeIsLoading ? (
        <SurfacePanel>
          <Text fontSize="sm" color="fg.muted">
            {usingSearch ? 'Searching documents...' : 'Loading folder...'}
          </Text>
        </SurfacePanel>
      ) : null}
      {activeIsError ? (
        <SurfacePanel>
          <Text fontSize="sm" color="fg.error">
            {usingSearch ? 'Unable to search this vault.' : 'Unable to load this folder.'}
          </Text>
        </SurfacePanel>
      ) : null}

      {!activeIsLoading && emptyState ? (
        <EmptyState
          icon={<Folder size={24} />}
          title={usingSearch ? 'No matches' : 'This folder is empty'}
          description={usingSearch ? 'No documents match the current filters.' : 'Create a folder or upload documents here.'}
          action={!usingSearch ? (
            <Button type="button" variant="outline" onClick={() => openCreateFolderDialog(currentFolderId)}>
              <FolderPlus size={16} />
              New folder
            </Button>
          ) : undefined}
        />
      ) : null}

      {!activeIsLoading && !activeIsError && !emptyState ? (
        usingSearch ? (
          <SurfacePanel overflow="hidden" p="0">
          <DocumentLibraryTable
            vaultName="Current vault"
            documents={activeDocuments}
            selectedDocumentKeys={selectedDocumentKeys}
            onToggleDocument={toggleDocumentSelection}
            onToggleAllDocuments={toggleAllDocumentSelection}
          />
          </SurfacePanel>
        ) : browserView === 'list' ? (
          <BrowserItemList
            items={browserItems}
            vaultId={vaultId}
            onOpenFolder={navigateToFolder}
            getItemActions={getItemActions}
            onOpenContextMenu={openContextMenu}
            isMutating={itemMutationPending}
          />
        ) : (
          <BrowserItemGrid
            items={browserItems}
            vaultId={vaultId}
            onOpenFolder={navigateToFolder}
            getItemActions={getItemActions}
            onOpenContextMenu={openContextMenu}
            isMutating={itemMutationPending}
          />
        )
      ) : null}

      <SurfacePanel display="flex" flexDirection={{ base: 'column', sm: 'row' }} gap="2" alignItems={{ sm: 'center' }} justifyContent={{ sm: 'space-between' }} p="3">
        <Text fontSize="xs" color="fg.muted">
          Page {activePageIndex + 1} of {activePageCount}
        </Text>
        <Flex gap="2">
          <Button
            size="xs"
            type="button"
            variant="outline"
            disabled={activePageIndex === 0}
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            Previous
          </Button>
          <Button
            size="xs"
            type="button"
            variant="outline"
            disabled={activePageIndex >= activePageCount - 1}
            onClick={() => setPageIndex((current) => Math.min(activePageCount - 1, current + 1))}
          >
            Next
          </Button>
        </Flex>
      </SurfacePanel>

      <ChakraDialog.Root
        open={isCreateFolderOpen}
        onOpenChange={(event) => {
          setIsCreateFolderOpen(event.open);
          if (!event.open) {
            setFolderName('');
            setCreateFolderParentId(null);
          }
        }}
        size={{ mdDown: 'full', md: 'md' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <form onSubmit={handleCreateFolderSubmit}>
                <ChakraDialog.Header>
                  <ChakraDialog.Title>New folder</ChakraDialog.Title>
                  <ChakraDialog.CloseTrigger asChild>
                    <CloseButton size="sm" />
                  </ChakraDialog.CloseTrigger>
                </ChakraDialog.Header>
                <ChakraDialog.Body>
                  <Stack gap="2">
                    <chakra.label htmlFor="folder-name" fontSize="sm" fontWeight="medium" color="fg">
                      Name
                    </chakra.label>
                    <Input
                      id="folder-name"
                      value={folderName}
                      onChange={(event) => setFolderName(event.target.value)}
                      autoFocus
                    />
                  </Stack>
                </ChakraDialog.Body>
                <ChakraDialog.Footer>
                  <ChakraDialog.ActionTrigger asChild>
                    <Button type="button" variant="outline" disabled={createFolderMutation.isPending}>
                      Cancel
                    </Button>
                  </ChakraDialog.ActionTrigger>
                  <Button type="submit" disabled={folderName.trim().length === 0 || createFolderMutation.isPending}>
                    {createFolderMutation.isPending ? 'Creating...' : 'Create folder'}
                  </Button>
                </ChakraDialog.Footer>
              </form>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

      <RenameItemDialog
        target={renameTarget}
        value={renameValue}
        isPending={renameMutation.isPending}
        onValueChange={setRenameValue}
        onClose={() => {
          setRenameTarget(null);
          setRenameValue('');
        }}
        onSubmit={handleRenameSubmit}
      />

      <MoveItemDialog
        target={moveTarget}
        value={moveDestinationId}
        destinations={moveDestinations}
        isPending={moveMutation.isPending}
        isLoading={folderTreeQuery.isLoading}
        onValueChange={setMoveDestinationId}
        onClose={() => {
          setMoveTarget(null);
          setMoveDestinationId(null);
        }}
        onSubmit={handleMoveSubmit}
      />

      <ItemInfoDialog
        target={infoTarget}
        folderPath={infoFolderPath}
        onClose={() => setInfoTarget(null)}
      />

      {contextMenu !== null ? (
        <BrowserContextMenu
          state={contextMenu}
          actions={getItemActions(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      <ActionBar.Root open={selectedDocuments.length > 0}>
        <Portal>
          <ActionBar.Positioner>
            <ActionBar.Content>
              <ActionBar.SelectionTrigger>
                {selectedDocuments.length} selected
              </ActionBar.SelectionTrigger>
              <ActionBar.Separator />
              <Button
                size="sm"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  downloadDocuments(
                    selectedDocuments.map((document) => ({
                      vaultId: document.vaultId,
                      documentId: document.documentId,
                    })),
                  );
                }}
              >
                Download selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  deleteMutation.mutate(
                    selectedDocuments.map((document) => ({
                      vaultId: document.vaultId,
                      documentId: document.documentId,
                    })),
                  );
                }}
              >
                Delete selected
              </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>
    </Flex>
  );
}
