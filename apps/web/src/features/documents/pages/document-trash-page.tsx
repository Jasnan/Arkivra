import type { MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActionBar,
  Box,
  CloseButton,
  Dialog as ChakraDialog,
  Flex,
  HStack,
  Menu,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowUpDown, Check, ChevronDown, Grid3X3, List, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { DeleteButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { SearchFilterMultiSelect } from '@/features/documents/components/document-search-controls';
import { permanentlyDeleteDocument, restoreDocument } from '@/features/documents/documents.api';
import {
  documentQueryKeys,
  useDeletedDocumentsQuery,
} from '@/features/documents/documents.queries';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import type { DeletedDocumentSummary, DocumentSummary } from '@/features/documents/documents.types';
import { useBrowserSelection } from '@/features/documents/hooks/use-browser-selection';
import {
  BrowserContextMenu,
  BrowserItemGrid,
  BrowserItemList,
} from '@/features/file-browser/components/vault-browser-components';
import {
  FILE_BROWSER_VIEW_STORAGE_KEY,
  getBrowserItemKey,
  getInitialBrowserView,
} from '@/features/file-browser/components/vault-browser.types';
import type {
  BrowserAction,
  BrowserContextItem,
  BrowserItem,
  ContextMenuState,
  FileBrowserView,
} from '@/features/file-browser/components/vault-browser.types';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

type TrashSort = 'name_asc' | 'name_desc' | 'deleted_desc';

const TRASH_LIST_GRID_COLUMNS = '2.5rem minmax(0, 1fr) minmax(9rem, 12rem) 9.5rem 7rem 2.75rem';

const trashSortOptions: Array<{ value: TrashSort; label: string }> = [
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'deleted_desc', label: 'Recently deleted' },
];

function getResolvedVaultId(
  document: DocumentSummary | DeletedDocumentSummary,
  fallbackVaultId?: string,
) {
  return 'vaultId' in document ? document.vaultId : (fallbackVaultId ?? '');
}

function getResolvedVaultName(document: DocumentSummary | DeletedDocumentSummary) {
  return 'vaultName' in document ? document.vaultName : 'Vault';
}

function getDeletedTime(document: DocumentSummary | DeletedDocumentSummary) {
  return document.deletedAt ? new Date(document.deletedAt).getTime() : 0;
}

function compareTrashDocuments(
  left: DeletedDocumentSummary,
  right: DeletedDocumentSummary,
  sortBy: TrashSort,
) {
  if (sortBy === 'name_desc') {
    return right.name.localeCompare(left.name, undefined, { sensitivity: 'base' });
  }

  if (sortBy === 'deleted_desc') {
    return getDeletedTime(right) - getDeletedTime(left)
      || left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function TrashConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pendingLabel,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ChakraDialog.Root open={open} onOpenChange={(event) => { if (!event.open && !isPending) onClose(); }} size={{ mdDown: 'full', md: 'lg' }}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
              <CloseButton size="sm" disabled={isPending} onClick={onClose} />
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              <Text color="fg.muted" fontSize="sm">
                {description}
              </Text>
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
                Cancel
              </Button>
              <DeleteButton type="button" disabled={isPending} onClick={onConfirm}>
                {isPending ? pendingLabel : confirmLabel}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

export function DocumentTrashPage() {
  const search = useSearch({ strict: false }) as Record<string, string | string[] | undefined>;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const vaultsQuery = useVaultsQuery();

  const selectedVaultIds = useMemo(() => {
    const rawVaultId = search.vaultId;
    const values = Array.isArray(rawVaultId) ? rawVaultId : rawVaultId ? [rawVaultId] : [];
    return values.map((value) => value.trim()).filter(Boolean);
  }, [search.vaultId]);
  const queryVaultId = selectedVaultIds.length === 1 ? selectedVaultIds[0] : undefined;
  const deletedDocumentsQuery = useDeletedDocumentsQuery({ vaultId: queryVaultId });

  const [browserView, setBrowserView] = useState<FileBrowserView>(getInitialBrowserView);
  const [browserSort, setBrowserSort] = useState<TrashSort>('deleted_desc');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<DeletedDocumentSummary[]>([]);

  const deletedDocuments = useMemo(
    () => deletedDocumentsQuery.data?.documents ?? [],
    [deletedDocumentsQuery.data?.documents],
  );
  const retentionDays = deletedDocumentsQuery.data?.retentionDays ?? 30;
  const vaultOptions = vaultsQuery.data?.vaults ?? [];
  const selectedVaultIdSet = useMemo(() => new Set(selectedVaultIds), [selectedVaultIds]);
  const visibleDocuments = useMemo(
    () => deletedDocuments
      .filter((document) => (
        selectedVaultIdSet.size === 0 || selectedVaultIdSet.has(document.vaultId)
      ))
      .sort((left, right) => compareTrashDocuments(left, right, browserSort)),
    [browserSort, deletedDocuments, selectedVaultIdSet],
  );
  const browserItems = useMemo<BrowserItem[]>(
    () => visibleDocuments.map((document) => ({ type: 'document', document })),
    [visibleDocuments],
  );
  const activeResultCount = browserItems.length;
  const isLoading = deletedDocumentsQuery.isLoading;
  const isError = deletedDocumentsQuery.isError;
  const emptyState = !isLoading && !isError && browserItems.length === 0;
  const selectedSortLabel = trashSortOptions.find((option) => option.value === browserSort)?.label ?? 'Recently deleted';

  const {
    selectedItemKeys,
    selectedItems,
    selectedCount,
    clearSelection,
    toggleBrowserItem,
    toggleAllBrowserItems,
    selectBrowserItem,
  } = useBrowserSelection({
    currentFolderId: 'trash',
    browserItems,
    onBeforeSelect: () => setContextMenu(null),
  });
  const selectedDocuments = selectedItems
    .filter((item): item is Extract<BrowserItem, { type: 'document' }> => item.type === 'document')
    .map((item) => item.document as DeletedDocumentSummary);
  const allItemsSelected = browserItems.length > 0 && selectedCount === browserItems.length;
  const someItemsSelected = selectedCount > 0 && !allItemsSelected;
  const contextItemKey =
    contextMenu?.item.type === 'document' ? getBrowserItemKey(contextMenu.item) : null;

  const restoreMutation = useMutation({
    mutationFn: async (documents: DeletedDocumentSummary[]) =>
      Promise.all(
        documents.map((document) =>
          restoreDocument({
            vaultId: getResolvedVaultId(document, queryVaultId),
            documentId: document.id,
          }),
        ),
      ),
    onSuccess: async (_data, documents) => {
      toast.success(
        documents.length === 1 ? 'Document restored.' : `${documents.length} documents restored.`,
      );
      clearSelection();
      setContextMenu(null);
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore documents.');
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (documents: DeletedDocumentSummary[]) =>
      Promise.all(
        documents.map((document) =>
          permanentlyDeleteDocument({
            vaultId: getResolvedVaultId(document, queryVaultId),
            documentId: document.id,
          }),
        ),
      ),
    onSuccess: async (_data, documents) => {
      toast.success(
        documents.length === 1
          ? 'Document permanently deleted.'
          : `${documents.length} documents permanently deleted.`,
      );
      clearSelection();
      setContextMenu(null);
      setPendingPermanentDelete([]);
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Could not permanently delete documents.',
      );
    },
  });
  const itemMutationPending = restoreMutation.isPending || permanentDeleteMutation.isPending;

  useEffect(() => {
    try {
      window.localStorage?.setItem?.(FILE_BROWSER_VIEW_STORAGE_KEY, browserView);
    } catch {
    }
  }, [browserView]);

  function updateVaultFilter(values: string[]) {
    navigate({
      to: ROUTES.trash,
      search: values.length > 0 ? { vaultId: values } : {},
      replace: true,
    } as any);
    clearSelection();
  }

  function openDocument(item: BrowserItem) {
    if (item.type !== 'document') {
      return;
    }

    const vaultId = getResolvedVaultId(item.document, queryVaultId);
    if (!vaultId) return;

    navigate({ to: ROUTES.trashDocument(item.document.id) });
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
      y: Math.min(event.clientY, window.innerHeight - 160),
    });
  }

  function getItemActions(item: BrowserContextItem): BrowserAction[] {
    if (item.type !== 'document') {
      return [];
    }

    const document = item.document as DeletedDocumentSummary;
    return [
      {
        key: 'restore',
        label: 'Restore',
        icon: RotateCcw,
        disabled: itemMutationPending,
        onSelect: () => restoreMutation.mutate([document]),
      },
      {
        key: 'permanent-delete',
        label: 'Delete permanently',
        icon: Trash2,
        tone: 'destructive',
        disabled: itemMutationPending,
        onSelect: () => setPendingPermanentDelete([document]),
      },
    ];
  }

  const workspaceHeader = useMemo(() => ({
    left: (
      <Stack gap="0.5" minW="0">
        <Text fontWeight="semibold" color="fg">Trash</Text>
        <Text fontSize="xs" color="fg.muted">
          Trashed documents stay here for {retentionDays} days before Arkivra removes them automatically.
        </Text>
      </Stack>
    ),
  }), [retentionDays]);
  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);

  const selectedVaultsLabel =
    selectedVaultIds.length === 0
      ? 'All vaults'
      : selectedVaultIds.length === 1
        ? vaultOptions.find((vault) => vault.id === selectedVaultIds[0])?.name ?? '1 vault'
        : `${selectedVaultIds.length} vaults`;

  const secondaryToolbar = (
    <Flex
      align={{ base: 'stretch', md: 'center' }}
      justify="space-between"
      direction={{ base: 'column', md: 'row' }}
      gap="3"
      borderBottomWidth="1px"
      borderColor="border.subtle"
      bg="bg.workspace"
      px={{ base: '4', lg: '6' }}
      py="3"
    >
      <HStack gap="2" minW="0" flexWrap="wrap">
        <Button
          type="button"
          size="icon"
          variant={browserView === 'grid' ? 'solid' : 'ghost'}
          aria-label="Grid view"
          onClick={() => setBrowserView('grid')}
        >
          <Grid3X3 size={17} />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={browserView === 'list' ? 'solid' : 'ghost'}
          aria-label="List view"
          onClick={() => setBrowserView('list')}
        >
          <List size={17} />
        </Button>
        <Text fontSize="xs" color="fg.muted">
          {activeResultCount} item{activeResultCount === 1 ? '' : 's'}
          {selectedCount > 0 ? ` - ${selectedCount} selected` : ''}
        </Text>
      </HStack>

      <Flex align={{ sm: 'center' }} direction={{ base: 'column', sm: 'row' }} gap="2" minW="0">
        {selectedCount > 0 ? (
          <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
            Clear
          </Button>
        ) : null}
        <Box w={{ base: 'full', sm: '15rem' }}>
          <SearchFilterMultiSelect
            label="Vaults"
            hideLabel
            controlSize="toolbar"
            triggerLabel={selectedVaultsLabel}
            triggerAriaLabel="Vault filter"
            searchLabel="Search vaults"
            searchPlaceholder="Search vaults"
            emptyLabel="No vaults found."
            loadingLabel="Loading vaults..."
            options={vaultOptions.map((vault) => ({
              value: vault.id,
              label: vault.name,
            }))}
            selectedValues={selectedVaultIds}
            isLoading={vaultsQuery.isLoading}
            onValueChange={updateVaultFilter}
            onClear={() => updateVaultFilter([])}
          />
        </Box>
        <Menu.Root positioning={{ placement: 'bottom-end', offset: { mainAxis: 6, crossAxis: 0 } }}>
          <Menu.Trigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label="Sort trashed documents"
              h="10"
              w={{ base: 'full', sm: 'auto' }}
              minW="11rem"
              justifyContent="space-between"
              gap="2"
              rounded="md"
              borderColor="border.subtle"
              bg="bg.surface"
              px="3"
              shadow="none"
              _hover={{ borderColor: 'fg/30', bg: 'bg.surface' }}
              _focusVisible={{
                borderColor: 'teal.solid',
                outline: '2px solid',
                outlineColor: 'teal.focusRing',
                outlineOffset: '1px',
              }}
            >
              <Flex minW="0" align="center" gap="2">
                <Box color="fg.muted" aria-hidden="true">
                  <ArrowUpDown size={16} />
                </Box>
                <Text as="span" truncate fontSize="sm" fontWeight="medium">
                  {selectedSortLabel}
                </Text>
              </Flex>
              <Box flexShrink={0} color="fg.muted" aria-hidden="true">
                <ChevronDown size={16} />
              </Box>
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner zIndex="dropdown">
              <Menu.Content
                minW="12rem"
                rounded="lg"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="bg.surface"
                p="1.5"
                shadow="lg"
              >
                <Menu.RadioItemGroup
                  value={browserSort}
                  onValueChange={(event) => setBrowserSort(event.value as TrashSort)}
                >
                  {trashSortOptions.map((option) => (
                    <Menu.RadioItem
                      key={option.value}
                      value={option.value}
                      position="relative"
                      minH="10"
                      rounded="md"
                      py="2"
                      ps="10"
                      pe="3"
                      fontSize="sm"
                      fontWeight="medium"
                      color="fg"
                      _checked={{ bg: 'teal.subtle', color: 'fg' }}
                      _highlighted={{ bg: browserSort === option.value ? 'teal.subtle' : 'bg.subtle' }}
                    >
                      <Box
                        position="absolute"
                        left="2.5"
                        top="50%"
                        display="flex"
                        boxSize="5"
                        alignItems="center"
                        justifyContent="center"
                        rounded="sm"
                        color="teal.solid"
                        transform="translateY(-50%)"
                      >
                        <Menu.ItemIndicator>
                          <Check size={16} strokeWidth={2.5} />
                        </Menu.ItemIndicator>
                      </Box>
                      <Menu.ItemText>{option.label}</Menu.ItemText>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioItemGroup>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
        <DeleteButton
          type="button"
          h="10"
          rounded="md"
          px="3"
          shadow="none"
          disabled={browserItems.length === 0 || itemMutationPending}
          onClick={() => setPendingPermanentDelete(visibleDocuments)}
        >
          Empty trash
        </DeleteButton>
      </Flex>
    </Flex>
  );

  const noOpDragStart = () => {};
  const noOpDragEnd = () => {};
  const noOpDrop = () => {};

  return (
    <Flex as="section" h="full" minH="0" direction="column" overflow="hidden">
      {!isInWorkspaceShell ? (
        <Flex
          align="center"
          gap="4"
          borderBottomWidth="1px"
          borderColor="border.subtle"
          px={{ base: '4', lg: '6' }}
          py="3"
        >
          {workspaceHeader.left}
        </Flex>
      ) : null}
      {secondaryToolbar}

      {isLoading ? (
        <Box borderBottomWidth="1px" borderColor="border.subtle" px="6" py="4">
          <Text fontSize="sm" color="fg.muted">
            Loading trash...
          </Text>
        </Box>
      ) : null}
      {isError ? (
        <Box borderBottomWidth="1px" borderColor="border.subtle" px="6" py="4">
          <Text fontSize="sm" color="fg.error">
            Unable to load trash.
          </Text>
        </Box>
      ) : null}

      {emptyState ? (
        <Flex
          flex="1"
          minH="0"
          direction="column"
          align="center"
          justify="center"
          gap="3"
          color="fg.muted"
        >
          <Trash2 size={28} />
          <Text fontWeight="medium" color="fg">
            Trash is empty
          </Text>
          <Text fontSize="sm">
            Deleted documents will appear here until their retention window ends.
          </Text>
        </Flex>
      ) : null}

      {!isLoading && !isError && !emptyState ? (
        browserView === 'list' ? (
          <BrowserItemList
            items={browserItems}
            vaultId={queryVaultId ?? selectedVaultIds[0] ?? ''}
            selectedItemKeys={selectedItemKeys}
            selectable
            allItemsSelected={allItemsSelected}
            someItemsSelected={someItemsSelected}
            contextItemKey={contextItemKey}
            draggedItemKeys={new Set()}
            dropTarget={null}
            onOpenItem={openDocument}
            onSelectItem={selectBrowserItem}
            onToggleAllItems={toggleAllBrowserItems}
            onToggleItem={toggleBrowserItem}
            getItemActions={getItemActions}
            getDocumentLink={(document) => ROUTES.trashDocument(document.id)}
            listGridColumns={TRASH_LIST_GRID_COLUMNS}
            listColumns={[
              { key: 'name', label: 'Name' },
              { key: 'vault', label: 'Original vault' },
              { key: 'deleted', label: 'Deleted' },
              { key: 'size', label: 'Size' },
            ]}
            renderDocumentListMetadata={(item) => [
              { key: 'vault', content: getResolvedVaultName(item.document) },
              { key: 'deleted', content: formatDate(item.document.deletedAt) },
              { key: 'size', content: formatBytes(item.document.originalSize) },
            ]}
            onDragStartItem={noOpDragStart}
            onDragEndItem={noOpDragEnd}
            onDragOverFolder={noOpDrop}
            onDragLeaveFolder={noOpDrop}
            onDropOnFolder={noOpDrop}
            onOpenContextMenu={openContextMenu}
            onOpenBackgroundContextMenu={(event) => event.preventDefault()}
            isMutating={itemMutationPending}
            isDraggable={false}
          />
        ) : (
          <BrowserItemGrid
            items={browserItems}
            vaultId={queryVaultId ?? selectedVaultIds[0] ?? ''}
            selectedItemKeys={selectedItemKeys}
            selectable
            contextItemKey={contextItemKey}
            draggedItemKeys={new Set()}
            dropTarget={null}
            onOpenItem={openDocument}
            onSelectItem={selectBrowserItem}
            onToggleItem={toggleBrowserItem}
            getItemActions={getItemActions}
            getDocumentLink={(document) => ROUTES.trashDocument(document.id)}
            renderDocumentGridMeta={(item) => (
              <Stack gap="1" maxW="full" px="2" textAlign="center">
                <Text truncate fontSize="xs" color="fg.muted">
                  {getResolvedVaultName(item.document)}
                </Text>
                <Text truncate fontSize="xs" color="fg.muted">
                  Deleted {formatDate(item.document.deletedAt)}
                </Text>
              </Stack>
            )}
            onDragStartItem={noOpDragStart}
            onDragEndItem={noOpDragEnd}
            onDragOverFolder={noOpDrop}
            onDragLeaveFolder={noOpDrop}
            onDropOnFolder={noOpDrop}
            onOpenContextMenu={openContextMenu}
            onOpenBackgroundContextMenu={(event) => event.preventDefault()}
            isMutating={itemMutationPending}
            isDraggable={false}
          />
        )
      ) : null}

      {contextMenu !== null ? (
        <BrowserContextMenu
          state={contextMenu}
          actions={getItemActions(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      <TrashConfirmDialog
        open={pendingPermanentDelete.length > 0}
        title={
          pendingPermanentDelete.length === 0
            ? 'Delete permanently?'
            : pendingPermanentDelete.length === browserItems.length
              ? 'Empty trash?'
              : pendingPermanentDelete.length === 1
                ? `Delete "${pendingPermanentDelete[0]?.name}" permanently?`
                : `Delete ${pendingPermanentDelete.length} documents permanently?`
        }
        description={
          pendingPermanentDelete.length === browserItems.length && pendingPermanentDelete.length > 0
            ? 'This permanently deletes every visible document in Trash. This action cannot be undone.'
            : 'This permanently deletes the selected document data from Arkivra. This action cannot be undone.'
        }
        confirmLabel={
          pendingPermanentDelete.length === browserItems.length && pendingPermanentDelete.length > 0
            ? 'Empty trash'
            : 'Delete permanently'
        }
        pendingLabel="Deleting..."
        isPending={permanentDeleteMutation.isPending}
        onClose={() => setPendingPermanentDelete([])}
        onConfirm={() => {
          if (pendingPermanentDelete.length > 0) {
            permanentDeleteMutation.mutate(pendingPermanentDelete);
          }
        }}
      />

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
                disabled={itemMutationPending}
                onClick={() => restoreMutation.mutate(selectedDocuments)}
              >
                Restore
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorPalette="red"
                disabled={itemMutationPending}
                onClick={() => setPendingPermanentDelete(selectedDocuments)}
              >
                Delete permanently
              </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>
    </Flex>
  );
}
