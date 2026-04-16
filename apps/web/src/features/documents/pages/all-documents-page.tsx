import type { ReactNode, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  Check,
  ChevronDown,
  FileText,
  Search as SearchIcon,
  SlidersHorizontal,
  Tags,
  Vault,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageIntro, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchResultItem, SearchSortBy } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useAccessibleTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 100;

const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'document_date_desc', label: 'Date (newest first)' },
  { value: 'document_date_asc', label: 'Date (oldest first)' },
  { value: 'updated_desc', label: 'Uploaded (newest first)' },
  { value: 'updated_asc', label: 'Uploaded (oldest first)' },
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

function getDateTriggerLabel({
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

  if (preset === 'custom' && dateFrom && dateTo) {
    return `${dateFrom} - ${dateTo}`;
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

function FilterTrigger({
  icon,
  label,
  value,
  onClick,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-14 w-full items-center gap-3 rounded-[20px] border px-4 text-left transition',
        active
          ? 'border-primary/20 bg-secondary text-foreground shadow-[0_16px_30px_rgba(31,48,120,0.08)]'
          : 'border-border/70 bg-background text-foreground hover:border-primary/15 hover:bg-card',
      )}
      onClick={onClick}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-base font-semibold">{label}</span>
      <span className="truncate text-base text-muted-foreground">{value}</span>
      <ChevronDown className="size-4 text-muted-foreground" />
    </button>
  );
}

function DocumentIcon() {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary ring-1 ring-border/60">
      <FileText className="size-5" />
    </div>
  );
}

