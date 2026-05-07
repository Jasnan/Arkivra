import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import {
  Check,
  ChevronDown,
  Folder,
  FolderOpen,
  Search as SearchIcon,
  Settings2,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  PageIntro,
  SurfacePanel,
} from '@/components/layout/vault-ui';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { softDeleteDocument } from '@/features/documents/documents.api';
import { DatePresetSelector } from '@/features/documents/components/date-preset-selector';
import type { DatePreset } from '@/features/documents/components/date-preset-selector';
import {
  DocumentLibraryHeader,
  DocumentLibraryRow,
} from '@/features/documents/components/document-library-list';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { DocumentSearchControls } from '@/features/documents/components/document-search-controls';
import { searchQueryKeys, useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchResultItem, SearchSortBy } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useAccessibleTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 100;

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

function VaultIcon() {
  return (
    <Flex boxSize="12" align="center" justify="center" rounded="lg" bg="surface.subtle" color="accent.default">
      <Folder size={20} />
    </Flex>
  );
}

function formatVaultRole(role: string | null | undefined) {
  if (role === 'owner') {
    return 'Owner';
  }

  if (role === 'member') {
    return 'Member';
  }

  if (role === 'editor') {
    return 'Editor';
  }

  if (role === 'global_admin') {
    return 'Global admin';
  }

  return 'Access';
}

function handleFilterSearchKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  onArrowDown?: () => void,
) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    event.stopPropagation();
    onArrowDown?.();
    return;
  }

  if (event.key === 'Escape') {
    return;
  }

  event.stopPropagation();
}

