import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useEffect } from 'react';
import { Check, ChevronDown, Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { vaultInputClassName } from '@/components/layout/vault-ui';

export interface DocumentSearchControlOption<TValue extends string> {
  value: TValue;
  label: string;
}

export interface DocumentSearchControlFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/20 hover:bg-secondary"
    >
      <span>{label}</span>
      <X className="size-4 text-muted-foreground" />
    </button>
  );
}

export function DocumentSearchControls<TSortValue extends string>({
  query,
  onQueryChange,
  searchPlaceholder,
  searchAriaLabel,
  isFiltersOpen,
  onOpenFilters,
  onCloseFilters,
  onResetFilters,
  activeFilterCount,
  activeFilters,
  onClearFilters,
  sortBy,
  onSortChange,
  sortOptions,
  sortSelectId,
  sortAriaLabel,
  filtersTitle,
  filtersDescription,
  filtersContent,
  onDialogPointerDownCapture,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  isFiltersOpen: boolean;
  onOpenFilters: () => void;
  onCloseFilters: () => void;
  onResetFilters: () => void;
  activeFilterCount: number;
  activeFilters: DocumentSearchControlFilter[];
  onClearFilters: () => void;
  sortBy: TSortValue;
  onSortChange: (value: TSortValue) => void;
  sortOptions: Array<DocumentSearchControlOption<TSortValue>>;
  sortSelectId: string;
  sortAriaLabel: string;
  filtersTitle: string;
  filtersDescription: string;
  filtersContent: ReactNode;
  onDialogPointerDownCapture?: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  useEffect(() => {
    if (!isFiltersOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseFilters();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFiltersOpen, onCloseFilters]);

  return (
    <>
      <div className="rounded-[28px] border border-border/70 bg-card p-3 shadow-[0_18px_50px_rgba(13,23,62,0.05)] sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label={searchAriaLabel}
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-16 w-full rounded-[20px] border border-border/70 bg-background pl-14 pr-4 text-lg text-foreground outline-none transition focus-visible:border-primary/20 focus-visible:ring-2 focus-visible:ring-primary/15"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:items-center">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onOpenFilters}
              className="h-16 min-w-[10rem] justify-center rounded-[20px] border-border/70 px-5 text-base shadow-none"
            >
              <SlidersHorizontal className="size-5" />
              <span>Filter</span>
              {activeFilterCount > 0 ? (
                <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-secondary px-2 py-1 text-xs font-bold text-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>

            <div className="flex items-center gap-3 rounded-[20px] border border-border/70 bg-background px-4 py-2 shadow-none">
              <label htmlFor={sortSelectId} className="text-sm font-semibold text-muted-foreground">
                Sort by:
              </label>
              <div className="relative">
                <select
                  id={sortSelectId}
                  aria-label={sortAriaLabel}
                  value={sortBy}
                  onChange={event => onSortChange(event.target.value as TSortValue)}
                  className={`${vaultInputClassName} h-11 min-w-[11rem] appearance-none rounded-[16px] border-0 bg-transparent pl-0 pr-8 text-base font-semibold ring-0 focus-visible:ring-0`}
                >
                  {sortOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>

        {activeFilters.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Active filters:</span>
              {activeFilters.map(filter => (
                <ActiveFilterChip key={filter.key} label={filter.label} onRemove={filter.onRemove} />
              ))}
            </div>

            <button type="button" className="vault-link text-left" onClick={onClearFilters}>
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      {isFiltersOpen ? (
        <div
          className="fixed inset-0 z-40 bg-[rgba(17,27,70,0.18)] px-4 py-6 backdrop-blur-[4px] sm:px-6"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              onCloseFilters();
            }
          }}
        >
          <div className="mx-auto flex h-full max-w-6xl items-start justify-end">
            <div
              role="dialog"
              aria-modal="true"
              aria-label={filtersTitle}
              onPointerDownCapture={onDialogPointerDownCapture}
              className="max-h-full w-full max-w-2xl overflow-y-auto rounded-[30px] border border-border/70 bg-card p-5 shadow-[0_40px_90px_rgba(13,23,62,0.18)] sm:p-7"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                    <SlidersHorizontal className="size-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-3xl font-bold tracking-[-0.04em] text-foreground">{filtersTitle}</h2>
                    <p className="text-sm text-muted-foreground">{filtersDescription}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button type="button" className="vault-link" onClick={onResetFilters}>
                    Reset
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Close filters"
                    className="rounded-2xl"
                    onClick={onCloseFilters}
                  >
                    <X className="size-5" />
                  </Button>
                </div>
              </div>

              <div className="mt-8 space-y-7">
                {filtersContent}
              </div>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-border/70 pt-5">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="size-3.5" />
                  </span>
                  Results update automatically
                </div>
                <Button type="button" onClick={onCloseFilters} className="rounded-[18px] px-5">
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