export function AllDocumentsPage() {
  const [query, setQuery] = useState('');
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SearchSortBy>('document_date_desc');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const tagsPanelRef = useRef<HTMLDivElement | null>(null);
  const datePanelRef = useRef<HTMLDivElement | null>(null);

  useDismissableLayer({
    isOpen: isTagsOpen,
    onClose: () => setIsTagsOpen(false),
    ref: tagsPanelRef,
  });
  useDismissableLayer({
    isOpen: isDateOpen,
    onClose: () => setIsDateOpen(false),
    ref: datePanelRef,
  });

  const debouncedQuery = useDebouncedValue(query.trim(), 280);
  const vaultsQuery = useVaultsQuery();
  const tagsQuery = useAccessibleTagsQuery({ vaultId: selectedVaultId || undefined });

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
    vaultId: selectedVaultId || undefined,
    tagIds: selectedTagIds,
    dateFrom: appliedDateRange.dateFrom,
    dateTo: appliedDateRange.dateTo,
    sortBy,
    enabled: !vaultsQuery.isLoading,
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

    return Array.from(groups.values());
  }, [documentsQuery.data?.results]);

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

  const hasActiveFilters =
    selectedVaultId.length > 0
    || selectedTagIds.length > 0
    || datePreset !== 'any'
    || sortBy !== 'document_date_desc';

  const selectedSortLabel = sortOptions.find(option => option.value === sortBy)?.label ?? 'Date (newest first)';

  function toggleTagSelection(tagId: string) {
    setSelectedTagIds(current =>
      current.includes(tagId)
        ? current.filter(item => item !== tagId)
        : [...current, tagId],
    );
  }

  function clearFilters() {
    setSelectedVaultId('');
    setSelectedTagIds([]);
    setDatePreset('any');
    setCustomDateFrom('');
    setCustomDateTo('');
    setSortBy('document_date_desc');
    setIsDateOpen(false);
    setIsTagsOpen(false);
  }

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Documents"
        title="Documents"
        description="Search and filter the full document library from one backend-powered workspace surface."
      />

      <SurfacePanel className="space-y-5 rounded-[28px] p-5 sm:p-6">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search documents"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search invoices, clauses, names..."
            className="h-16 w-full rounded-[22px] border border-border/70 bg-background pl-14 pr-4 text-lg text-foreground outline-none transition focus-visible:border-primary/20 focus-visible:ring-2 focus-visible:ring-primary/15"
          />
        </div>

        <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_1.2fr]">
          <div className="relative">
            <Vault className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <select
              aria-label="Vault filter"
              value={selectedVaultId}
              onChange={event => setSelectedVaultId(event.target.value)}
              className={`${vaultInputClassName} h-14 appearance-none rounded-[20px] border-border/70 bg-background pl-11 pr-10 text-base font-semibold`}
            >
              <option value="">All vaults</option>
              {(vaultsQuery.data?.vaults ?? []).map(vault => (
                <option key={vault.id} value={vault.id}>{vault.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>

          <div ref={tagsPanelRef} className="relative">
            <FilterTrigger
              icon={<Tags className="size-4" />}
              label={selectedTags.length > 0 ? `${selectedTags.length} tag${selectedTags.length === 1 ? '' : 's'}` : 'Select tags'}
              value={selectedTags.length > 0 ? selectedTags.map(tag => tag.name).join(', ') : 'Any'}
              onClick={() => {
                setIsDateOpen(false);
                setIsTagsOpen(open => !open);
              }}
              active={selectedTags.length > 0 || isTagsOpen}
            />

            {isTagsOpen ? (
              <div className="absolute left-0 top-[calc(100%+0.75rem)] z-30 w-full min-w-[22rem] rounded-[24px] border border-border/70 bg-card p-4 shadow-[0_28px_60px_rgba(16,29,76,0.14)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">Select tags</p>
                    <p className="text-sm text-muted-foreground">Filter documents by one or more tags.</p>
                  </div>
                  {selectedTagIds.length > 0 ? (
                    <button type="button" className="vault-link" onClick={() => setSelectedTagIds([])}>
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {tagsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading tags...</p> : null}
                  {!tagsQuery.isLoading && availableTags.length === 0 ? (
                    <p className="rounded-[18px] bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                      No tags are available for the current vault scope.
                    </p>
                  ) : null}
                  {availableTags.map(tag => {
                    const checked = selectedTagIds.includes(tag.id);

                    return (
                      <label
                        key={tag.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-[18px] px-3 py-3 transition',
                          checked ? 'bg-secondary text-foreground' : 'hover:bg-secondary/55',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTagSelection(tag.id)}
                          className="mt-1 size-4 rounded border-border"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{tag.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {tag.vaultName ?? 'Vault tag'}{typeof tag.documentsCount === 'number' ? ` • ${tag.documentsCount} docs` : ''}
                          </span>
                        </span>
                        {checked ? <Check className="mt-0.5 size-4 text-primary" /> : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div ref={datePanelRef} className="relative">
            <FilterTrigger
              icon={<CalendarRange className="size-4" />}
              label="Date"
              value={getDateTriggerLabel({
                preset: datePreset,
                dateFrom: appliedDateRange.dateFrom,
                dateTo: appliedDateRange.dateTo,
              })}
              onClick={() => {
                setIsTagsOpen(false);
                setIsDateOpen(open => !open);
              }}
              active={datePreset !== 'any' || isDateOpen}
            />

            {isDateOpen ? (
              <div className="absolute left-0 top-[calc(100%+0.75rem)] z-30 w-full min-w-[25rem] rounded-[24px] border border-border/70 bg-card p-4 shadow-[0_28px_60px_rgba(16,29,76,0.14)]">
                <div className="space-y-2">
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-[18px] px-4 py-3 text-left transition',
                      datePreset === 'any' ? 'bg-secondary text-foreground' : 'hover:bg-secondary/55',
                    )}
                    onClick={() => {
                      setDatePreset('any');
                      setCustomDateFrom('');
                      setCustomDateTo('');
                      setIsDateOpen(false);
                    }}
                  >
                    <span className="text-base font-semibold">Any time</span>
                    {datePreset === 'any' ? <Check className="size-4 text-primary" /> : null}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-[18px] px-4 py-3 text-left transition',
                      datePreset === 'last_7_days' ? 'bg-secondary text-foreground' : 'hover:bg-secondary/55',
                    )}
                    onClick={() => {
                      setDatePreset('last_7_days');
                      setIsDateOpen(false);
                    }}
                  >
                    <span className="text-base font-semibold">Last 7 days</span>
                    {datePreset === 'last_7_days' ? <Check className="size-4 text-primary" /> : null}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-[18px] px-4 py-3 text-left transition',
                      datePreset === 'last_30_days' ? 'bg-secondary text-foreground' : 'hover:bg-secondary/55',
                    )}
                    onClick={() => {
                      setDatePreset('last_30_days');
                      setIsDateOpen(false);
                    }}
                  >
                    <span className="text-base font-semibold">Last 30 days</span>
                    {datePreset === 'last_30_days' ? <Check className="size-4 text-primary" /> : null}
                  </button>
                </div>

                <div className="mt-4 rounded-[20px] border border-border/70 bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-foreground">Custom range</p>
                      <p className="text-sm text-muted-foreground">Apply an exact document-date window.</p>
                    </div>
                    <SlidersHorizontal className="size-4 text-muted-foreground" />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="documents-custom-date-from" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        From
                      </label>
                      <input
                        id="documents-custom-date-from"
                        type="date"
                        value={customDateFrom}
                        onChange={event => setCustomDateFrom(event.target.value)}
                        className={vaultInputClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="documents-custom-date-to" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        To
                      </label>
                      <input
                        id="documents-custom-date-to"
                        type="date"
                        value={customDateTo}
                        onChange={event => setCustomDateTo(event.target.value)}
                        className={vaultInputClassName}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setCustomDateFrom('');
                        setCustomDateTo('');
                        setDatePreset('any');
                      }}
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setDatePreset('custom');
                        setIsDateOpen(false);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <select
              aria-label="Sort documents"
              value={sortBy}
              onChange={event => setSortBy(event.target.value as SearchSortBy)}
              className={`${vaultInputClassName} h-14 appearance-none rounded-[20px] border-border/70 bg-background pl-4 pr-10 text-base font-semibold`}
            >
              {sortOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </SurfacePanel>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-xl font-medium tracking-[-0.03em] text-foreground">{summaryLabel}</p>
          <p className="text-sm text-muted-foreground">
            Search and filters are applied in the backend, with debounced input and cached result sets on the client.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {hasActiveFilters ? (
            <button type="button" className="vault-link inline-flex items-center gap-2" onClick={clearFilters}>
              <X className="size-4" />
              Clear filters
            </button>
          ) : null}
          <span className="vault-chip">{selectedSortLabel}</span>
        </div>
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

          return (
            <SurfacePanel key={group.vaultId} className="overflow-hidden rounded-[26px] p-0">
              <div className="border-b border-border/70 px-6 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <Vault className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display truncate text-2xl font-bold tracking-[-0.04em] text-foreground">
                      {group.vaultName}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      role: {vault?.role ?? 'global_admin'} • {group.documents.length} document{group.documents.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="hidden items-center gap-4 sm:flex">
                    <Link to={`/vaults/${group.vaultId}/documents`} className="vault-link">Open vault</Link>
                    <Link to={`/vaults/${group.vaultId}/settings`} className="vault-link">Settings</Link>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-border/70">
                {group.documents.map(document => (
                  <article
                    key={document.documentId}
                    className="grid gap-5 px-6 py-5 xl:grid-cols-[minmax(0,1.25fr)_220px_220px_140px] xl:items-center"
                  >
                    <div className="flex items-start gap-4">
                      <DocumentIcon />
                      <div className="min-w-0">
                        <Link
                          to={`/vaults/${document.vaultId}/documents/${document.documentId}`}
                          className="block truncate text-2xl font-semibold tracking-[-0.03em] text-foreground transition hover:text-primary"
                        >
                          {document.name}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatBytes(document.originalSize)} • {document.mimeType} • Uploaded {formatDate(document.createdAt)}
                        </p>
                        {debouncedQuery.length > 0 && document.bestChunk ? (
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {tokenizeSnippet(document.bestChunk.snippet).map(part =>
                              part.highlighted
                                ? (
                                    <mark key={`${document.documentId}-${part.key}`} className="rounded-md bg-accent px-1.5 py-0.5 text-foreground">
                                      {part.text}
                                    </mark>
                                  )
                                : <span key={`${document.documentId}-${part.key}`}>{part.text}</span>,
                            )}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <p className="vault-label">Document date</p>
                      <p className="mt-2 text-base text-foreground">
                        {document.documentDate ? formatDate(document.documentDate) : 'No date'}
                      </p>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <p className="vault-label">Updated</p>
                      <p className="mt-2 text-base text-foreground">{formatDate(document.updatedAt)}</p>
                    </div>

                    <div className="flex gap-3 xl:justify-end">
                      <Link to={`/vaults/${document.vaultId}/documents/${document.documentId}`} className="vault-link">
                        Open
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </SurfacePanel>
          );
        })}
      </div>
    </section>
  );
}
