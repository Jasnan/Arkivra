import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Upload } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageIntro, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  getDocumentDownloadUrl,
  softDeleteDocument,
} from '@/features/documents/documents.api';
import { DocumentSearchControls } from '@/features/documents/components/document-search-controls';
import { documentQueryKeys, useDocumentsQuery } from '@/features/documents/documents.queries';
import { formatBytes, formatDate, sortDocumentsBySearchSort } from '@/features/documents/documents.utils';
import { useVaultSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchSortBy } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';

const PAGE_SIZE = 8;
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: 'document_date_desc', label: 'Newest' },
  { value: 'document_date_asc', label: 'Oldest' },
  { value: 'updated_desc', label: 'Recently uploaded' },
  { value: 'updated_asc', label: 'Oldest upload' },
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

function DocumentIcon() {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary ring-1 ring-border/60">
      <span className="font-display text-xs font-extrabold tracking-[0.12em]">PDF</span>
    </div>
  );
}

export function DocumentsPage() {
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId ?? '';
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<SearchSortBy>('document_date_desc');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const documentsQuery = useDocumentsQuery({
    vaultId,
    tagId: selectedTagId || undefined,
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
    mutationFn: softDeleteDocument,
    onSuccess: async () => {
      setStatusMessage('Document moved to trash.');
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete document.');
      setStatusMessage(null);
    },
  });

  const filteredDocuments = useMemo(() => sortDocumentsBySearchSort(
    (documentsQuery.data?.documents ?? []).filter((document) => {
      const documentDateValue = document.documentDate ? new Date(document.documentDate) : null;
      const dateFromValue = appliedDateRange.dateFrom ? new Date(appliedDateRange.dateFrom) : null;
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
    sortBy,
  ), [appliedDateRange.dateFrom, appliedDateRange.dateTo, documentsQuery.data?.documents, sortBy]);

  if (!vaultId) {
    return <p className="text-sm text-destructive">Invalid vault id.</p>;
  }

  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleDocuments = filteredDocuments.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE,
  );
  const usingSearch = debouncedSearchText.length > 0;
  const searchResultCount = searchQuery.data?.resultsCount ?? 0;
  const activeResultCount = usingSearch ? searchResultCount : filteredDocuments.length;
  const activePageCount = Math.max(1, Math.ceil(activeResultCount / PAGE_SIZE));
  const activePageIndex = usingSearch ? pageIndex : safePageIndex;
  const selectedTag = (tagsQuery.data?.tags ?? []).find(tag => tag.id === selectedTagId);
  const activeFilters = [
    ...(selectedTag
      ? [{
          key: `tag-${selectedTag.id}`,
          label: selectedTag.name,
          onRemove: () => {
            setSelectedTagId('');
            setPageIndex(0);
          },
        }]
      : []),
    ...(datePreset !== 'any'
      ? [{
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
        }]
      : []),
  ];
  const emptyState = !documentsQuery.isLoading
    && !searchQuery.isLoading
    && (usingSearch ? (searchQuery.data?.results.length ?? 0) === 0 : filteredDocuments.length === 0);

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string }>).detail;

      if (!detail?.vaultId || detail.vaultId !== vaultId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, [queryClient, vaultId]);

  function clearFilters() {
    setSelectedTagId('');
    setDatePreset('any');
    setCustomDateFrom('');
    setCustomDateTo('');
    setPageIndex(0);
  }

  return (
    <section className="space-y-6 pb-8">
      <PageIntro
        eyebrow="Vault Operations"
        title="Documents"
        description="A focused document index for this vault."
        actions={(
          <div className="flex flex-wrap items-center gap-3">
            <Link to={`/vaults/${vaultId}/documents/trash`} className="vault-link">Deleted documents</Link>
            <Link to={`/vaults/${vaultId}/tags`} className="vault-link">Tags</Link>
            <Link
              to={`/transfers?vaultId=${vaultId}&locked=true`}
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
        query={searchText}
        onQueryChange={(value) => {
          setSearchText(value);
          setPageIndex(0);
        }}
        searchPlaceholder="Search documents..."
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
        filtersDescription="Refine this vault without leaving the page."
        filtersContent={(
          <>
            <div className="space-y-3">
              <label htmlFor="vault-documents-tag-filter" className="text-lg font-semibold text-foreground">
                Tag
              </label>
              <select
                id="vault-documents-tag-filter"
                aria-label="Tag filter"
                value={selectedTagId}
                onChange={(event) => {
                  setSelectedTagId(event.target.value);
                  setPageIndex(0);
                }}
                className={`${vaultInputClassName} h-14 rounded-[18px] border-border/70 bg-background`}
              >
                <option value="">All tags</option>
                {(tagsQuery.data?.tags ?? []).map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
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
                    className={`flex cursor-pointer items-center gap-3 rounded-[18px] px-4 py-3 transition ${
                      datePreset === option.value ? 'bg-secondary text-foreground' : 'hover:bg-secondary/45'
                    }`}
                  >
                    <input
                      type="radio"
                      name="vault-documents-date-filter"
                      value={option.value}
                      checked={datePreset === option.value}
                      onChange={() => {
                        setDatePreset(option.value as DatePreset);
                        setPageIndex(0);
                      }}
                      className="size-4 border-border"
                    />
                    <span className="text-base font-semibold">{option.label}</span>
                  </label>
                ))}
              </div>

              {datePreset === 'custom' ? (
                <div className="mt-5 grid gap-4 border-l border-border/70 pl-4 sm:grid-cols-2 sm:pl-5">
                  <div className="space-y-2">
                    <label htmlFor="vault-documents-date-from" className="text-sm font-semibold text-muted-foreground">
                      From
                    </label>
                    <div className="relative">
                      <CalendarRange className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="vault-documents-date-from"
                        aria-label="From"
                        type="date"
                        value={customDateFrom}
                        onChange={(event) => {
                          setCustomDateFrom(event.target.value);
                          setPageIndex(0);
                        }}
                        className={`${vaultInputClassName} h-14 rounded-[18px] border-border/70 bg-card pl-11`}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="vault-documents-date-to" className="text-sm font-semibold text-muted-foreground">
                      To
                    </label>
                    <div className="relative">
                      <CalendarRange className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="vault-documents-date-to"
                        aria-label="To"
                        type="date"
                        value={customDateTo}
                        onChange={(event) => {
                          setCustomDateTo(event.target.value);
                          setPageIndex(0);
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

      <SurfacePanel className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {activeResultCount} document{activeResultCount === 1 ? '' : 's'} in total
        </p>
      </SurfacePanel>

      <SurfacePanel className="overflow-hidden p-0">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_220px_200px_140px] gap-6 px-6 py-4 text-sm text-muted-foreground md:grid">
          <span>File name</span>
          <span>Tags / Match</span>
          <span>Created</span>
          <span>Actions</span>
        </div>

        {documentsQuery.isLoading ? <p className="px-6 py-6 text-sm text-muted-foreground">Loading documents...</p> : null}
        {documentsQuery.isError ? <p className="px-6 py-6 text-sm text-destructive">Unable to load documents.</p> : null}
        {searchQuery.isLoading ? <p className="px-6 py-6 text-sm text-muted-foreground">Searching documents...</p> : null}
        {searchQuery.isError ? <p className="px-6 py-6 text-sm text-destructive">Unable to search this vault.</p> : null}

        {emptyState ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">No documents match the current filters.</div>
        ) : (
          <div className="divide-y divide-border/70">
            {usingSearch
              ? (searchQuery.data?.results ?? []).map(result => (
                  <article key={result.documentId} className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.4fr)_220px_200px_140px] md:items-center md:gap-6">
                    <div className="flex items-start gap-4">
                      <DocumentIcon />
                      <div className="min-w-0">
                        <Link to={`/vaults/${vaultId}/documents/${result.documentId}`} className="block truncate text-2xl font-semibold tracking-[-0.03em] text-foreground transition hover:text-primary">
                          {result.name}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {result.mimeType} • {result.matchedChunksCount} matching chunk{result.matchedChunksCount === 1 ? '' : 's'}
                        </p>
                        {result.bestChunk ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {tokenizeSnippet(result.bestChunk.snippet).slice(0, 6).map(part =>
                              part.highlighted
                                ? <mark key={`${result.documentId}-${part.key}`} className="rounded bg-accent px-1 text-accent-foreground">{part.text}</mark>
                                : <span key={`${result.documentId}-${part.key}`}>{part.text}</span>,
                            )}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {result.bestChunk?.pageNumber !== null && result.bestChunk?.pageNumber !== undefined ? `Page ${result.bestChunk.pageNumber}` : 'Text match'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(result.updatedAt)}
                    </div>
                    <div className="flex gap-3">
                      <Link to={`/vaults/${vaultId}/documents/${result.documentId}`} className="vault-link">Open</Link>
                    </div>
                  </article>
                ))
              : visibleDocuments.map(document => (
                  <article key={document.id} className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.4fr)_220px_200px_140px] md:items-center md:gap-6">
                    <div className="flex items-start gap-4">
                      <DocumentIcon />
                      <div className="min-w-0">
                        <Link to={`/vaults/${vaultId}/documents/${document.id}`} className="block truncate text-2xl font-semibold tracking-[-0.03em] text-foreground transition hover:text-primary">
                          {document.name}
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatBytes(document.originalSize)} • {document.mimeType}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {document.documentDate ? formatDate(document.documentDate) : 'No date'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(document.createdAt)}
                    </div>
                    <div className="flex gap-3">
                      <a href={getDocumentDownloadUrl({ vaultId, documentId: document.id })} className="vault-link">Download</a>
                      <button
                        type="button"
                        className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          setStatusMessage(null);
                          setErrorMessage(null);
                          deleteMutation.mutate({ vaultId, documentId: document.id });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-border/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Page {activePageIndex + 1} of {activePageCount}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={activePageIndex === 0}
              onClick={() => setPageIndex(current => Math.max(0, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={activePageIndex >= activePageCount - 1}
              onClick={() => setPageIndex(current => Math.min(activePageCount - 1, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </SurfacePanel>
    </section>
  );
}
