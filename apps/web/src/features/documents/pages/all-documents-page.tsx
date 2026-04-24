import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange,
  Check,
  ChevronDown,
  Ellipsis,
  Folder,
  FolderOpen,
  Search as SearchIcon,
  Settings2,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  PageIntro,
  StatusBanner,
  SurfacePanel,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { softDeleteDocument } from '@/features/documents/documents.api';
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
import { cn } from '@/lib/utils';

const PAGE_SIZE = 100;

const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest upload' },
  { value: 'name_asc', label: 'Name (A-Z)' },
  { value: 'name_desc', label: 'Name (Z-A)' },
];

type DatePreset = 'any' | 'last_7_days' | 'last_30_days' | 'custom';

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
    <div className="flex size-12 items-center justify-center rounded-lg bg-secondary text-primary ring-1 ring-border/60">
      <Folder className="size-5" />
    </div>
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const vaultFilterContentRef = useRef<HTMLDivElement | null>(null);
  const tagFilterContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isFiltersOpen) {
      setIsVaultFilterOpen(false);
      setIsTagFilterOpen(false);
      setVaultSearchQuery('');
      setTagSearchQuery('');
    }
  }, [isFiltersOpen]);

  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const vaultsQuery = useVaultsQuery();
  const tagScopeVaultId = selectedVaultId || undefined;
  const tagsQuery = useAccessibleTagsQuery({ vaultId: tagScopeVaultId });

  const appliedDateRange = useMemo(() => {
    if (datePreset === 'custom') {
      return {
        dateFrom: customDateFrom || undefined,
        dateTo: customDateTo || undefined,
      };
    }

    return buildPresetRange(datePreset);
  }, [customDateFrom, customDateTo, datePreset]);

  const documentsQuery = useGlobalSearchDocumentsQuery({
    query: debouncedQuery,
    pageIndex: 0,
    pageSize: PAGE_SIZE,
    vaultIds: selectedVaultId ? [selectedVaultId] : undefined,
    tagIds: selectedTagIds,
    dateFrom: appliedDateRange.dateFrom,
    dateTo: appliedDateRange.dateTo,
    sortBy,
    enabled: !vaultsQuery.isLoading,
  });
  const deleteMutation = useMutation({
    mutationFn: softDeleteDocument,
    onSuccess: async () => {
      setStatusMessage('Document moved to trash.');
      setErrorMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete document.');
      setStatusMessage(null);
    },
  });

  const availableTags = tagsQuery.data?.tags ?? [];
  const availableTagIds = useMemo(
    () => new Set(availableTags.map((tag) => tag.id)),
    [availableTags],
  );

  useEffect(() => {
    setSelectedTagIds((current) => {
      const next = current.filter((tagId) => availableTagIds.has(tagId));
      return next.length === current.length ? current : next;
    });
  }, [availableTagIds]);

  const selectedTags = useMemo(
    () => availableTags.filter((tag) => selectedTagIds.includes(tag.id)),
    [availableTags, selectedTagIds],
  );

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
    (selectedVaultId ? 1 : 0) + selectedTagIds.length + (datePreset !== 'any' ? 1 : 0);

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
    <section className="space-y-8 pb-8">
      <PageIntro
        title="Documents"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/transfers"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              <Upload className="size-4" />
              Upload
            </Link>
          </div>
        }
      />

      {statusMessage || errorMessage ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <DocumentSearchControls
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search documents"
        searchAriaLabel="Search documents"
        isFiltersOpen={isFiltersOpen}
        onOpenFilters={() => setIsFiltersOpen(true)}
        onCloseFilters={() => setIsFiltersOpen(false)}
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
            <div className="space-y-3">
              <span className="text-sm font-semibold text-foreground">Vault</span>
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
                  <button
                    type="button"
                    aria-label="Vault filter"
                    className={`${vaultInputClassName} flex h-10 w-full items-center justify-between gap-3 rounded-lg border-border/70 bg-background px-4 text-left`}
                  >
                    <span className="truncate text-sm text-foreground">
                      {selectedVault?.name ?? 'All vaults'}
                    </span>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition ${isVaultFilterOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[min(28rem,calc(100vw-4rem))] p-0"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                >
                  <div ref={vaultFilterContentRef}>
                    <div className="border-b border-border/60 p-2">
                      <div className="relative">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          aria-label="Search vaults"
                          value={vaultSearchQuery}
                          onChange={(event) => setVaultSearchQuery(event.target.value)}
                          onKeyDown={(event) =>
                            handleFilterSearchKeyDown(event, () =>
                              focusFirstFilterItem(vaultFilterContentRef.current),
                            )
                          }
                          placeholder="Search vaults"
                          className="h-10 w-full rounded-xl border border-transparent bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-border"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-auto p-2">
                      {vaultsQuery.isLoading ? (
                        <p className="px-3 py-3 text-sm text-muted-foreground">Loading vaults...</p>
                      ) : null}
                      {!vaultsQuery.isLoading ? (
                        <DropdownMenuItem
                          className={cn(!selectedVaultId && 'bg-secondary/70 text-foreground')}
                          onSelect={() => {
                            setSelectedVaultId('');
                            setIsVaultFilterOpen(false);
                          }}
                        >
                          <span className="flex-1">All vaults</span>
                          {!selectedVaultId ? <Check className="size-4 text-primary" /> : null}
                        </DropdownMenuItem>
                      ) : null}
                      {!vaultsQuery.isLoading && filteredVaults.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-muted-foreground">No vaults found.</p>
                      ) : null}
                      {filteredVaults.map((vault) => (
                        <DropdownMenuItem
                          key={vault.id}
                          className={cn(
                            selectedVaultId === vault.id && 'bg-secondary/70 text-foreground',
                          )}
                          onSelect={() => {
                            setSelectedVaultId(vault.id);
                            setIsVaultFilterOpen(false);
                          }}
                        >
                          <span className="flex-1 truncate">{vault.name}</span>
                          {selectedVaultId === vault.id ? (
                            <Check className="size-4 text-primary" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-4">
              <span className="text-sm font-semibold text-foreground">Tags</span>
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
                  <button
                    type="button"
                    aria-label="Tags filter"
                    className={`${vaultInputClassName} flex h-10 w-full items-center justify-between gap-3 rounded-lg border-border/70 bg-background px-4 text-left`}
                  >
                    <span className="truncate text-sm text-foreground">{selectedTagsLabel}</span>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition ${isTagFilterOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[min(28rem,calc(100vw-4rem))] p-0"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                >
                  <div ref={tagFilterContentRef}>
                    <div className="border-b border-border/60 p-2">
                      <div className="relative">
                        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          aria-label="Search tags"
                          value={tagSearchQuery}
                          onChange={(event) => setTagSearchQuery(event.target.value)}
                          onKeyDown={(event) =>
                            handleFilterSearchKeyDown(event, () =>
                              focusFirstFilterItem(tagFilterContentRef.current),
                            )
                          }
                          placeholder="Search tags"
                          className="h-10 w-full rounded-xl border border-transparent bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-border"
                          autoFocus
                        />
                      </div>
                    </div>
                    <div className="max-h-72 overflow-auto p-2">
                      {tagsQuery.isLoading ? (
                        <p className="px-3 py-3 text-sm text-muted-foreground">Loading tags...</p>
                      ) : null}
                      {!tagsQuery.isLoading && availableTags.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-muted-foreground">No tags found.</p>
                      ) : null}
                      {!tagsQuery.isLoading &&
                      availableTags.length > 0 &&
                      filteredTags.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-muted-foreground">No tags found.</p>
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
                            <span className="flex min-w-0 flex-1 items-center gap-3">
                              <span
                                className="size-2.5 rounded-full"
                                style={{
                                  backgroundColor: tag.color ?? 'hsl(var(--muted-foreground))',
                                }}
                                aria-hidden="true"
                              />
                              <span className="truncate">{tag.name}</span>
                            </span>
                            {typeof tag.documentsCount === 'number' ? (
                              <span className="ml-auto text-xs text-muted-foreground">
                                {tag.documentsCount} doc{tag.documentsCount === 1 ? '' : 's'}
                              </span>
                            ) : null}
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/80 p-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Date</h3>
              </div>

              <div className="mt-3 space-y-2">
                {[
                  { value: 'any', label: 'Any time' },
                  { value: 'last_7_days', label: 'Last 7 days' },
                  { value: 'last_30_days', label: 'Last 30 days' },
                  { value: 'custom', label: 'Custom range' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3.5 py-2.5 transition',
                      datePreset === option.value
                        ? 'bg-secondary text-foreground'
                        : 'hover:bg-secondary/45',
                    )}
                  >
                    <input
                      type="radio"
                      name="documents-date-filter"
                      value={option.value}
                      checked={datePreset === option.value}
                      onChange={() => setDatePreset(option.value as DatePreset)}
                      className="size-4 border-border"
                    />
                    <span className="text-sm font-semibold">{option.label}</span>
                  </label>
                ))}
              </div>

              {datePreset === 'custom' ? (
                <div className="mt-4 grid gap-3 border-l border-border/70 pl-3 sm:grid-cols-2 sm:pl-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="documents-custom-date-from"
                      className="text-sm font-semibold text-muted-foreground"
                    >
                      From
                    </label>
                    <div className="relative">
                      <CalendarRange className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="documents-custom-date-from"
                        aria-label="From"
                        type="date"
                        value={customDateFrom}
                        max={customDateTo || undefined}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setCustomDateFrom(nextValue);

                          if (customDateTo && nextValue && nextValue > customDateTo) {
                            setCustomDateTo(nextValue);
                          }
                        }}
                        className={`${vaultInputClassName} h-10 rounded-lg border-border/70 bg-card pl-11`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="documents-custom-date-to"
                      className="text-sm font-semibold text-muted-foreground"
                    >
                      To
                    </label>
                    <div className="relative">
                      <CalendarRange className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="documents-custom-date-to"
                        aria-label="To"
                        type="date"
                        value={customDateTo}
                        min={customDateFrom || undefined}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setCustomDateTo(nextValue);

                          if (customDateFrom && nextValue && nextValue < customDateFrom) {
                            setCustomDateFrom(nextValue);
                          }
                        }}
                        className={`${vaultInputClassName} h-10 rounded-lg border-border/70 bg-card pl-11`}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xl font-medium  text-foreground">{summaryLabel}</p>
        </div>

        <span className="vault-chip">{selectedSortLabel}</span>
      </div>

      {vaultsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading vaults...</p>
      ) : null}
      {vaultsQuery.isError ? (
        <p className="text-sm text-destructive">Unable to load vaults.</p>
      ) : null}
      {documentsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading documents...</p>
      ) : null}
      {documentsQuery.isError ? (
        <p className="text-sm text-destructive">Unable to load your document library.</p>
      ) : null}

      {!documentsQuery.isLoading && (documentsQuery.data?.results.length ?? 0) === 0 ? (
        <SurfacePanel>
          <p className="text-sm text-muted-foreground">
            No documents matched the current search and filter combination.
          </p>
        </SurfacePanel>
      ) : null}

      <div className="space-y-5">
        {groupedDocuments.map((group) => {
          const vault = vaultsById.get(group.vaultId);
          const isCollapsed = collapsedVaultIds.includes(group.vaultId);

          return (
            <SurfacePanel key={group.vaultId} className="rounded-lg p-0">
              <div className="border-b border-border/70 px-5 py-5 sm:px-6">
                <div className="flex items-start gap-4">
                  <VaultIcon />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-4 text-left"
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleVaultCollapsed(group.vaultId)}
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-baseline gap-3">
                          <span className="truncate text-base font-semibold text-foreground">
                            {group.vaultName}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {group.documents.length} document
                            {group.documents.length === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {formatVaultRole(vault?.role ?? 'global_admin')}
                        </span>
                      </span>
                      <ChevronDown
                        className={`mt-1 size-5 shrink-0 text-muted-foreground transition ${isCollapsed ? '' : 'rotate-180'}`}
                      />
                    </button>
                  </div>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Open actions for ${group.vaultName}`}
                        className="h-9 w-9 rounded-lg border border-border/60 bg-background/80 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Ellipsis className="size-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem asChild>
                        <Link to={`/vaults/${group.vaultId}/documents`}>
                          <FolderOpen className="size-4 text-primary" />
                          Open vault
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={`/vaults/${group.vaultId}/settings`}>
                          <Settings2 className="size-4 text-primary" />
                          Vault settings
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {!isCollapsed ? (
                <>
                  <DocumentLibraryHeader />

                  <div className="divide-y divide-border/70">
                    {group.documents.map((document) => (
                      <DocumentLibraryRow
                        key={document.documentId}
                        name={document.name}
                        mimeType={document.mimeType}
                        originalName={document.originalName}
                        originalSize={document.originalSize}
                        createdAt={document.createdAt}
                        updatedAt={document.updatedAt}
                        tags={document.tags}
                        snippet={
                          debouncedQuery.length > 0 && document.bestChunk
                            ? tokenizeSnippet(document.bestChunk.snippet).map((part) =>
                                part.highlighted ? (
                                  <mark
                                    key={`${document.documentId}-${part.key}`}
                                    className="rounded-md bg-accent px-1.5 py-0.5 text-foreground"
                                  >
                                    {part.text}
                                  </mark>
                                ) : (
                                  <span key={`${document.documentId}-${part.key}`}>
                                    {part.text}
                                  </span>
                                ),
                              )
                            : undefined
                        }
                        vaultId={document.vaultId}
                        documentId={document.documentId}
                        deleteDisabled={deleteMutation.isPending}
                        onDelete={() => {
                          setStatusMessage(null);
                          setErrorMessage(null);
                          deleteMutation.mutate({
                            vaultId: document.vaultId,
                            documentId: document.documentId,
                          });
                        }}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </SurfacePanel>
          );
        })}
      </div>
    </section>
  );
}
