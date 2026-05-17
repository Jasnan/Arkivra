import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActionBar, Box, Collapsible, Flex, Portal, Text, chakra } from '@chakra-ui/react';
import {
  ChevronDown,
  Folder,
  FolderOpen,
  Settings2,
  Upload,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import {
  PageIntro,
  SurfacePanel,
} from '@/components/layout/vault-ui';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { getDocumentDownloadUrl, softDeleteDocument } from '@/features/documents/documents.api';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import {
  DocumentLibraryTable,
} from '@/features/documents/components/document-library-list';
import { getDocumentSelectionKey } from '@/features/documents/components/document-library-utils';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import {
  DocumentSearchControls,
  SearchFilterMultiSelect,
} from '@/features/documents/components/document-search-controls';
import { searchQueryKeys, useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchResultItem, SearchSortBy } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useAccessibleTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const SEARCH_PAGE_SIZE = 100;
const VAULT_PAGE_SIZE = 8;

const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest upload' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
];

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

function formatVaultRole(role: string | null | undefined) {
  if (role === 'owner') {
    return 'Owner';
  }

  if (role === 'editor') {
    return 'Editor';
  }

  if (role === 'viewer') {
    return 'Viewer';
  }

  return 'Root governance';
}

export function AllDocumentsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SearchSortBy>('created_desc');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [collapsedVaultIds, setCollapsedVaultIds] = useState<string[]>([]);
  const [vaultPageIndexes, setVaultPageIndexes] = useState<Record<string, number>>({});
  const [selectedDocumentKeys, setSelectedDocumentKeys] = useState<string[]>([]);

  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const vaultsQuery = useVaultsQuery();
  const tagsQuery = useAccessibleTagsQuery();
  const availableTags = useMemo(() => tagsQuery.data?.tags ?? [], [tagsQuery.data?.tags]);

  const appliedDateRange = useMemo(() => {
    if (datePreset === 'custom') {
      return {
        dateFrom: customDateFrom || undefined,
        dateTo: customDateTo || undefined,
      };
    }

    return buildPresetRange(datePreset);
  }, [customDateFrom, customDateTo, datePreset]);

  const availableTagIds = useMemo(
    () => new Set(availableTags.map((tag) => tag.id)),
    [availableTags],
  );
  const visibleSelectedTagIds = useMemo(
    () => selectedTagIds.filter((tagId) => availableTagIds.has(tagId)),
    [availableTagIds, selectedTagIds],
  );

  const selectedTags = useMemo(
    () => availableTags.filter((tag) => visibleSelectedTagIds.includes(tag.id)),
    [availableTags, visibleSelectedTagIds],
  );

  const documentsQuery = useGlobalSearchDocumentsQuery({
    query: debouncedQuery,
    pageIndex: 0,
    pageSize: SEARCH_PAGE_SIZE,
    vaultIds: selectedVaultIds.length > 0 ? selectedVaultIds : undefined,
    tagIds: visibleSelectedTagIds,
    dateFrom: appliedDateRange.dateFrom,
    dateTo: appliedDateRange.dateTo,
    sortBy,
    enabled: !vaultsQuery.isLoading,
  });
  async function invalidateDocumentQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
      queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
    ]);
  }

  const deleteMutation = useMutation({
    mutationFn: async (documents: Array<{ vaultId: string; documentId: string }>) =>
      Promise.all(documents.map((document) => softDeleteDocument(document))),
    onSuccess: async (_data, documents) => {
      const deletedKeys = new Set(
        documents.map((document) =>
          getDocumentSelectionKey(document.vaultId, document.documentId),
        ),
      );

      toast.success(
        documents.length === 1
          ? 'Document moved to trash.'
          : `${documents.length} documents moved to trash.`,
      );
      setSelectedDocumentKeys((current) => {
        return current.filter((key) => !deletedKeys.has(key));
      });
      await invalidateDocumentQueries();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });

  const groupedDocuments = useMemo(() => {
    const groups = new Map<
      string,
      { vaultId: string; vaultName: string; documents: SearchResultItem[] }
    >();

    for (const result of documentsQuery.data?.results ?? []) {
      if (!groups.has(result.vaultId)) {
        groups.set(result.vaultId, {
          vaultId: result.vaultId,
          vaultName: result.vaultName,
          documents: [],
        });
      }

      groups.get(result.vaultId)?.documents.push(result);
    }

    const vaultOrder = new Map(
      (vaultsQuery.data?.vaults ?? []).map((vault, index) => [vault.id, index]),
    );

    return Array.from(groups.values()).sort((left, right) => {
      const leftOrder = vaultOrder.get(left.vaultId);
      const rightOrder = vaultOrder.get(right.vaultId);

      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }

      if (leftOrder !== undefined) {
        return -1;
      }

      if (rightOrder !== undefined) {
        return 1;
      }

      return left.vaultName.localeCompare(right.vaultName);
    });
  }, [documentsQuery.data?.results, vaultsQuery.data?.vaults]);

  const paginatedGroups = useMemo(
    () =>
      groupedDocuments.map((group) => {
        const pageCount = Math.max(1, Math.ceil(group.documents.length / VAULT_PAGE_SIZE));
        const pageIndex = Math.min(vaultPageIndexes[group.vaultId] ?? 0, pageCount - 1);
        const pageDocuments = group.documents.slice(
          pageIndex * VAULT_PAGE_SIZE,
          (pageIndex + 1) * VAULT_PAGE_SIZE,
        );

        return {
          ...group,
          pageCount,
          pageIndex,
          pageDocuments,
        };
      }),
    [groupedDocuments, vaultPageIndexes],
  );

  const vaultsById = useMemo(
    () => new Map((vaultsQuery.data?.vaults ?? []).map((vault) => [vault.id, vault])),
    [vaultsQuery.data?.vaults],
  );

  const visibleDocumentKeys = useMemo(
    () => paginatedGroups.flatMap((group) =>
      group.pageDocuments.map((document) =>
        getDocumentSelectionKey(document.vaultId, document.documentId),
      ),
    ),
    [paginatedGroups],
  );

  const selectedDocuments = useMemo(() => {
    const documentsByKey = new Map(
      paginatedGroups.flatMap((group) =>
        group.pageDocuments.map((document) => [
          getDocumentSelectionKey(document.vaultId, document.documentId),
          document,
        ]),
      ),
    );

    return selectedDocumentKeys
      .map((key) => documentsByKey.get(key))
      .filter((document): document is SearchResultItem => Boolean(document));
  }, [paginatedGroups, selectedDocumentKeys]);

  useEffect(() => {
    const visibleKeySet = new Set(visibleDocumentKeys);
    setSelectedDocumentKeys((current) => current.filter((key) => visibleKeySet.has(key)));
  }, [visibleDocumentKeys]);

  const summaryLabel = useMemo(() => {
    const totalDocuments = documentsQuery.data?.resultsCount ?? 0;
    const vaultsShown = groupedDocuments.length;

    return `${totalDocuments} document${totalDocuments === 1 ? '' : 's'} in ${vaultsShown} vault${vaultsShown === 1 ? '' : 's'}`;
  }, [documentsQuery.data?.resultsCount, groupedDocuments.length]);

  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? 'Newest';
  const selectedVaults = useMemo(
    () => (vaultsQuery.data?.vaults ?? []).filter((vault) => selectedVaultIds.includes(vault.id)),
    [selectedVaultIds, vaultsQuery.data?.vaults],
  );

  const activeFilterCount =
    selectedVaultIds.length + visibleSelectedTagIds.length + (datePreset !== 'any' ? 1 : 0);

  const activeFilters = [
    ...selectedVaults.map((vault) => ({
      key: `vault-${vault.id}`,
      label: vault.name,
      onRemove: () => {
        setSelectedVaultIds((current) => current.filter((item) => item !== vault.id));
        setVaultPageIndexes({});
      },
    })),
    ...selectedTags.map((tag) => ({
      key: `tag-${tag.id}`,
      label: tag.name,
      onRemove: () => {
        setSelectedTagIds((current) => current.filter((item) => item !== tag.id));
        setVaultPageIndexes({});
      },
    })),
    ...(datePreset !== 'any'
      ? [
          {
            key: `date-${datePreset}`,
            label: getDateFilterLabel({
              preset: datePreset,
              dateFrom: appliedDateRange.dateFrom,
              dateTo: appliedDateRange.dateTo,
            }),
            onRemove: () => {
              setDatePreset('any');
              setCustomDateFrom('');
              setCustomDateTo('');
              setVaultPageIndexes({});
            },
          },
        ]
      : []),
  ];

  function closeFilters() {
    setIsFiltersOpen(false);
  }

  function clearFilters() {
    setSelectedVaultIds([]);
    setSelectedTagIds([]);
    setDatePreset('any');
    setCustomDateFrom('');
    setCustomDateTo('');
    setVaultPageIndexes({});
  }

  function setVaultPageIndex(vaultId: string, pageIndex: number) {
    setVaultPageIndexes((current) => ({
      ...current,
      [vaultId]: pageIndex,
    }));
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

      const groupKeySet = new Set(selectionKeys);
      return current.filter((key) => !groupKeySet.has(key));
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

  const selectedTagsLabel = useMemo(() => {
    if (selectedTags.length === 0) {
      return 'All tags';
    }

    if (selectedTags.length <= 2) {
      return selectedTags.map((tag) => tag.name).join(', ');
    }

    return `${selectedTags[0].name}, ${selectedTags[1].name} +${selectedTags.length - 2}`;
  }, [selectedTags]);

  const selectedVaultsLabel = useMemo(() => {
    if (selectedVaults.length === 0) {
      return 'All vaults';
    }

    if (selectedVaults.length <= 2) {
      return selectedVaults.map((vault) => vault.name).join(', ');
    }

    return `${selectedVaults[0].name}, ${selectedVaults[1].name} +${selectedVaults.length - 2}`;
  }, [selectedVaults]);

  return (
    <Flex as="section" direction="column" gap="8" pb="8">
      <PageIntro
        title="All Documents"
        actions={
          <Flex flexWrap="wrap" align="center" gap="3">
            <Link to={ROUTES.transfers} style={{ textDecoration: 'none' }}>
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
          </Flex>
        }
      />
      <DocumentSearchControls
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          setVaultPageIndexes({});
        }}
        searchPlaceholder="Search documents"
        searchAriaLabel="Search documents"
        isFiltersOpen={isFiltersOpen}
        onOpenFilters={() => setIsFiltersOpen(true)}
        onCloseFilters={closeFilters}
        onResetFilters={clearFilters}
        activeFilterCount={activeFilterCount}
        activeFilters={activeFilters}
        onClearFilters={clearFilters}
        sortBy={sortBy}
        onSortChange={(value) => {
          setSortBy(value);
          setVaultPageIndexes({});
        }}
        sortOptions={sortOptions}
        sortSelectId="documents-sort"
        sortAriaLabel="Sort documents"
        filtersTitle="Filters"
        filtersContent={
          <>
            <SearchFilterMultiSelect
              label="Vaults"
              triggerLabel={selectedVaultsLabel}
              triggerAriaLabel="Vault filter"
              searchLabel="Search vaults"
              searchPlaceholder="Search vaults"
              emptyLabel="No vaults found."
              loadingLabel="Loading vaults..."
              options={(vaultsQuery.data?.vaults ?? []).map((vault) => ({
                value: vault.id,
                label: vault.name,
              }))}
              selectedValues={selectedVaultIds}
              isLoading={vaultsQuery.isLoading}
              onValueChange={(values) => {
                setSelectedVaultIds(values);
                setVaultPageIndexes({});
              }}
              onClear={() => {
                setSelectedVaultIds([]);
                setVaultPageIndexes({});
              }}
            />

            <SearchFilterMultiSelect
              label="Tags"
              triggerLabel={selectedTagsLabel}
              triggerAriaLabel="Tags filter"
              searchLabel="Search tags"
              searchPlaceholder="Search tags"
              emptyLabel="No tags found."
              loadingLabel="Loading tags..."
              options={availableTags.map((tag) => ({
                value: tag.id,
                label: tag.name,
                color: tag.color,
                meta: typeof tag.documentsCount === 'number'
                  ? `${tag.documentsCount} doc${tag.documentsCount === 1 ? '' : 's'}`
                  : undefined,
              }))}
              selectedValues={visibleSelectedTagIds}
              isLoading={tagsQuery.isLoading}
              onValueChange={(values) => {
                setSelectedTagIds(values);
                setVaultPageIndexes({});
              }}
              onClear={() => {
                setSelectedTagIds([]);
                setVaultPageIndexes({});
              }}
              showColorSwatch
            />

            <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="4">
              <Text fontSize="sm" fontWeight="semibold" color="fg">Uploaded date</Text>

              <DatePresetSelector
                idPrefix="documents-date-filter"
                value={datePreset}
                onValueChange={(value) => {
                  setDatePreset(value);
                  setVaultPageIndexes({});
                }}
                customDateFrom={customDateFrom}
                customDateTo={customDateTo}
                onCustomDateFromChange={(nextValue) => {
                  setCustomDateFrom(nextValue);

                  if (customDateTo && nextValue && nextValue > customDateTo) {
                    setCustomDateTo(nextValue);
                  }

                  setVaultPageIndexes({});
                }}
                onCustomDateToChange={(nextValue) => {
                  setCustomDateTo(nextValue);

                  if (customDateFrom && nextValue && nextValue < customDateFrom) {
                    setCustomDateFrom(nextValue);
                  }

                  setVaultPageIndexes({});
                }}
              />
            </Box>
          </>
        }
      />

      <Flex direction={{ base: 'column', sm: 'row' }} align={{ sm: 'center' }} justify={{ sm: 'space-between' }}>
        <Text fontSize="lg" fontWeight="semibold" color="fg">{summaryLabel}</Text>
        <Badge variant="secondary" rounded="lg" px="3" py="1.5" fontSize="sm" fontWeight="medium">
          {selectedSortLabel}
        </Badge>
      </Flex>

      {vaultsQuery.isLoading ? (
        <Text fontSize="sm" color="fg.muted">Loading vaults...</Text>
      ) : null}
      {vaultsQuery.isError ? (
        <Text fontSize="sm" color="fg.error">Unable to load vaults.</Text>
      ) : null}
      {documentsQuery.isLoading ? (
        <Text fontSize="sm" color="fg.muted">Loading documents...</Text>
      ) : null}
      {documentsQuery.isError ? (
        <Text fontSize="sm" color="fg.error">Unable to load your document library.</Text>
      ) : null}

      {!documentsQuery.isLoading && (documentsQuery.data?.results.length ?? 0) === 0 ? (
        <SurfacePanel>
          <Text fontSize="sm" color="fg.muted">
            No documents matched the current search and filter combination.
          </Text>
        </SurfacePanel>
      ) : null}

      <Flex direction="column" gap="5">
        {paginatedGroups.map((group) => {
          const vault = vaultsById.get(group.vaultId);
          const isCollapsed = collapsedVaultIds.includes(group.vaultId);

          return (
            <SurfacePanel key={group.vaultId} rounded="lg" p="0">
              <Collapsible.Root
                open={!isCollapsed}
                onOpenChange={(event) => {
                  const nextCollapsed = !event.open;
                  setCollapsedVaultIds((current) => {
                    const hasVault = current.includes(group.vaultId);

                    if (nextCollapsed && !hasVault) {
                      return [...current, group.vaultId];
                    }

                    if (!nextCollapsed && hasVault) {
                      return current.filter((id) => id !== group.vaultId);
                    }

                    return current;
                  });
                }}
              >
                <Flex borderBottomWidth="1px" borderColor="border.subtle" px={{ base: '4', sm: '5' }} py="var(--arkivra-listHeaderPaddingY, 0.75rem)">
                  <Flex align="center" gap="2.5" w="full">
                    <Flex w="10" ml="-1" justify="center" color="teal.solid" aria-hidden="true">
                      <Folder size={18} />
                    </Flex>
                    <Box minW="0" flex="1">
                      <Collapsible.Trigger asChild>
                        <chakra.button
                          type="button"
                          display="flex"
                          w="full"
                          alignItems="center"
                          justifyContent="space-between"
                          gap="3"
                          textAlign="left"
                        >
                          <Flex minW="0" flexWrap="wrap" align="baseline" gap="2">
                            <Text truncate fontSize="sm" fontWeight="semibold" color="fg">
                              {group.vaultName}
                            </Text>
                            <Text fontSize="xs" color="fg.muted">
                              {formatVaultRole(vault?.role)}
                            </Text>
                            <Text fontSize="xs" color="fg.muted">
                              {group.documents.length} document
                              {group.documents.length === 1 ? '' : 's'}
                            </Text>
                          </Flex>
                          <Flex
                            shrink={0}
                            align="center"
                            transition="transform 200ms"
                            transform={isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'}
                          >
                            <ChevronDown size={18} />
                          </Flex>
                        </chakra.button>
                      </Collapsible.Trigger>
                    </Box>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <ActionMenuTriggerButton
                          label={`Open actions for ${group.vaultName}`}
                          h="8"
                          w="8"
                          onClick={(event) => event.stopPropagation()}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" minW="56">
                        <DropdownMenuItem asChild>
                          <Link to={ROUTES.vaultRoot(group.vaultId)}>
                            <ActionMenuItemIcon icon={FolderOpen} />
                            Open vault
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={ROUTES.vaultSettings(group.vaultId)}>
                            <ActionMenuItemIcon icon={Settings2} />
                            Vault settings
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Flex>
                </Flex>

                <Collapsible.Content>
                  <DocumentLibraryTable
                    vaultName={group.vaultName}
                    documents={group.pageDocuments.map((result) => ({
                      documentId: result.documentId,
                      vaultId: result.vaultId,
                      name: result.name,
                      originalName: result.originalName,
                      mimeType: result.mimeType,
                      originalSize: result.originalSize,
                      createdAt: result.createdAt,
                      updatedAt: result.updatedAt,
                      tags: result.tags,
                      snippet: debouncedQuery.length > 0 && result.bestChunk
                        ? tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                            part.highlighted ? (
                              <Box
                                as="mark"
                                key={`${result.documentId}-${part.key}`}
                                rounded="md"
                                bg="teal.subtle"
                                px="1.5"
                                py="0.5"
                                color="fg"
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
                      documentLink: ROUTES.vaultDocument(result.vaultId, result.documentId),
                    }))}
                    selectedDocumentKeys={selectedDocumentKeys}
                    onToggleDocument={toggleDocumentSelection}
                    onToggleAllDocuments={toggleAllDocumentSelection}
                  />
                  {group.documents.length > 0 ? (
                    <>
                      <Separator />
                      <Flex
                        direction={{ base: 'column', sm: 'row' }}
                        gap="2"
                        px="4"
                        py="var(--arkivra-listHeaderPaddingY, 0.75rem)"
                        alignItems={{ sm: 'center' }}
                        justifyContent={{ sm: 'space-between' }}
                      >
                        <Text fontSize="xs" color="fg.muted">
                          Page {group.pageIndex + 1} of {group.pageCount}
                        </Text>
                        <Flex gap="2">
                          <Button
                            size="xs"
                            type="button"
                            variant="outline"
                            disabled={group.pageIndex === 0}
                            onClick={() =>
                              setVaultPageIndex(group.vaultId, Math.max(0, group.pageIndex - 1))
                            }
                          >
                            Previous
                          </Button>
                          <Button
                            size="xs"
                            type="button"
                            variant="outline"
                            disabled={group.pageIndex >= group.pageCount - 1}
                            onClick={() =>
                              setVaultPageIndex(
                                group.vaultId,
                                Math.min(group.pageCount - 1, group.pageIndex + 1),
                              )
                            }
                          >
                            Next
                          </Button>
                        </Flex>
                      </Flex>
                    </>
                  ) : null}
                </Collapsible.Content>
              </Collapsible.Root>
            </SurfacePanel>
          );
        })}
      </Flex>

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
