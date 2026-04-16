import type { ReactNode, RefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  Check,
  ChevronDown,
  Download,
  Ellipsis,
  File,
  Folder,
  FolderOpen,
  Search as SearchIcon,
  Settings2,
  SlidersHorizontal,
  Tags,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageIntro, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { getDocumentDownloadUrl } from '@/features/documents/documents.api';
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

function getDocumentTypeLabel(document: SearchResultItem) {
  const extension = document.name.split('.').pop()?.trim().toUpperCase();

  if (extension && extension.length <= 5) {
    return extension;
  }

  if (document.mimeType === 'application/pdf') {
    return 'PDF';
  }

  if (document.mimeType.startsWith('image/')) {
    return 'IMG';
  }

  if (document.mimeType.includes('spreadsheet') || document.mimeType.includes('excel') || document.mimeType.includes('csv')) {
    return 'XLS';
  }

  if (document.mimeType.includes('word') || document.mimeType.includes('document')) {
    return 'DOC';
  }

  if (document.mimeType.startsWith('text/')) {
    return 'TXT';
  }

  return 'FILE';
}

function getDocumentTypeClasses(label: string) {
  switch (label) {
    case 'PDF':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'TXT':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    case 'PNG':
    case 'JPG':
    case 'JPEG':
    case 'WEBP':
    case 'GIF':
    case 'IMG':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'DOC':
    case 'DOCX':
      return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
    case 'CSV':
    case 'XLS':
    case 'XLSX':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    default:
      return 'bg-secondary text-primary ring-border/60';
  }
}

function FileTypeIcon({ document }: { document: SearchResultItem }) {
  const label = getDocumentTypeLabel(document);

  return (
    <div
      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${getDocumentTypeClasses(label)}`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center leading-none">
        <File className="mb-1 size-3.5" />
        <span className="text-[0.62rem] font-extrabold tracking-[0.12em]">{label}</span>
      </div>
    </div>
  );
}

function VaultIcon() {
  return (
    <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary ring-1 ring-border/60">
      <Folder className="size-5" />
    </div>
  );
}

function VisibleTags({ document }: { document: SearchResultItem }) {
  const tags = document.tags ?? [];

  if (tags.length === 0) {
    return <span className="text-sm text-muted-foreground">No tags</span>;
  }

  const visibleTags = tags.slice(0, 2);
  const remainingCount = tags.length - visibleTags.length;

  return (
    <>
      {visibleTags.map(tag => (
        <TagPill key={tag.id} name={tag.name} color={tag.color} />
      ))}
      {remainingCount > 0 ? (
        <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
          +{remainingCount} more
        </span>
      ) : null}
    </>
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
  const [openVaultMenuId, setOpenVaultMenuId] = useState<string | null>(null);
  const [openDocumentMenuId, setOpenDocumentMenuId] = useState<string | null>(null);
  const [collapsedVaultIds, setCollapsedVaultIds] = useState<string[]>([]);
  const tagsPanelRef = useRef<HTMLDivElement | null>(null);
  const datePanelRef = useRef<HTMLDivElement | null>(null);
  const vaultMenuRef = useRef<HTMLDivElement | null>(null);
  const documentMenuRef = useRef<HTMLDivElement | null>(null);

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
  useDismissableLayer({
    isOpen: openVaultMenuId !== null,
    onClose: () => setOpenVaultMenuId(null),
    ref: vaultMenuRef,
  });
  useDismissableLayer({
    isOpen: openDocumentMenuId !== null,
    onClose: () => setOpenDocumentMenuId(null),
    ref: documentMenuRef,
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

  function toggleVaultCollapsed(vaultId: string) {
    setCollapsedVaultIds(current =>
      current.includes(vaultId)
        ? current.filter(id => id !== vaultId)
        : [...current, vaultId],
    );
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
            <Folder className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
                        setOpenDocumentMenuId(null);
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
                  <div className="hidden grid-cols-[minmax(0,1.9fr)_160px_120px_180px_76px] gap-5 border-b border-border/70 px-5 py-4 text-sm text-muted-foreground md:grid sm:px-6">
                    <span>Name</span>
                    <span>Updated</span>
                    <span>Size</span>
                    <span>Tags</span>
                    <span className="text-right">Actions</span>
                  </div>

                  <div className="divide-y divide-border/70">
                    {group.documents.map(document => (
                      <article
                        key={document.documentId}
                        className="grid gap-5 px-5 py-5 md:grid-cols-[minmax(0,1.9fr)_160px_120px_180px_76px] md:items-center sm:px-6"
                      >
                        <div className="flex items-start gap-4">
                          <FileTypeIcon document={document} />
                          <div className="min-w-0">
                            <Link
                              to={`/vaults/${document.vaultId}/documents/${document.documentId}`}
                              className="block truncate text-2xl font-semibold tracking-[-0.03em] text-foreground transition hover:text-primary"
                            >
                              {document.name}
                            </Link>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {document.originalName !== document.name ? `${document.originalName} • ` : ''}
                              Uploaded {formatDate(document.createdAt)}
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
                          <p className="vault-label md:hidden">Updated</p>
                          <p className="mt-2 text-base text-foreground md:mt-0">
                            {formatDate(document.updatedAt)}
                          </p>
                        </div>

                        <div className="text-sm text-muted-foreground">
                          <p className="vault-label md:hidden">Size</p>
                          <p className="mt-2 text-base text-foreground md:mt-0">{formatBytes(document.originalSize)}</p>
                        </div>

                        <div className="text-sm text-muted-foreground">
                          <p className="vault-label md:hidden">Tags</p>
                          <div className="mt-2 flex flex-wrap gap-2 md:mt-0">
                            <VisibleTags document={document} />
                          </div>
                        </div>

                        <div className="flex justify-start md:justify-end">
                          <div ref={openDocumentMenuId === document.documentId ? documentMenuRef : null}>
                            <OverflowMenu
                              isOpen={openDocumentMenuId === document.documentId}
                              onToggle={() => {
                                setOpenVaultMenuId(null);
                                setOpenDocumentMenuId(current => current === document.documentId ? null : document.documentId);
                              }}
                              label={`Open actions for ${document.name}`}
                              side="bottom"
                            >
                              <MenuLink
                                to={`/vaults/${document.vaultId}/documents/${document.documentId}`}
                                icon={<FolderOpen className="size-4" />}
                                onSelect={() => setOpenDocumentMenuId(null)}
                              >
                                Open document
                              </MenuLink>
                              <MenuAnchor
                                href={getDocumentDownloadUrl({
                                  vaultId: document.vaultId,
                                  documentId: document.documentId,
                                })}
                                icon={<Download className="size-4" />}
                                onSelect={() => setOpenDocumentMenuId(null)}
                              >
                                Download
                              </MenuAnchor>
                            </OverflowMenu>
                          </div>
                        </div>
                      </article>
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
