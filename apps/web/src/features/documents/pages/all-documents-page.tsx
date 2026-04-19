import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
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
import { PageIntro, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { softDeleteDocument } from '@/features/documents/documents.api';
import { DocumentLibraryHeader, DocumentLibraryRow } from '@/features/documents/components/document-library-list';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { ActiveFilterChip, DocumentSearchControls } from '@/features/documents/components/document-search-controls';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { searchQueryKeys, useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchResultItem, SearchSortBy } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useAccessibleTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 100;

const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'created_desc', label: 'Newest upload' },
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

function useDismissableLayer({
  isOpen,
  onClose,
  ref,
}: {
  isOpen: boolean;
  onClose: () => void;
  ref: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, ref]);
}

function OverflowMenu({
  isOpen,
  onToggle,
  align = 'right',
  side = 'bottom',
  children,
  label,
}: {
  isOpen: boolean;
  onToggle: () => void;
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="h-11 w-11 rounded-2xl border border-border/60 bg-background/80 text-muted-foreground shadow-[0_12px_24px_rgba(19,27,46,0.05)] hover:bg-secondary/70 hover:text-foreground"
        onClick={onToggle}
      >
        <Ellipsis className="size-5" />
      </Button>

      {isOpen ? (
        <div
          role="menu"
          className={`absolute z-30 w-56 rounded-[22px] border border-border/70 bg-card p-2 shadow-[0_28px_60px_rgba(16,29,76,0.14)] ${
            side === 'bottom' ? 'top-[calc(100%+0.75rem)]' : 'bottom-[calc(100%+0.75rem)]'
          } ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  to,
  icon,
  children,
  onSelect,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
      onClick={onSelect}
    >
      <span className="text-primary">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function MenuAnchor({
  href,
  icon,
  children,
  onSelect,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <a
      href={href}
      role="menuitem"
      className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
      onClick={onSelect}
    >
      <span className="text-primary">{icon}</span>
      <span>{children}</span>
    </a>
  );
}

function TagPill({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-[0.01em]"
      style={{
        backgroundColor: color ? `${color}18` : undefined,
        color: color ?? undefined,
      }}
    >
      {name}
    </span>
  );
}

function VaultIcon() {
  return (
    <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary ring-1 ring-border/60">
      <Folder className="size-5" />
    </div>
  );
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
  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [openVaultMenuId, setOpenVaultMenuId] = useState<string | null>(null);
  const [collapsedVaultIds, setCollapsedVaultIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const vaultDropdownRef = useRef<HTMLDivElement | null>(null);
  const tagDropdownRef = useRef<HTMLDivElement | null>(null);
  const vaultMenuRef = useRef<HTMLDivElement | null>(null);

  useDismissableLayer({
    isOpen: openVaultMenuId !== null,
    onClose: () => setOpenVaultMenuId(null),
    ref: vaultMenuRef,
  });

  useEffect(() => {
    if (!isFiltersOpen) {
      setIsVaultDropdownOpen(false);
      setVaultSearchQuery('');
      setIsTagDropdownOpen(false);
      setTagSearchQuery('');
    }
  }, [isFiltersOpen]);

  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const vaultsQuery = useVaultsQuery();
  const tagScopeVaultId = selectedVaultIds.length === 1 ? selectedVaultIds[0] : undefined;
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
    vaultIds: selectedVaultIds.length > 0 ? selectedVaultIds : undefined,
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
    () => new Set(availableTags.map(tag => tag.id)),
    [availableTags],
  );

  useEffect(() => {
    setSelectedTagIds((current) => {
      const next = current.filter(tagId => availableTagIds.has(tagId));
      return next.length === current.length ? current : next;
    });
  }, [availableTagIds]);

  const selectedTags = useMemo(
    () => availableTags.filter(tag => selectedTagIds.includes(tag.id)),
    [availableTags, selectedTagIds],
  );

  const filteredVaults = useMemo(() => {
    const normalizedQuery = vaultSearchQuery.trim().toLowerCase();
    const vaults = vaultsQuery.data?.vaults ?? [];

    if (normalizedQuery.length === 0) {
      return vaults;
    }

    return vaults.filter(vault => vault.name.toLowerCase().includes(normalizedQuery));
  }, [vaultSearchQuery, vaultsQuery.data?.vaults]);

  const filteredTags = useMemo(() => {
    const normalizedQuery = tagSearchQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return availableTags;
    }

    return availableTags.filter(tag => {
      const haystacks = [tag.name, tag.vaultName ?? ''];
      return haystacks.some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [availableTags, tagSearchQuery]);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, { vaultId: string; vaultName: string; documents: SearchResultItem[] }>();

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

    const vaultOrder = new Map((vaultsQuery.data?.vaults ?? []).map((vault, index) => [vault.id, index]));

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
    () => new Map((vaultsQuery.data?.vaults ?? []).map(vault => [vault.id, vault])),
    [vaultsQuery.data?.vaults],
  );

  const summaryLabel = useMemo(() => {
    const shownDocuments = documentsQuery.data?.results.length ?? 0;
    const totalDocuments = documentsQuery.data?.resultsCount ?? 0;
    const vaultsShown = groupedDocuments.length;

    if (shownDocuments === totalDocuments) {
      return `Showing ${shownDocuments} document${shownDocuments === 1 ? '' : 's'} across ${vaultsShown} vault${vaultsShown === 1 ? '' : 's'}`;
    }

    return `Showing ${shownDocuments} of ${totalDocuments} documents across ${vaultsShown} vaults`;
  }, [documentsQuery.data?.results.length, documentsQuery.data?.resultsCount, groupedDocuments.length]);

  const selectedSortLabel = sortOptions.find(option => option.value === sortBy)?.label ?? 'Newest upload';
  const selectedVaults = useMemo(
    () => (vaultsQuery.data?.vaults ?? []).filter(vault => selectedVaultIds.includes(vault.id)),
    [selectedVaultIds, vaultsQuery.data?.vaults],
  );

  const activeFilterCount = selectedVaultIds.length
    + selectedTagIds.length
    + (datePreset !== 'any' ? 1 : 0);

  const activeFilters = [
    ...selectedVaults.map(vault => ({
      key: `vault-${vault.id}`,
      label: vault.name,
      onRemove: () => {
        setSelectedVaultIds(current => current.filter(item => item !== vault.id));
      },
    })),
    ...selectedTags.map(tag => ({
      key: `tag-${tag.id}`,
      label: tag.name,
      onRemove: () => setSelectedTagIds(current => current.filter(item => item !== tag.id)),
    })),
    ...(datePreset !== 'any'
      ? [{
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
        }]
      : []),
  ];

  function toggleVaultSelection(vaultId: string) {
    setSelectedVaultIds(current =>
      current.includes(vaultId)
        ? current.filter(item => item !== vaultId)
        : [...current, vaultId],
    );
  }

  function toggleTagSelection(tagId: string) {
    setSelectedTagIds(current =>
      current.includes(tagId)
        ? current.filter(item => item !== tagId)
        : [...current, tagId],
    );
  }

  function clearFilters() {
    setSelectedVaultIds([]);
    setSelectedTagIds([]);
    setDatePreset('any');
    setCustomDateFrom('');
    setCustomDateTo('');
    setVaultSearchQuery('');
    setIsVaultDropdownOpen(false);
    setTagSearchQuery('');
    setIsTagDropdownOpen(false);
  }

  function toggleVaultCollapsed(vaultId: string) {
    setCollapsedVaultIds(current =>
      current.includes(vaultId)
        ? current.filter(id => id !== vaultId)
        : [...current, vaultId],
    );
  }

  function handleFilterDialogPointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as Node;

    if (isVaultDropdownOpen && !vaultDropdownRef.current?.contains(target)) {
      setIsVaultDropdownOpen(false);
    }

    if (isTagDropdownOpen && !tagDropdownRef.current?.contains(target)) {
      setIsTagDropdownOpen(false);
    }
  }

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Documents"
        title="Documents"
        description="Search and filter the full document library from one backend-powered workspace surface."
        actions={(
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/transfers"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
            >
              <Upload className="size-4" />
              Batch upload
            </Link>
          </div>
        )}
      />

      {(statusMessage || errorMessage) ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <DocumentSearchControls
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search invoices, clauses, names..."
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
        filtersDescription="Refine the library without leaving this page."
        onDialogPointerDownCapture={handleFilterDialogPointerDownCapture}
        filtersContent={(
          <>
                <div className="space-y-3">
                  <label className="text-lg font-semibold text-foreground">
                    Vault
                  </label>

                  {selectedVaults.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedVaults.map(vault => (
                        <ActiveFilterChip
                          key={vault.id}
                          label={vault.name}
                          onRemove={() => toggleVaultSelection(vault.id)}
                        />
                      ))}
                    </div>
                  ) : null}

                  <div ref={vaultDropdownRef} className="relative">
                    <button
                      type="button"
                      aria-label="Vault filter"
                      aria-expanded={isVaultDropdownOpen}
                      aria-haspopup="listbox"
                      onClick={() => setIsVaultDropdownOpen(open => !open)}
                      className="flex h-14 w-full items-center gap-3 rounded-[20px] border border-border/70 bg-background px-4 text-left shadow-[0_12px_30px_rgba(17,27,70,0.04)] transition hover:border-primary/15"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-foreground">
                          {selectedVaults.length > 0 ? `${selectedVaults.length} vault${selectedVaults.length === 1 ? '' : 's'} selected` : 'All vaults'}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {selectedVaults.length > 0 ? selectedVaults.map(vault => vault.name).join(', ') : 'Search and choose vaults'}
                        </span>
                      </span>
                      <ChevronDown className={cn('size-4 text-muted-foreground transition', isVaultDropdownOpen ? 'rotate-180' : '')} />
                    </button>

                    {isVaultDropdownOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-20 rounded-[24px] border border-border/70 bg-card p-4 shadow-[0_28px_60px_rgba(16,29,76,0.14)]">
                        <div className="relative">
                          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            aria-label="Search vaults"
                            value={vaultSearchQuery}
                            onChange={event => setVaultSearchQuery(event.target.value)}
                            placeholder="Search vaults"
                            className={`${vaultInputClassName} h-12 rounded-[16px] border-border/70 bg-background pl-11`}
                          />
                        </div>

                        <div role="listbox" aria-label="Available vaults" className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                          {vaultsQuery.isLoading ? <p className="px-2 py-3 text-sm text-muted-foreground">Loading vaults...</p> : null}
                          {!vaultsQuery.isLoading ? (
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedVaultIds.length === 0}
                              onClick={() => setSelectedVaultIds([])}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition',
                                selectedVaultIds.length === 0
                                  ? 'border-primary/15 bg-secondary text-foreground shadow-[0_14px_30px_rgba(19,27,46,0.05)]'
                                  : 'border-border/70 bg-background hover:border-primary/10 hover:bg-secondary/45',
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-foreground">All vaults</span>
                                <span className="block truncate text-xs text-muted-foreground">Results can come from any accessible vault</span>
                              </span>
                              {selectedVaultIds.length === 0 ? <Check className="size-4 text-primary" /> : null}
                            </button>
                          ) : null}
                          {!vaultsQuery.isLoading && filteredVaults.length === 0 ? (
                            <p className="rounded-[18px] bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                              No vaults match "{vaultSearchQuery.trim()}".
                            </p>
                          ) : null}
                          {filteredVaults.map(vault => {
                            const isSelected = selectedVaultIds.includes(vault.id);

                            return (
                              <button
                                key={vault.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => toggleVaultSelection(vault.id)}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition',
                                  isSelected
                                    ? 'border-primary/15 bg-secondary text-foreground shadow-[0_14px_30px_rgba(19,27,46,0.05)]'
                                    : 'border-border/70 bg-background hover:border-primary/10 hover:bg-secondary/45',
                                )}
                              >
                                <div className="flex size-8 items-center justify-center rounded-xl bg-secondary text-primary">
                                  <Folder className="size-4" />
                                </div>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-foreground">{vault.name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">{vault.role} access</span>
                                </span>
                                {isSelected ? <Check className="size-4 text-primary" /> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">Tags</h3>
                    <p className="text-sm text-muted-foreground">Choose one or more tags to narrow the results.</p>
                  </div>

                  {selectedTags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedTags.map(tag => (
                        <ActiveFilterChip
                          key={tag.id}
                          label={tag.name}
                          onRemove={() => toggleTagSelection(tag.id)}
                        />
                      ))}
                    </div>
                  ) : null}

                  <div ref={tagDropdownRef} className="relative">
                    <button
                      type="button"
                      aria-label="Tag filter"
                      aria-expanded={isTagDropdownOpen}
                      aria-haspopup="listbox"
                      onClick={() => setIsTagDropdownOpen(open => !open)}
                      className="flex h-14 w-full items-center gap-3 rounded-[20px] border border-border/70 bg-background px-4 text-left shadow-[0_12px_30px_rgba(17,27,70,0.04)] transition hover:border-primary/15"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-semibold text-foreground">
                          {selectedTags.length > 0 ? `${selectedTags.length} tag${selectedTags.length === 1 ? '' : 's'} selected` : 'Select tags'}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {selectedTags.length > 0 ? selectedTags.map(tag => tag.name).join(', ') : 'Search and choose tags'}
                        </span>
                      </span>
                      <ChevronDown className={cn('size-4 text-muted-foreground transition', isTagDropdownOpen ? 'rotate-180' : '')} />
                    </button>

                    {isTagDropdownOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-20 rounded-[24px] border border-border/70 bg-card p-4 shadow-[0_28px_60px_rgba(16,29,76,0.14)]">
                        <div className="relative">
                          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                          <input
                            aria-label="Search tags"
                            value={tagSearchQuery}
                            onChange={event => setTagSearchQuery(event.target.value)}
                            placeholder="Search tags"
                            className={`${vaultInputClassName} h-12 rounded-[16px] border-border/70 bg-background pl-11`}
                          />
                        </div>

                        <div role="listbox" aria-label="Available tags" className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                          {tagsQuery.isLoading ? <p className="px-2 py-3 text-sm text-muted-foreground">Loading tags...</p> : null}
                          {!tagsQuery.isLoading && availableTags.length === 0 ? (
                            <p className="rounded-[18px] bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                              No tags are available for the current vault scope.
                            </p>
                          ) : null}
                          {!tagsQuery.isLoading && availableTags.length > 0 && filteredTags.length === 0 ? (
                            <p className="rounded-[18px] bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                              No tags match “{tagSearchQuery.trim()}”.
                            </p>
                          ) : null}
                          {filteredTags.map(tag => {
                            const isSelected = selectedTagIds.includes(tag.id);

                            return (
                              <button
                                key={tag.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => toggleTagSelection(tag.id)}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition',
                                  isSelected
                                    ? 'border-primary/15 bg-secondary text-foreground shadow-[0_14px_30px_rgba(19,27,46,0.05)]'
                                    : 'border-border/70 bg-background hover:border-primary/10 hover:bg-secondary/45',
                                )}
                              >
                                <span
                                  className="size-3 rounded-full"
                                  style={{ backgroundColor: tag.color ?? 'hsl(var(--muted-foreground))' }}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold text-foreground">{tag.name}</span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {tag.vaultName ?? 'Vault tag'}{typeof tag.documentsCount === 'number' ? ` • ${tag.documentsCount} docs` : ''}
                                  </span>
                                </span>
                                {isSelected ? <Check className="size-4 text-primary" /> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[24px] border border-border/70 bg-background/80 p-5">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">Date</h3>
                    <p className="text-sm text-muted-foreground">Pick a preset or enter a custom range.</p>
                  </div>

                  <div className="mt-5 space-y-3">
                    {[
                      { value: 'any', label: 'Any time' },
                      { value: 'last_7_days', label: 'Last 7 days' },
                      { value: 'last_30_days', label: 'Last 30 days' },
                      { value: 'custom', label: 'Custom range' },
                    ].map(option => (
                      <label
                        key={option.value}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-[18px] px-4 py-3 transition',
                          datePreset === option.value ? 'bg-secondary text-foreground' : 'hover:bg-secondary/45',
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
                        <span className="text-base font-semibold">{option.label}</span>
                      </label>
                    ))}
                  </div>

                  {datePreset === 'custom' ? (
                    <div className="mt-5 grid gap-4 border-l border-border/70 pl-4 sm:grid-cols-2 sm:pl-5">
                      <div className="space-y-2">
                        <label htmlFor="documents-custom-date-from" className="text-sm font-semibold text-muted-foreground">
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
                            className={`${vaultInputClassName} h-14 rounded-[18px] border-border/70 bg-card pl-11`}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="documents-custom-date-to" className="text-sm font-semibold text-muted-foreground">
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
                            className={`${vaultInputClassName} h-14 rounded-[18px] border-border/70 bg-card pl-11`}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
          </>
        )}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xl font-medium tracking-[-0.03em] text-foreground">{summaryLabel}</p>
          <p className="text-sm text-muted-foreground">
            Search and filters are applied in the backend, with debounced input and cached result sets on the client.
          </p>
        </div>

        <span className="vault-chip">{selectedSortLabel}</span>
      </div>

      {vaultsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading vaults...</p> : null}
      {vaultsQuery.isError ? <p className="text-sm text-destructive">Unable to load vaults.</p> : null}
      {documentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading documents...</p> : null}
      {documentsQuery.isError ? <p className="text-sm text-destructive">Unable to load your document library.</p> : null}

      {!documentsQuery.isLoading && (documentsQuery.data?.results.length ?? 0) === 0 ? (
        <SurfacePanel>
          <p className="text-sm text-muted-foreground">
            No documents matched the current search and filter combination.
          </p>
        </SurfacePanel>
      ) : null}

      <div className="space-y-5">
        {groupedDocuments.map(group => {
          const vault = vaultsById.get(group.vaultId);
          const isCollapsed = collapsedVaultIds.includes(group.vaultId);

          return (
            <SurfacePanel key={group.vaultId} className="rounded-[26px] p-0">
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
                          <span className="font-display truncate text-2xl font-bold tracking-[-0.04em] text-foreground">
                            {group.vaultName}
                          </span>
                          <span className="text-base text-muted-foreground">
                            {group.documents.length} document{group.documents.length === 1 ? '' : 's'}
                          </span>
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {vault?.role ?? 'global_admin'} access
                        </span>
                      </span>
                      <ChevronDown
                        className={`mt-1 size-5 shrink-0 text-muted-foreground transition ${isCollapsed ? '' : 'rotate-180'}`}
                      />
                    </button>
                  </div>
                  <div ref={openVaultMenuId === group.vaultId ? vaultMenuRef : null}>
                    <OverflowMenu
                      isOpen={openVaultMenuId === group.vaultId}
                      onToggle={() => {
                        setOpenVaultMenuId(current => current === group.vaultId ? null : group.vaultId);
                      }}
                      label={`Open actions for ${group.vaultName}`}
                      side="bottom"
                    >
                      <MenuLink
                        to={`/vaults/${group.vaultId}/documents`}
                        icon={<FolderOpen className="size-4" />}
                        onSelect={() => setOpenVaultMenuId(null)}
                      >
                        Open vault
                      </MenuLink>
                      <MenuLink
                        to={`/vaults/${group.vaultId}/settings`}
                        icon={<Settings2 className="size-4" />}
                        onSelect={() => setOpenVaultMenuId(null)}
                      >
                        Vault settings
                      </MenuLink>
                    </OverflowMenu>
                  </div>
                </div>
              </div>

              {!isCollapsed ? (
                <>
                  <DocumentLibraryHeader />

                  <div className="divide-y divide-border/70">
                    {group.documents.map(document => (
                      <DocumentLibraryRow
                        key={document.documentId}
                        name={document.name}
                        mimeType={document.mimeType}
                        originalName={document.originalName}
                        originalSize={document.originalSize}
                        createdAt={document.createdAt}
                        updatedAt={document.updatedAt}
                        tags={document.tags}
                        snippet={debouncedQuery.length > 0 && document.bestChunk
                          ? tokenizeSnippet(document.bestChunk.snippet).map(part =>
                              part.highlighted
                                ? (
                                    <mark key={`${document.documentId}-${part.key}`} className="rounded-md bg-accent px-1.5 py-0.5 text-foreground">
                                      {part.text}
                                    </mark>
                                  )
                                : <span key={`${document.documentId}-${part.key}`}>{part.text}</span>,
                            )
                          : undefined}
                        vaultId={document.vaultId}
                        documentId={document.documentId}
                        deleteDisabled={deleteMutation.isPending}
                        onDelete={() => {
                          setStatusMessage(null);
                          setErrorMessage(null);
                          deleteMutation.mutate({ vaultId: document.vaultId, documentId: document.documentId });
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
