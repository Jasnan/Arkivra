import type { MouseEvent } from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  ActionBar,
  Box,
  CloseButton,
  Dialog as ChakraDialog,
  Flex,
  Portal,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/toaster-store';
import { ROUTES } from '@/app/routes';
import { validateTrashSearch } from '@/app/search-params';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { WorkspacePageTitle } from '@/components/layout/workspace-page-title';
import { DeleteButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { useDialogPageLockCleanup } from '@/components/ui/dialog-page-locks';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import { DocumentSortMenu } from '@/features/documents/components/document-sort-menu';
import { SearchFilterMultiSelect } from '@/features/documents/components/document-search-controls';
import {
  getBulkDocumentDeletionImpact,
  getDocumentDeletionImpact,
  getDocumentDuplicateConflict,
  permanentlyDeleteDocument,
  restoreDocument,
} from '@/features/documents/documents.api';
import {
  invalidateDocumentCollectionCaches,
  removeDocumentsFromDeletedListCache,
} from '@/features/documents/document-cache-updates';
import type {
  DocumentDuplicateConflict,
  UploadConflictStrategy,
} from '@/features/documents/documents.api';
import { useDeletedDocumentsQuery } from '@/features/documents/documents.queries';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import type {
  BulkDocumentDeletionImpactPreview,
  DeletedDocumentSummary,
  DocumentDeletionImpactPreview,
  DocumentSummary,
} from '@/features/documents/documents.types';
import { useBrowserSelection } from '@/features/documents/hooks/use-browser-selection';
import {
  BrowserContextMenu,
  BrowserItemGrid,
  BrowserItemList,
} from '@/features/file-browser/components/vault-browser-components';
import { FileBrowserViewToggle } from '@/features/file-browser/components/file-browser-view-toggle';
import { usePreferredFileBrowserView } from '@/features/file-browser/components/use-preferred-file-browser-view';
import { getBrowserItemKey } from '@/features/file-browser/components/vault-browser.types';
import type {
  BrowserAction,
  BrowserContextItem,
  BrowserItem,
  ContextMenuState,
} from '@/features/file-browser/components/vault-browser.types';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

type TrashSort = 'name_asc' | 'name_desc' | 'deleted_desc' | 'deleted_asc';

const TRASH_LIST_GRID_COLUMNS =
  '2.5rem minmax(0, 0.9fr) minmax(9rem, 12rem) minmax(10.5rem, 12rem) 7rem 2rem';

const trashSortOptions: Array<{ value: TrashSort; label: string }> = [
  { value: 'deleted_desc', label: 'Recent' },
  { value: 'deleted_asc', label: 'Oldest' },
  { value: 'name_asc', label: 'A → Z' },
  { value: 'name_desc', label: 'Z → A' },
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
    return (
      getDeletedTime(right) - getDeletedTime(left) ||
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    );
  }

  if (sortBy === 'deleted_asc') {
    return (
      getDeletedTime(left) - getDeletedTime(right) ||
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    );
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function conflictStrategyLabel(strategy: UploadConflictStrategy) {
  switch (strategy) {
    case 'skip':
      return 'Skip';
    case 'keep_both':
      return 'Keep both';
    case 'new_version':
      return 'New version';
    default:
      return strategy;
  }
}

export function TrashConfirmDialog({
  open,
  title,
  description,
  impact,
  isImpactLoading = false,
  impactError = null,
  confirmLabel,
  pendingLabel,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  impact?: DocumentDeletionImpactPreview | BulkDocumentDeletionImpactPreview | null;
  isImpactLoading?: boolean;
  impactError?: string | null;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useDialogPageLockCleanup(open);

  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(event) => {
        if (!event.open && !isPending) onClose();
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
              <CloseButton size="sm" disabled={isPending} onClick={onClose} />
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              {isImpactLoading ? (
                <Flex align="center" gap="3" color="fg.muted">
                  <Spinner size="sm" color="teal.solid" />
                  <Text fontSize="sm">Checking affected conversations...</Text>
                </Flex>
              ) : impactError !== null ? (
                <Flex align="center" gap="3" color="fg.error">
                  <AlertCircle size={18} />
                  <Text fontSize="sm" fontWeight="semibold">
                    {impactError}
                  </Text>
                </Flex>
              ) : impact !== null &&
                impact !== undefined &&
                impact.affectedConversationCount > 0 ? (
                'affectedConversations' in impact ? (
                  <DocumentDeletionImpactWarning impact={impact} />
                ) : (
                  <BulkDocumentDeletionImpactWarning impact={impact} />
                )
              ) : (
                <Text color="fg.muted" fontSize="sm">
                  {description}
                </Text>
              )}
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button
                type="button"
                variant="outline"
                disabled={isPending || isImpactLoading}
                onClick={onClose}
              >
                Cancel
              </Button>
              <DeleteButton
                type="button"
                disabled={isPending || isImpactLoading || impactError !== null}
                onClick={onConfirm}
              >
                {isPending ? pendingLabel : confirmLabel}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

function BulkDocumentDeletionImpactWarning({
  impact,
}: {
  impact: BulkDocumentDeletionImpactPreview;
}) {
  return (
    <Stack gap="3" color="fg.muted" fontSize="sm" lineHeight="1.55">
      <Text>These documents are referenced by conversations.</Text>
      <Text>This may affect existing conversations.</Text>
      <Text>{`Affected conversations: ${impact.affectedConversationCount}`}</Text>
      <Text>Deleting these documents will:</Text>
      <Stack as="ul" gap="1" m="0" ps="5">
        <Text as="li">permanently remove all versions</Text>
        <Text as="li">preserve conversation history</Text>
        <Text as="li">make affected conversations read-only</Text>
      </Stack>
    </Stack>
  );
}

function DocumentDeletionImpactWarning({ impact }: { impact: DocumentDeletionImpactPreview }) {
  const shownCount = impact.affectedConversations.length;
  const hasMore = impact.affectedConversationCount > shownCount;

  return (
    <Stack gap="3" color="fg.muted" fontSize="sm" lineHeight="1.55">
      <Text>{`This document contains ${impact.versionCount} versions.`}</Text>
      <Text>
        Some versions are referenced by {impact.affectedConversationCount}{' '}
        {impact.affectedConversationCount === 1 ? 'conversation' : 'conversations'}.
      </Text>
      <Text>Deleting this document will:</Text>
      <Stack as="ul" gap="1" m="0" ps="5">
        <Text as="li">permanently remove all versions</Text>
        <Text as="li">preserve conversation history</Text>
        <Text as="li">make the affected conversations read-only</Text>
      </Stack>
      <Text>Affected conversations{hasMore ? ` (${impact.affectedConversationCount})` : ''}:</Text>
      <Stack as="ul" gap="1" m="0" ps="5">
        {impact.affectedConversations.map((conversation) => (
          <Text as="li" key={conversation.id} overflowWrap="anywhere">
            {conversation.title}
          </Text>
        ))}
      </Stack>
      {hasMore ? (
        <Text>
          Showing {shownCount} of {impact.affectedConversationCount} conversations.
        </Text>
      ) : null}
    </Stack>
  );
}

export function DocumentTrashPage() {
  const search = validateTrashSearch(useSearch({ strict: false }));
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

  const [browserView, setBrowserView] = usePreferredFileBrowserView();
  const [browserSort, setBrowserSort] = useState<TrashSort>('deleted_desc');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<DeletedDocumentSummary[]>(
    [],
  );
  const [restoreConflict, setRestoreConflict] = useState<{
    documents: DeletedDocumentSummary[];
    conflict: DocumentDuplicateConflict;
  } | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<
    DocumentDeletionImpactPreview | BulkDocumentDeletionImpactPreview | null
  >(null);
  const [isDeleteImpactLoading, setIsDeleteImpactLoading] = useState(false);
  const [deleteImpactError, setDeleteImpactError] = useState<string | null>(null);

  const closePermanentDeleteDialog = useCallback(() => {
    setPendingPermanentDelete([]);
    setDeleteImpact(null);
    setDeleteImpactError(null);
    setIsDeleteImpactLoading(false);
  }, []);

  const openPermanentDeleteDialog = useCallback(
    (documents: DeletedDocumentSummary[]) => {
      setPendingPermanentDelete(documents);
      setDeleteImpact(null);
      setDeleteImpactError(null);

      if (documents.length !== 1) {
        const targets = documents
          .map((document) => ({
            vaultId: getResolvedVaultId(document, queryVaultId),
            documentId: document.id,
          }))
          .filter((target) => target.vaultId.length > 0);

        if (targets.length !== documents.length) {
          setIsDeleteImpactLoading(false);
          setDeleteImpactError('Could not check affected conversations.');
          return;
        }

        setIsDeleteImpactLoading(true);
        void getBulkDocumentDeletionImpact({
          documents: targets,
          includeDeleted: true,
        })
          .then(({ impact }) => {
            setDeleteImpact(impact);
          })
          .catch((error) => {
            setDeleteImpactError(
              error instanceof Error ? error.message : 'Could not check affected conversations.',
            );
          })
          .finally(() => {
            setIsDeleteImpactLoading(false);
          });
        return;
      }

      const document = documents[0]!;
      const vaultId = getResolvedVaultId(document, queryVaultId);

      if (!vaultId) {
        setIsDeleteImpactLoading(false);
        setDeleteImpactError('Could not check affected conversations.');
        return;
      }

      setIsDeleteImpactLoading(true);
      void getDocumentDeletionImpact({
        vaultId,
        documentId: document.id,
        includeDeleted: true,
        limit: 5,
      })
        .then(({ impact }) => {
          setDeleteImpact(impact);
        })
        .catch((error) => {
          setDeleteImpactError(
            error instanceof Error ? error.message : 'Could not check affected conversations.',
          );
        })
        .finally(() => {
          setIsDeleteImpactLoading(false);
        });
    },
    [queryVaultId],
  );

  const deletedDocuments = useMemo(
    () => deletedDocumentsQuery.data?.documents ?? [],
    [deletedDocumentsQuery.data?.documents],
  );
  const retentionDays = deletedDocumentsQuery.data?.retentionDays ?? 30;
  const vaultOptions = useMemo(() => vaultsQuery.data?.vaults ?? [], [vaultsQuery.data?.vaults]);
  const selectedVaultIdSet = useMemo(() => new Set(selectedVaultIds), [selectedVaultIds]);
  const visibleDocuments = useMemo(
    () =>
      deletedDocuments
        .filter(
          (document) => selectedVaultIdSet.size === 0 || selectedVaultIdSet.has(document.vaultId),
        )
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
    mutationFn: async ({
      documents,
      conflictStrategy,
    }: {
      documents: DeletedDocumentSummary[];
      conflictStrategy?: UploadConflictStrategy;
    }) =>
      Promise.all(
        documents.map((document) =>
          restoreDocument({
            vaultId: getResolvedVaultId(document, queryVaultId),
            documentId: document.id,
            conflictStrategy,
          }),
        ),
      ),
    onSuccess: async (data, { documents, conflictStrategy }) => {
      const skipped = data.every((item) => item.skipped);
      toast.success(
        skipped
          ? 'Restore skipped.'
          : documents.length === 1
            ? (data[0]?.message ?? 'File restored to original location')
            : `${documents.length} documents restored.`,
      );
      clearSelection();
      setContextMenu(null);
      if (conflictStrategy !== undefined) {
        setRestoreConflict(null);
      }
      if (!skipped) {
        removeDocumentsFromDeletedListCache(queryClient, documents);
      }
      await invalidateDocumentCollectionCaches(queryClient);
    },
    onError: (error, { documents }) => {
      const conflict = getDocumentDuplicateConflict(error);
      if (documents.length === 1 && conflict !== null && conflict.availableStrategies.length > 0) {
        setRestoreConflict({ documents, conflict });
        return;
      }

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
      closePermanentDeleteDialog();
      removeDocumentsFromDeletedListCache(queryClient, documents);
      await invalidateDocumentCollectionCaches(queryClient);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Could not permanently delete documents.',
      );
    },
  });
  const itemMutationPending = restoreMutation.isPending || permanentDeleteMutation.isPending;

  const updateVaultFilter = useCallback(
    (values: string[]) => {
      navigate({
        to: ROUTES.trash,
        search: values.length > 0 ? { vaultId: values } : {},
        replace: true,
      } as any);
      clearSelection();
    },
    [clearSelection, navigate],
  );

  function openDocument(item: BrowserItem) {
    if (item.type !== 'document') {
      return;
    }

    const vaultId = getResolvedVaultId(item.document, queryVaultId);
    if (!vaultId) return;

    navigate({ to: ROUTES.trashDocument(item.document.id) });
  }

  function openContextMenu(event: MouseEvent<HTMLElement>, item: BrowserContextItem) {
    const actions = getItemActions(item).filter((action) => !action.disabled);

    if (actions.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      item,
      x: event.clientX,
      y: event.clientY,
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
        onSelect: () => restoreMutation.mutate({ documents: [document] }),
      },
      {
        key: 'permanent-delete',
        label: 'Delete',
        icon: Trash2,
        tone: 'destructive',
        disabled: itemMutationPending,
        onSelect: () => openPermanentDeleteDialog([document]),
      },
    ];
  }

  const selectedVaultsLabel =
    selectedVaultIds.length === 0
      ? 'All vaults'
      : selectedVaultIds.length === 1
        ? (vaultOptions.find((vault) => vault.id === selectedVaultIds[0])?.name ?? '1 vault')
        : `${selectedVaultIds.length} vaults`;

  const trashItemCount = useMemo(
    () => (
      <Text whiteSpace="nowrap" fontSize="xs" color="fg.muted">
        {activeResultCount} item{activeResultCount === 1 ? '' : 's'}
        {selectedCount > 0 ? ` - ${selectedCount} selected` : ''}
      </Text>
    ),
    [activeResultCount, selectedCount],
  );

  const trashHeaderActions = useMemo(
    () => (
      <Flex
        align={{ base: 'stretch', md: 'center' }}
        direction={{ base: 'column', md: 'row' }}
        gap="2"
        minW="0"
      >
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
              size="sm"
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
          <DocumentSortMenu
            ariaLabel="Sort trashed documents"
            value={browserSort}
            onValueChange={setBrowserSort}
            options={trashSortOptions}
            size="sm"
            variant="input"
          />
          <DeleteButton
            type="button"
            size="sm"
            rounded="md"
            px="3"
            shadow="none"
            disabled={browserItems.length === 0 || itemMutationPending}
            onClick={() => openPermanentDeleteDialog(visibleDocuments)}
          >
            Empty trash
          </DeleteButton>
          <FileBrowserViewToggle value={browserView} onValueChange={setBrowserView} size="sm" />
        </Flex>
      </Flex>
    ),
    [
      browserItems.length,
      browserSort,
      browserView,
      clearSelection,
      itemMutationPending,
      openPermanentDeleteDialog,
      selectedCount,
      selectedVaultIds,
      selectedVaultsLabel,
      setBrowserView,
      updateVaultFilter,
      vaultOptions,
      vaultsQuery.isLoading,
      visibleDocuments,
    ],
  );

  const workspaceHeader = useMemo(
    () => ({
      left: (
        <Stack
          direction={{ base: 'column', sm: 'row' }}
          align={{ sm: 'center' }}
          gap={{ base: '0.5', sm: '3' }}
          minW="0"
        >
          <WorkspacePageTitle>Trash</WorkspacePageTitle>
          {trashItemCount}
        </Stack>
      ),
      actions: trashHeaderActions,
    }),
    [trashHeaderActions, trashItemCount],
  );
  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);

  const secondaryToolbar = useMemo(
    () =>
      isInWorkspaceShell ? null : (
        <Flex
          align={{ base: 'stretch', md: 'center' }}
          justify="space-between"
          direction={{ base: 'column', md: 'row' }}
          gap="3"
          borderBottomWidth="1px"
          borderColor="border.surface"
          bg="bg.workspace"
          px={{ base: '4', lg: '6' }}
          py="3"
        >
          {trashItemCount}
          {trashHeaderActions}
        </Flex>
      ),
    [isInWorkspaceShell, trashHeaderActions, trashItemCount],
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
          borderColor="border.surface"
          px={{ base: '4', lg: '6' }}
          py="3"
        >
          {workspaceHeader.left}
        </Flex>
      ) : null}
      {secondaryToolbar}

      {isLoading ? (
        <Box borderBottomWidth="1px" borderColor="border.surface" px="6" py="4">
          <Text fontSize="sm" color="fg.muted">
            Loading trash...
          </Text>
        </Box>
      ) : null}
      {isError ? (
        <Box borderBottomWidth="1px" borderColor="border.surface" px="6" py="4">
          <Text fontSize="sm" color="fg.error">
            Unable to load trash.
          </Text>
        </Box>
      ) : null}

      {emptyState ? (
        <CenteredEmptyState
          title="Trash is empty"
          description="Deleted documents will appear here until their retention window ends."
          icon={<Trash2 size={28} />}
          containerProps={{ flex: '1', minH: '0' }}
        />
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
            hideActionsUntilHover
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

      <Box
        as="footer"
        position="sticky"
        bottom="0"
        zIndex="1"
        flexShrink={0}
        borderTopWidth="1px"
        borderColor="border.surface"
        bg="bg.workspace"
        px={{ base: '4', lg: '6' }}
        py="2.5"
      >
        <Text fontSize="xs" color="fg.muted">
          Trashed documents stay here for {retentionDays} days before Arkivra removes them
          automatically.
        </Text>
      </Box>

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
            ? 'Delete?'
            : pendingPermanentDelete.length === 1
              ? `Delete ${pendingPermanentDelete[0]?.name}?`
              : `Delete ${pendingPermanentDelete.length} documents?`
        }
        description={
          pendingPermanentDelete.length === browserItems.length && pendingPermanentDelete.length > 0
            ? 'This permanently deletes every visible document in Trash. This action cannot be undone.'
            : 'This permanently deletes the selected document data from Arkivra. This action cannot be undone.'
        }
        confirmLabel={
          pendingPermanentDelete.length === 1
            ? 'Delete document'
            : `Delete ${pendingPermanentDelete.length} documents`
        }
        pendingLabel="Deleting..."
        isPending={permanentDeleteMutation.isPending}
        impact={pendingPermanentDelete.length === 1 ? deleteImpact : null}
        isImpactLoading={pendingPermanentDelete.length === 1 && isDeleteImpactLoading}
        impactError={pendingPermanentDelete.length === 1 ? deleteImpactError : null}
        onClose={closePermanentDeleteDialog}
        onConfirm={() => {
          if (pendingPermanentDelete.length > 0) {
            permanentDeleteMutation.mutate(pendingPermanentDelete);
          }
        }}
      />

      <ChakraDialog.Root
        open={restoreConflict !== null}
        onOpenChange={(event) => {
          if (!event.open && !restoreMutation.isPending) {
            setRestoreConflict(null);
          }
        }}
        size={{ mdDown: 'full', md: 'lg' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <ChakraDialog.Header>
                <ChakraDialog.Title>Document already exists</ChakraDialog.Title>
                <CloseButton
                  size="sm"
                  disabled={restoreMutation.isPending}
                  onClick={() => setRestoreConflict(null)}
                />
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <Text color="fg.muted" fontSize="sm">
                  {restoreConflict?.conflict.message ??
                    'A document with this file already exists in this vault.'}
                </Text>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <Button
                  type="button"
                  variant="outline"
                  disabled={restoreMutation.isPending}
                  onClick={() => setRestoreConflict(null)}
                >
                  Cancel
                </Button>
                {restoreConflict?.conflict.availableStrategies.map((strategy) => (
                  <Button
                    key={strategy}
                    type="button"
                    variant={strategy === 'keep_both' ? 'default' : 'outline'}
                    disabled={restoreMutation.isPending}
                    onClick={() => {
                      if (restoreConflict === null) return;
                      restoreMutation.mutate({
                        documents: restoreConflict.documents,
                        conflictStrategy: strategy,
                      });
                    }}
                  >
                    {conflictStrategyLabel(strategy)}
                  </Button>
                ))}
              </ChakraDialog.Footer>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

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
                onClick={() => restoreMutation.mutate({ documents: selectedDocuments })}
              >
                Restore
              </Button>
              <Button
                size="sm"
                variant="outline"
                colorPalette="red"
                disabled={itemMutationPending}
                onClick={() => openPermanentDeleteDialog(selectedDocuments)}
              >
                Delete
              </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
        </Portal>
      </ActionBar.Root>
    </Flex>
  );
}
