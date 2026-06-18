import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { Box, Flex, HStack, SimpleGrid, Text } from '@chakra-ui/react';
import {
  Download,
  Eye,
  FileSearch,
  Info,
  MoveRight,
  Pencil,
  SearchX,
  Tags,
  Trash2,
} from 'lucide-react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SearchRouteSearch } from '@/app/search-params';
import { validateSearchRouteSearch } from '@/app/search-params';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toaster-store';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import {
  DocumentSearchControls,
  SearchFilterMultiSelect,
} from '@/features/documents/components/document-search-controls';
import type { DocumentSearchControlFilter } from '@/features/documents/components/document-search-controls';
import {
  moveDocument,
  renameDocument,
  softDeleteDocument,
} from '@/features/documents/documents.api';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { FileBrowserViewToggle } from '@/features/file-browser/components/file-browser-view-toggle';
import { usePreferredFileBrowserView } from '@/features/file-browser/components/use-preferred-file-browser-view';
import {
  BrowserContextMenu,
  ItemInfoDialog,
  MoveItemDialog,
  RenameItemDialog,
} from '@/features/file-browser/components/vault-browser-components';
import {
  fileBrowserQueryKeys,
  useFolderTreeQuery,
} from '@/features/file-browser/file-browser.queries';
import { getMoveDestinations } from '@/features/file-browser/components/vault-browser.types';
import type { BrowserContextMenuEntry } from '@/features/file-browser/components/vault-browser.types';
import { searchQueryKeys, useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchMode, SearchSortBy } from '@/features/search/search.types';
import { useAccessibleTagsQuery } from '@/features/tags/tags.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  SearchModeControl,
  SearchResultGrid,
  SearchResultList,
  SearchTrashConfirmDialog,
  buildPresetRange,
  downloadSearchResultDocument,
  getDateFilterLabel,
  getSearchItemVaultId,
} from './search-page-results';
import type { SearchResultBrowserItem, SearchResultContextMenuState } from './search-page-results';

const SEARCH_RESULT_LIMIT = 25;
const SEARCH_QUERY_DEBOUNCE_MS = 280;
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Recent' },
  { value: 'created_asc', label: 'Oldest' },
  { value: 'name_asc', label: 'A → Z' },
  { value: 'name_desc', label: 'Z → A' },
];
const SEARCH_RETURN_SOURCE = 'search';
const SEARCH_LIST_SEPARATOR = ',';
function getSearchReturnParams({
  query,
  vaultIds,
  tagIds,
  dateFrom,
  dateTo,
  sortBy,
  searchMode,
}: {
  query: string;
  vaultIds: string[];
  tagIds: string[];
  dateFrom: string;
  dateTo: string;
  sortBy: SearchSortBy;
  searchMode: SearchMode;
}) {
  const params: Record<string, string> = {
    source: SEARCH_RETURN_SOURCE,
    sortBy,
  };
  const trimmedQuery = query.trim();

  if (trimmedQuery.length > 0) params.q = trimmedQuery;
  if (vaultIds.length > 0) params.vaultIds = joinSearchList(vaultIds);
  if (tagIds.length > 0) params.tagIds = joinSearchList(tagIds);
  if (dateFrom.length > 0) params.dateFrom = dateFrom;
  if (dateTo.length > 0) params.dateTo = dateTo;
  if (searchMode === 'hybrid' || searchMode === 'keyword') params.searchMode = searchMode;

  return params;
}