export function AllDocumentsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SearchSortBy>('created_desc');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isVaultFilterOpen, setIsVaultFilterOpen] = useState(false);
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [collapsedVaultIds, setCollapsedVaultIds] = useState<string[]>([]);
  const vaultFilterContentRef = useRef<HTMLDivElement | null>(null);
  const tagFilterContentRef = useRef<HTMLDivElement | null>(null);

  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const vaultsQuery = useVaultsQuery();
  const tagScopeVaultId = selectedVaultId || undefined;
  const tagsQuery = useAccessibleTagsQuery({ vaultId: tagScopeVaultId });
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
    pageSize: PAGE_SIZE,
    vaultIds: selectedVaultId ? [selectedVaultId] : undefined,
    tagIds: visibleSelectedTagIds,
    dateFrom: appliedDateRange.dateFrom,
    dateTo: appliedDateRange.dateTo,
    sortBy,
    enabled: !vaultsQuery.isLoading,
  });
  const deleteMutation = useMutation({
    mutationFn: softDeleteDocument,
    onSuccess: async () => {
      toast.success('Document moved to trash.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });

  const filteredVaults = useMemo(() => {
    const normalizedQuery = vaultSearchQuery.trim().toLowerCase();
    const vaults = vaultsQuery.data?.vaults ?? [];

    if (normalizedQuery.length === 0) {
      return vaults;
    }

    return vaults.filter((vault) => vault.name.toLowerCase().includes(normalizedQuery));
  }, [vaultSearchQuery, vaultsQuery.data?.vaults]);

  const filteredTags = useMemo(() => {
    const normalizedQuery = tagSearchQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return availableTags;
    }

    return availableTags.filter((tag) => {
      const haystacks = [tag.name, tag.vaultName ?? ''];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [availableTags, tagSearchQuery]);

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

  const vaultsById = useMemo(
    () => new Map((vaultsQuery.data?.vaults ?? []).map((vault) => [vault.id, vault])),
    [vaultsQuery.data?.vaults],
  );

  const summaryLabel = useMemo(() => {
    const totalDocuments = documentsQuery.data?.resultsCount ?? 0;
    const vaultsShown = groupedDocuments.length;

    return `${totalDocuments} document${totalDocuments === 1 ? '' : 's'} in ${vaultsShown} vault${vaultsShown === 1 ? '' : 's'}`;
  }, [documentsQuery.data?.resultsCount, groupedDocuments.length]);

  const selectedSortLabel =
    sortOptions.find((option) => option.value === sortBy)?.label ?? 'Newest';
  const selectedVault = useMemo(
    () => (vaultsQuery.data?.vaults ?? []).find((vault) => vault.id === selectedVaultId) ?? null,
    [selectedVaultId, vaultsQuery.data?.vaults],
  );

  const activeFilterCount =
    (selectedVaultId ? 1 : 0) + visibleSelectedTagIds.length + (datePreset !== 'any' ? 1 : 0);

  const activeFilters = [
    ...(selectedVault
      ? [
          {
            key: `vault-${selectedVault.id}`,
            label: selectedVault.name,
            onRemove: () => {
              setSelectedVaultId('');
            },
          },
        ]
      : []),
    ...selectedTags.map((tag) => ({
      key: `tag-${tag.id}`,
      label: tag.name,
      onRemove: () => setSelectedTagIds((current) => current.filter((item) => item !== tag.id)),
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
            },
          },
        ]
      : []),
  ];

  function toggleTagSelection(tagId: string) {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId],
    );
  }

  function closeFilters() {
    setIsFiltersOpen(false);
    setIsVaultFilterOpen(false);
    setIsTagFilterOpen(false);
    setVaultSearchQuery('');
    setTagSearchQuery('');
  }

  function clearFilters() {
    setSelectedVaultId('');
    setSelectedTagIds([]);
    setDatePreset('any');
    setCustomDateFrom('');
    setCustomDateTo('');
    setVaultSearchQuery('');
    setTagSearchQuery('');
  }

  function toggleVaultCollapsed(vaultId: string) {
    setCollapsedVaultIds((current) =>
      current.includes(vaultId) ? current.filter((id) => id !== vaultId) : [...current, vaultId],
    );
  }

  function focusFirstFilterItem(container: HTMLDivElement | null) {
    const item = container?.querySelector<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"]',
    );
    item?.focus();
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

  return (
    <Flex as="section" direction="column" gap="8" pb="8">
      <PageIntro
        title="All Documents"
        actions={
          <Flex flexWrap="wrap" align="center" gap="3">
            <Link to="/transfers" style={{ textDecoration: 'none' }}>
              <Flex
                display="inline-flex"
                h="11"
                align="center"
                justify="center"
                gap="2"
                rounded="xl"
                bg="accent.default"
                px="5"
                fontSize="sm"
                fontWeight="semibold"
                color="text.inverse"
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
        onQueryChange={setQuery}
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
        onSortChange={setSortBy}
        sortOptions={sortOptions}
        sortSelectId="documents-sort"
        sortAriaLabel="Sort documents"
        filtersTitle="Filters"
        filtersContent={
          <>
            <Box gap="3">
              <Text fontSize="sm" fontWeight="semibold" color="text.default">Vault</Text>
              <DropdownMenu
                modal={false}
                open={isVaultFilterOpen}
                onOpenChange={(open) => {
                  setIsVaultFilterOpen(open);
                  if (!open) {
                    setVaultSearchQuery('');
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Vault filter"
                    h="10"
                    w="full"
                    justifyContent="space-between"
                    px="4"
                    textAlign="left"
                    fontWeight="medium"
                    shadow="none"
                    mt="3"
                  >
                    <Text truncate fontSize="sm" color="text.default">
                      {selectedVault?.name ?? 'All vaults'}
                    </Text>
                    <Flex
                      shrink={0}
                      align="center"
                      transition="transform 200ms"
                      transform={isVaultFilterOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
                    >
                      <ChevronDown size={16} />
                    </Flex>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  minW="112"
                  p="0"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                >
                  <Box ref={vaultFilterContentRef}>
                    <Box p="2">
                      <Field>
                        <FieldLabel htmlFor="all-documents-search-vaults" srOnly>
                          Search vaults
                        </FieldLabel>
                        <Box position="relative">
                          <Box
                            position="absolute"
                            left="3"
                            top="50%"
                            transform="translateY(-50%)"
                            color="text.muted"
                            pointerEvents="none"
                          >
                            <SearchIcon size={16} />
                          </Box>
                          <Input
                            id="all-documents-search-vaults"
                            aria-label="Search vaults"
                            value={vaultSearchQuery}
                            onChange={(event) => setVaultSearchQuery(event.target.value)}
                            onKeyDown={(event) =>
                              handleFilterSearchKeyDown(event, () =>
                                focusFirstFilterItem(vaultFilterContentRef.current),
                              )
                            }
                            placeholder="Search vaults"
                            h="10"
                            rounded="xl"
                            borderColor="transparent"
                            pl="10"
                            pr="3"
                            focusRing="none"
                            autoFocus
                          />
                        </Box>
                      </Field>
                    </Box>
                    <Separator />
                    <Box maxH="72" overflow="auto" p="2">
                      {vaultsQuery.isLoading ? (
                        <Text px="3" py="3" fontSize="sm" color="text.muted">Loading vaults...</Text>
                      ) : null}
                      {!vaultsQuery.isLoading ? (
                        <DropdownMenuItem
                          bg={!selectedVaultId ? 'surface.subtle' : undefined}
                          color={!selectedVaultId ? 'text.default' : undefined}
                          onSelect={() => {
                            setSelectedVaultId('');
                            setIsVaultFilterOpen(false);
                          }}
                        >
                          <Text flex="1">All vaults</Text>
                          {!selectedVaultId ? <Check size={16} /> : null}
                        </DropdownMenuItem>
                      ) : null}
                      {!vaultsQuery.isLoading && filteredVaults.length === 0 ? (
                        <Text px="3" py="3" fontSize="sm" color="text.muted">No vaults found.</Text>
                      ) : null}
                      {filteredVaults.map((vault) => (
                        <DropdownMenuItem
                          key={vault.id}
                          bg={selectedVaultId === vault.id ? 'surface.subtle' : undefined}
                          color={selectedVaultId === vault.id ? 'text.default' : undefined}
                          onSelect={() => {
                            setSelectedVaultId(vault.id);
                            setIsVaultFilterOpen(false);
                          }}
                        >
                          <Text flex="1" truncate>{vault.name}</Text>
                          {selectedVaultId === vault.id ? (
                            <Check size={16} />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </Box>
                  </Box>
                </DropdownMenuContent>
              </DropdownMenu>
            </Box>

            <Box gap="4">
              <Text fontSize="sm" fontWeight="semibold" color="text.default">Tags</Text>
              <DropdownMenu
                modal={false}
                open={isTagFilterOpen}
                onOpenChange={(open) => {
                  setIsTagFilterOpen(open);
                  if (!open) {
                    setTagSearchQuery('');
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Tags filter"
                    h="10"
                    w="full"
                    justifyContent="space-between"
                    px="4"
                    textAlign="left"
                    fontWeight="medium"
                    shadow="none"
                    mt="3"
                  >
                    <Text truncate fontSize="sm" color="text.default">
                      {selectedTagsLabel}
                    </Text>
                    <Flex
                      shrink={0}
                      align="center"
                      transition="transform 200ms"
                      transform={isTagFilterOpen ? 'rotate(180deg)' : 'rotate(0deg)'}
                    >
                      <ChevronDown size={16} />
                    </Flex>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  minW="112"
                  p="0"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                >
                  <Box ref={tagFilterContentRef}>
                    <Box p="2">
                      <Field>
                        <FieldLabel htmlFor="all-documents-search-tags" srOnly>
                          Search tags
                        </FieldLabel>
                        <Box position="relative">
                          <Box
                            position="absolute"
                            left="3"
                            top="50%"
                            transform="translateY(-50%)"
                            color="text.muted"
                            pointerEvents="none"
                          >
                            <SearchIcon size={16} />
                          </Box>
                          <Input
                            id="all-documents-search-tags"
                            aria-label="Search tags"
                            value={tagSearchQuery}
                            onChange={(event) => {
                              setTagSearchQuery(event.target.value);
                            }}
                            onKeyDown={(event) =>
                              handleFilterSearchKeyDown(event, () =>
                                focusFirstFilterItem(tagFilterContentRef.current),
                              )
                            }
                            placeholder="Search tags"
                            h="10"
                            rounded="xl"
                            borderColor="transparent"
                            pl="10"
                            pr="3"
                            focusRing="none"
                            autoFocus
                          />
                        </Box>
                      </Field>
                    </Box>
                    <Separator />
                    <Box maxH="72" overflow="auto" p="2">
                      {tagsQuery.isLoading ? (
                        <Text px="3" py="3" fontSize="sm" color="text.muted">Loading tags...</Text>
                      ) : null}
                      {!tagsQuery.isLoading && availableTags.length === 0 ? (
                        <Text px="3" py="3" fontSize="sm" color="text.muted">No tags found.</Text>
                      ) : null}
                      {!tagsQuery.isLoading &&
                      availableTags.length > 0 &&
                      filteredTags.length === 0 ? (
                        <Text px="3" py="3" fontSize="sm" color="text.muted">No tags found.</Text>
                      ) : null}
                      {filteredTags.map((tag) => {
                        const isSelected = selectedTagIds.includes(tag.id);

                        return (
                          <DropdownMenuCheckboxItem
                            key={tag.id}
                            checked={isSelected}
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={() => toggleTagSelection(tag.id)}
                          >
                            <Flex minW="0" flex="1" align="center" gap="3">
                              <Box
                                boxSize="2.5"
                                rounded="full"
                                bg={tag.color ?? 'text.muted'}
                                aria-hidden="true"
                              />
                              <Text truncate>{tag.name}</Text>
                            </Flex>
                            {typeof tag.documentsCount === 'number' ? (
                              <Text ml="auto" fontSize="xs" color="text.muted">
                                {tag.documentsCount} doc{tag.documentsCount === 1 ? '' : 's'}
                              </Text>
                            ) : null}
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </Box>
                  </Box>
                </DropdownMenuContent>
              </DropdownMenu>
            </Box>

            <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="surface.default" p="4">
              <Text fontSize="sm" fontWeight="semibold" color="text.default">Date</Text>

              <DatePresetSelector
                idPrefix="documents-date-filter"
                value={datePreset}
                onValueChange={setDatePreset}
                customDateFrom={customDateFrom}
                customDateTo={customDateTo}
                onCustomDateFromChange={(nextValue) => {
                  setCustomDateFrom(nextValue);

                  if (customDateTo && nextValue && nextValue > customDateTo) {
                    setCustomDateTo(nextValue);
                  }
                }}
                onCustomDateToChange={(nextValue) => {
                  setCustomDateTo(nextValue);

                  if (customDateFrom && nextValue && nextValue < customDateFrom) {
                    setCustomDateFrom(nextValue);
                  }
                }}
              />
            </Box>
          </>
        }
      />

      <Flex direction={{ base: 'column', sm: 'row' }} align={{ sm: 'center' }} justify={{ sm: 'space-between' }}>
        <Text fontSize="lg" fontWeight="semibold" color="text.default">{summaryLabel}</Text>
        <Badge variant="secondary" rounded="lg" px="3" py="1.5" fontSize="sm" fontWeight="medium">
          {selectedSortLabel}
        </Badge>
      </Flex>

      {vaultsQuery.isLoading ? (
        <Text fontSize="sm" color="text.muted">Loading vaults...</Text>
      ) : null}
      {vaultsQuery.isError ? (
        <Text fontSize="sm" color="status.danger">Unable to load vaults.</Text>
      ) : null}
      {documentsQuery.isLoading ? (
        <Text fontSize="sm" color="text.muted">Loading documents...</Text>
      ) : null}
      {documentsQuery.isError ? (
        <Text fontSize="sm" color="status.danger">Unable to load your document library.</Text>
      ) : null}

      {!documentsQuery.isLoading && (documentsQuery.data?.results.length ?? 0) === 0 ? (
        <SurfacePanel>
          <Text fontSize="sm" color="text.muted">
            No documents matched the current search and filter combination.
          </Text>
        </SurfacePanel>
      ) : null}

      <Flex direction="column" gap="5">
        {groupedDocuments.map((group) => {
          const vault = vaultsById.get(group.vaultId);
          const isCollapsed = collapsedVaultIds.includes(group.vaultId);

          return (
            <SurfacePanel key={group.vaultId} rounded="lg" p="0">
              <Flex borderBottomWidth="1px" borderColor="border.subtle" px={{ base: '5', sm: '6' }} py="5">
                <Flex align="flex-start" gap="4" w="full">
                  <VaultIcon />
                  <Box minW="0" flex="1">
                    <chakra.button
                      type="button"
                      display="flex"
                      w="full"
                      alignItems="flex-start"
                      justifyContent="space-between"
                      gap="4"
                      textAlign="left"
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleVaultCollapsed(group.vaultId)}
                    >
                      <Box minW="0">
                        <Flex flexWrap="wrap" align="baseline" gap="3">
                          <Text truncate fontSize="base" fontWeight="semibold" color="text.default">
                            {group.vaultName}
                          </Text>
                          <Text fontSize="sm" color="text.muted">
                            {group.documents.length} document
                            {group.documents.length === 1 ? '' : 's'}
                          </Text>
                        </Flex>
                        <Text mt="1" display="block" fontSize="sm" color="text.muted">
                          {formatVaultRole(vault?.role ?? 'global_admin')}
                        </Text>
                      </Box>
                      <Flex
                        mt="1"
                        shrink={0}
                        align="center"
                        transition="transform 200ms"
                        transform={isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'}
                      >
                        <ChevronDown size={20} />
                      </Flex>
                    </chakra.button>
                  </Box>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <ActionMenuTriggerButton
                        label={`Open actions for ${group.vaultName}`}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" minW="56">
                      <DropdownMenuItem asChild>
                        <Link to={`/vaults/${group.vaultId}/documents`}>
                          <ActionMenuItemIcon icon={FolderOpen} />
                          Open vault
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={`/vaults/${group.vaultId}/settings`}>
                          <ActionMenuItemIcon icon={Settings2} />
                          Vault settings
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Flex>
              </Flex>

              {!isCollapsed ? (
                <>
                  <DocumentLibraryHeader />

                  <Flex direction="column" divideY="1px" divideColor="border.subtle">
                    {group.documents.map((result) => (
                      <DocumentLibraryRow
                        key={result.documentId}
                        name={result.name}
                        originalName={result.originalName}
                        mimeType={result.mimeType}
                        originalSize={result.originalSize}
                        createdAt={result.createdAt}
                        updatedAt={result.updatedAt}
                        tags={result.tags}
                        snippet={
                          debouncedQuery.length > 0 && result.bestChunk
                            ? tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                                part.highlighted ? (
                                  <Box
                                    as="mark"
                                    key={`${result.documentId}-${part.key}`}
                                    rounded="md"
                                    bg="accent.subtle"
                                    px="1.5"
                                    py="0.5"
                                    color="text.default"
                                  >
                                    {part.text}
                                  </Box>
                                ) : (
                                  <Text as="span" key={`${result.documentId}-${part.key}`}>
                                    {part.text}
                                  </Text>
                                ),
                              )
                            : undefined
                        }
                        vaultId={result.vaultId}
                        documentId={result.documentId}
                        documentLink={`/documents/${result.vaultId}/${result.documentId}`}
                        onDelete={() => {
                          deleteMutation.mutate({
                            vaultId: result.vaultId,
                            documentId: result.documentId,
                          });
                        }}
                        deleteDisabled={deleteMutation.isPending}
                      />
                    ))}
                  </Flex>
                </>
              ) : null}
            </SurfacePanel>
          );
        })}
      </Flex>
    </Flex>
  );
}