function parseSearchList(value: string | undefined) {
  return Array.from(
    new Set(
      (value ?? '')
        .split(SEARCH_LIST_SEPARATOR)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function joinSearchList(values: string[]) {
  return values.join(SEARCH_LIST_SEPARATOR);
}

export function SearchPage() {
  const navigate = useNavigate({ from: ROUTES.search });
  const queryClient = useQueryClient();
  const search = validateSearchRouteSearch(useSearch({ strict: false }));
  const [query, setQuery] = useState(search.q ?? '');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<SearchResultContextMenuState>(null);
  const [renameTarget, setRenameTarget] = useState<SearchResultBrowserItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<SearchResultBrowserItem | null>(null);
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null);
  const [infoTarget, setInfoTarget] = useState<SearchResultBrowserItem | null>(null);
  const [pendingTrashItem, setPendingTrashItem] = useState<SearchResultBrowserItem | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>(
    search.dateFrom || search.dateTo ? 'custom' : 'any',
  );
  const [browserView, setBrowserView] = usePreferredFileBrowserView();
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_QUERY_DEBOUNCE_MS);
  const meQuery = useMeQuery();
  const aiFeaturesEnabled = meQuery.data?.aiFeaturesEnabled === true;

  const selectedVaultIds = useMemo(() => {
    const vaultIds = parseSearchList(search.vaultIds);
    const legacyVaultId = search.vaultId ?? '';

    return vaultIds.length > 0 ? vaultIds : legacyVaultId ? [legacyVaultId] : [];
  }, [search.vaultId, search.vaultIds]);
  const selectedTagIds = useMemo(() => {
    const tagIds = parseSearchList(search.tagIds);
    const legacyTagId = search.tagId ?? '';

    return tagIds.length > 0 ? tagIds : legacyTagId ? [legacyTagId] : [];
  }, [search.tagId, search.tagIds]);
  const dateFrom = search.dateFrom ?? '';
  const dateTo = search.dateTo ?? '';
  const sortBy = search.sortBy ?? 'created_desc';
  const requestedSearchMode = search.searchMode;
  const hasSearchCriteria =
    debouncedQuery.length > 0 ||
    selectedVaultIds.length > 0 ||
    selectedTagIds.length > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0;

  useEffect(() => {
    if ((search.q ?? '') === debouncedQuery) {
      return;
    }

    navigate({
      search: (prev: SearchRouteSearch) => {
        const next: SearchRouteSearch = { ...prev };
        if (debouncedQuery.length > 0) {
          next.q = debouncedQuery;
        } else {
          delete next.q;
        }
        return next;
      },
      replace: true,
    });
  }, [debouncedQuery, navigate, search.q]);

  const vaultsQuery = useVaultsQuery();
  const tagsQuery = useAccessibleTagsQuery();
  const vaults = useMemo(() => vaultsQuery.data?.vaults ?? [], [vaultsQuery.data?.vaults]);
  const tags = useMemo(() => tagsQuery.data?.tags ?? [], [tagsQuery.data?.tags]);
  const fullAiVaultIds = useMemo(
    () =>
      new Set(
        vaults
          .filter((vault) => vault.aiAccessLevel === 'full' || !('aiAccessLevel' in vault))
          .map((vault) => vault.id),
      ),
    [vaults],
  );
  const semanticSearchAvailable =
    aiFeaturesEnabled &&
    (selectedVaultIds.length > 0
      ? selectedVaultIds.every((vaultId) => fullAiVaultIds.has(vaultId))
      : fullAiVaultIds.size > 0 || vaults.length === 0);
  const selectedSearchMode: SearchMode = semanticSearchAvailable
    ? (requestedSearchMode ?? 'hybrid')
    : 'keyword';
  const searchMode: SearchMode =
    selectedSearchMode === 'hybrid' && debouncedQuery.length > 0 ? 'hybrid' : 'keyword';
  const searchQuery = useGlobalSearchDocumentsQuery({
    query: debouncedQuery,
    pageIndex: 0,
    pageSize: SEARCH_RESULT_LIMIT,
    vaultIds: selectedVaultIds.length > 0 ? selectedVaultIds : undefined,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy,
    searchMode,
    enabled: !vaultsQuery.isLoading && hasSearchCriteria,
  });
  const moveVaultId = moveTarget ? getSearchItemVaultId(moveTarget) : '';
  const folderTreeQuery = useFolderTreeQuery({
    vaultId: moveVaultId,
    enabled: moveTarget !== null,
  });
  const moveDestinations = useMemo(
    () => getMoveDestinations({ folders: folderTreeQuery.data?.folders ?? [], target: moveTarget }),
    [folderTreeQuery.data?.folders, moveTarget],
  );

  async function invalidateSearchResultActions() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
    ]);
  }

  const renameMutation = useMutation({
    mutationFn: ({ target, name }: { target: SearchResultBrowserItem; name: string }) =>
      renameDocument({
        vaultId: getSearchItemVaultId(target),
        documentId: target.document.id,
        name,
      }),
    onSuccess: async () => {
      toast.success('Document renamed.');
      setRenameTarget(null);
      setRenameValue('');
      await invalidateSearchResultActions();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename document.');
    },
  });
  const moveMutation = useMutation({
    mutationFn: ({
      target,
      destinationId,
    }: {
      target: SearchResultBrowserItem;
      destinationId: string | null;
    }) =>
      moveDocument({
        vaultId: getSearchItemVaultId(target),
        documentId: target.document.id,
        folderId: destinationId,
      }),
    onSuccess: async () => {
      toast.success('Document moved.');
      setMoveTarget(null);
      setMoveDestinationId(null);
      await invalidateSearchResultActions();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not move document.');
    },
  });
  const trashMutation = useMutation({
    mutationFn: (target: SearchResultBrowserItem) =>
      softDeleteDocument({ vaultId: getSearchItemVaultId(target), documentId: target.document.id }),
    onSuccess: async () => {
      toast.success('Document moved to trash.');
      setPendingTrashItem(null);
      await invalidateSearchResultActions();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not move document to trash.');
    },
  });

  const selectedVaults = useMemo(
    () => vaults.filter((vault) => selectedVaultIds.includes(vault.id)),
    [selectedVaultIds, vaults],
  );
  const selectedTags = useMemo(
    () => tags.filter((tag) => selectedTagIds.includes(tag.id)),
    [selectedTagIds, tags],
  );

  const updateFilters = useCallback(
    (nextValues: Record<string, string>) => {
      navigate({
        search: (prev: SearchRouteSearch) => {
          const next: SearchRouteSearch = { ...prev };
          for (const [key, value] of Object.entries(nextValues)) {
            const searchKey = key as keyof SearchRouteSearch;
            if (value) {
              Object.assign(next, { [searchKey]: value });
            } else {
              delete next[searchKey];
            }
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const resetFilters = useCallback(() => {
    setDatePreset('any');
    updateFilters({
      vaultId: '',
      vaultIds: '',
      tagId: '',
      tagIds: '',
      dateFrom: '',
      dateTo: '',
      sortBy: 'created_desc',
      searchMode: '',
    });
  }, [updateFilters]);

  const setPresetDateFilter = useCallback(
    (value: DatePreset) => {
      setDatePreset(value);

      if (value === 'custom') {
        return;
      }

      const range = buildPresetRange(value);
      updateFilters(range);
    },
    [updateFilters],
  );

  const activeFilters: DocumentSearchControlFilter[] = useMemo(
    () => [
      ...selectedVaults.map((vault) => ({
        key: `vault-${vault.id}`,
        label: vault.name,
        onRemove: () => {
          updateFilters({
            vaultId: '',
            vaultIds: joinSearchList(selectedVaultIds.filter((item) => item !== vault.id)),
          });
        },
      })),
      ...selectedTags.map((tag) => ({
        key: `tag-${tag.id}`,
        label: tag.name,
        onRemove: () => {
          updateFilters({
            tagId: '',
            tagIds: joinSearchList(selectedTagIds.filter((item) => item !== tag.id)),
          });
        },
      })),
      ...(dateFrom || dateTo
        ? [
            {
              key: 'date-range',
              label: getDateFilterLabel({ preset: datePreset, dateFrom, dateTo }),
              onRemove: () => {
                setDatePreset('any');
                updateFilters({ dateFrom: '', dateTo: '' });
              },
            },
          ]
        : []),
    ],
    [
      dateFrom,
      datePreset,
      dateTo,
      selectedTagIds,
      selectedTags,
      selectedVaultIds,
      selectedVaults,
      updateFilters,
    ],
  );
  const hasActiveSearch = !vaultsQuery.isLoading && hasSearchCriteria;
  const results = hasActiveSearch ? (searchQuery.data?.results ?? []) : [];
  const detailSearch = getSearchReturnParams({
    query: debouncedQuery,
    vaultIds: selectedVaultIds,
    tagIds: selectedTagIds,
    dateFrom,
    dateTo,
    sortBy,
    searchMode: selectedSearchMode,
  });
  const canMutateSearchItem = useCallback(
    (item: SearchResultBrowserItem) => {
      const vault = vaults.find((candidate) => candidate.id === getSearchItemVaultId(item));
      return vault?.isAdmin === true || vault?.role === 'owner' || vault?.role === 'editor';
    },
    [vaults],
  );
  const openSearchResultContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>, item: SearchResultBrowserItem) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        item,
        x: Math.min(event.clientX, window.innerWidth - 208),
        y: Math.min(event.clientY, window.innerHeight - 288),
      });
    },
    [],
  );
  const getSearchResultContextMenuEntries = useCallback(
    (item: SearchResultBrowserItem): BrowserContextMenuEntry[] => {
      const vaultId = getSearchItemVaultId(item);
      const canMutate = canMutateSearchItem(item);

      return [
        {
          key: 'open',
          label: 'Preview/open',
          icon: Eye,
          onSelect: () =>
            navigate({
              to: ROUTES.vaultDocument(vaultId, item.document.id),
              search: detailSearch as any,
            }),
        },
        {
          key: 'download',
          label: 'Download',
          icon: Download,
          onSelect: () => downloadSearchResultDocument(item),
        },
        {
          key: 'rename',
          label: 'Rename',
          icon: Pencil,
          disabled: !canMutate,
          onSelect: () => {
            setRenameTarget(item);
            setRenameValue(item.document.name);
          },
        },
        {
          key: 'move',
          label: 'Move to',
          icon: MoveRight,
          disabled: !canMutate,
          onSelect: () => {
            setMoveTarget(item);
            setMoveDestinationId(item.document.folderId);
          },
        },
        {
          key: 'tags',
          label: 'Tags',
          icon: Tags,
          disabled: !canMutate,
          onSelect: () =>
            navigate({
              to: ROUTES.vaultDocumentMetadata(vaultId, item.document.id),
              search: detailSearch as any,
            }),
        },
        {
          key: 'info',
          label: 'Info',
          icon: Info,
          onSelect: () => setInfoTarget(item),
        },
        {
          key: 'trash',
          label: 'Trash',
          icon: Trash2,
          tone: 'destructive',
          disabled: !canMutate || trashMutation.isPending,
          onSelect: () => setPendingTrashItem(item),
        },
      ];
    },
    [canMutateSearchItem, detailSearch, navigate, trashMutation.isPending],
  );

  function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (renameTarget === null || renameValue.trim().length === 0) {
      return;
    }

    renameMutation.mutate({ target: renameTarget, name: renameValue.trim() });
  }

  function handleMoveSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (moveTarget === null) {
      return;
    }

    moveMutation.mutate({ target: moveTarget, destinationId: moveDestinationId });
  }

  function confirmPendingTrash() {
    if (pendingTrashItem === null) {
      return;
    }

    trashMutation.mutate(pendingTrashItem);
  }

  const selectedVaultsLabel = useMemo(() => {
    if (selectedVaults.length === 0) {
      return 'All vaults';
    }

    if (selectedVaults.length <= 2) {
      return selectedVaults.map((vault) => vault.name).join(', ');
    }

    return `${selectedVaults[0].name}, ${selectedVaults[1].name} +${selectedVaults.length - 2}`;
  }, [selectedVaults]);

  const selectedTagsLabel = useMemo(() => {
    if (selectedTags.length === 0) {
      return 'All tags';
    }

    if (selectedTags.length <= 2) {
      return selectedTags.map((tag) => tag.name).join(', ');
    }

    return `${selectedTags[0].name}, ${selectedTags[1].name} +${selectedTags.length - 2}`;
  }, [selectedTags]);

  const setVaultSelection = useCallback(
    (nextVaultIds: string[]) => {
      updateFilters({
        vaultId: '',
        vaultIds: joinSearchList(nextVaultIds),
      });
    },
    [updateFilters],
  );

  const setTagSelection = useCallback(
    (nextTagIds: string[]) => {
      updateFilters({
        tagId: '',
        tagIds: joinSearchList(nextTagIds),
      });
    },
    [updateFilters],
  );

  const setSearchMode = useCallback(
    (value: SearchMode) => {
      updateFilters({
        searchMode: value,
      });
    },
    [updateFilters],
  );
  const filterStateKey = useMemo(
    () =>
      JSON.stringify({
        vaultIds: selectedVaultIds,
        tagIds: selectedTagIds,
        datePreset,
        dateFrom,
        dateTo,
      }),
    [dateFrom, datePreset, dateTo, selectedTagIds, selectedVaultIds],
  );

  const renderSearchControls = useCallback(
    (layout: 'workspace' | 'shell' | 'header') => (
      <DocumentSearchControls
        layout={layout}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search documents..."
        searchAriaLabel="Search documents"
        isFiltersOpen={isFiltersOpen}
        onOpenFilters={() => setIsFiltersOpen(true)}
        onCloseFilters={() => setIsFiltersOpen(false)}
        onResetFilters={resetFilters}
        activeFilterCount={activeFilters.length}
        activeFilters={activeFilters}
        onClearFilters={resetFilters}
        sortBy={sortBy}
        onSortChange={(value) => updateFilters({ sortBy: value })}
        sortOptions={sortOptions}
        sortSelectId="global-search-sort"
        sortAriaLabel="Sort search results"
        sortPlacement="input"
        filtersTitle="Filters"
        filterStateKey={filterStateKey}
        inlineAccessory={
          semanticSearchAvailable ? (
            <SearchModeControl value={selectedSearchMode} onValueChange={setSearchMode} />
          ) : undefined
        }
        trailingAccessory={
          layout === 'header' ? undefined : (
            <HStack flexShrink={0}>
              <FileBrowserViewToggle
                value={browserView}
                onValueChange={setBrowserView}
                size={layout === 'shell' ? 'sm' : 'md'}
              />
            </HStack>
          )
        }
        filtersContent={
          <>
            <SimpleGrid columns={1} gap="4">
              <SearchFilterMultiSelect
                label="Vaults"
                controlSize="toolbar"
                triggerLabel={selectedVaultsLabel}
                triggerAriaLabel="Vault filter"
                searchLabel="Search vaults"
                searchPlaceholder="Search vaults"
                emptyLabel="No vaults found."
                loadingLabel="Loading vaults..."
                options={vaults.map((vault) => ({
                  value: vault.id,
                  label: vault.name,
                }))}
                selectedValues={selectedVaultIds}
                isLoading={vaultsQuery.isLoading}
                onValueChange={setVaultSelection}
                onClear={() => updateFilters({ vaultId: '', vaultIds: '' })}
              />

              <SearchFilterMultiSelect
                label="Tags"
                triggerLabel={selectedTagsLabel}
                triggerAriaLabel="Tags filter"
                searchLabel="Search tags"
                searchPlaceholder="Search tags"
                emptyLabel="No tags found."
                loadingLabel="Loading tags..."
                options={tags.map((tag) => ({
                  value: tag.id,
                  label: tag.name,
                  color: tag.color,
                  meta:
                    typeof tag.documentsCount === 'number'
                      ? `${tag.documentsCount} doc${tag.documentsCount === 1 ? '' : 's'}`
                      : undefined,
                }))}
                selectedValues={selectedTagIds}
                isLoading={tagsQuery.isLoading}
                onValueChange={setTagSelection}
                onClear={() => updateFilters({ tagId: '', tagIds: '' })}
                showColorSwatch
              />
            </SimpleGrid>

            <DatePresetSelector
              idPrefix="global-search-date-filter"
              value={datePreset}
              onValueChange={setPresetDateFilter}
              customDateFrom={dateFrom}
              customDateTo={dateTo}
              onCustomDateFromChange={(nextValue) => {
                setDatePreset('custom');
                updateFilters({ dateFrom: nextValue });
              }}
              onCustomDateToChange={(nextValue) => {
                setDatePreset('custom');
                updateFilters({ dateTo: nextValue });
              }}
            />
          </>
        }
      />
    ),
    [
      activeFilters,
      browserView,
      dateFrom,
      datePreset,
      dateTo,
      filterStateKey,
      isFiltersOpen,
      query,
      resetFilters,
      semanticSearchAvailable,
      selectedSearchMode,
      selectedTagIds,
      selectedTagsLabel,
      selectedVaultIds,
      selectedVaultsLabel,
      setPresetDateFilter,
      setBrowserView,
      setSearchMode,
      setTagSelection,
      setVaultSelection,
      sortBy,
      tagsQuery.isLoading,
      tags,
      updateFilters,
      vaults,
      vaultsQuery.isLoading,
    ],
  );
  const searchHeaderControls = useMemo(
    () => renderSearchControls('header'),
    [renderSearchControls],
  );
  const searchHeaderActions = useMemo(
    () => <FileBrowserViewToggle value={browserView} onValueChange={setBrowserView} size="sm" />,
    [browserView, setBrowserView],
  );
  const workspaceHeader = useMemo(
    () => ({
      left: searchHeaderControls,
      actions: searchHeaderActions,
    }),
    [searchHeaderActions, searchHeaderControls],
  );
  const isInWorkspaceShell = useWorkspaceHeader(workspaceHeader);
  const pageSearchControls = useMemo(
    () => renderSearchControls('workspace'),
    [renderSearchControls],
  );

  return (
    <Flex as="section" h="full" minH="0" direction="column" overflow="hidden" bg="bg.workspace">
      {!isInWorkspaceShell ? pageSearchControls : null}

      <Flex flex="1" minH="0" direction="column" overflow="hidden" bg="bg.workspace">
        {!hasActiveSearch ? (
          <CenteredEmptyState
            title="Search your documents"
            icon={<FileSearch size={32} />}
            colorPalette="teal"
            containerProps={{ flex: '1', minH: '0', px: '6', py: '10' }}
          />
        ) : (
          <Flex flex="1" minH="0" direction="column" overflow="hidden">
            {searchQuery.isError ? (
              <Box px={{ base: '4', lg: '6' }} py="5">
                <Text fontSize="sm" color="fg.error">
                  Unable to search your vaults.
                </Text>
              </Box>
            ) : null}

            {!searchQuery.isLoading && !searchQuery.isError && results.length === 0 ? (
              <CenteredEmptyState
                title="No matches found"
                description="Adjust the query or filters and try again."
                icon={<SearchX size={24} />}
                rounded="lg"
                borderWidth="1px"
                borderStyle="dashed"
                borderColor="border.surface"
                bg="bg.surface"
                p="6"
                containerProps={{
                  flex: '1',
                  minH: '22rem',
                  px: { base: '4', lg: '6' },
                  py: '8',
                }}
              />
            ) : null}

            {results.length > 0 ? (
              browserView === 'list' ? (
                <SearchResultList
                  results={results}
                  detailSearch={detailSearch}
                  onOpenContextMenu={openSearchResultContextMenu}
                  query={debouncedQuery}
                />
              ) : (
                <SearchResultGrid
                  results={results}
                  detailSearch={detailSearch}
                  onOpenContextMenu={openSearchResultContextMenu}
                />
              )
            ) : null}
          </Flex>
        )}
      </Flex>
      <RenameItemDialog
        open={renameTarget !== null}
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
        open={moveTarget !== null}
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
        open={infoTarget !== null}
        target={infoTarget}
        folderPath={
          (infoTarget?.document as SearchResultBrowserItem['document'] | undefined)?.vaultName ??
          'Search result'
        }
        onClose={() => setInfoTarget(null)}
      />
      <SearchTrashConfirmDialog
        item={pendingTrashItem}
        isPending={trashMutation.isPending}
        onClose={() => setPendingTrashItem(null)}
        onConfirm={confirmPendingTrash}
      />
      {contextMenu !== null ? (
        <BrowserContextMenu
          state={contextMenu}
          actions={getSearchResultContextMenuEntries(contextMenu.item)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </Flex>
  );
}
