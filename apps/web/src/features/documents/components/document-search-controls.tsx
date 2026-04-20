import type { ReactNode } from 'react';
import { Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  filtersDescription?: string;
  filtersContent: ReactNode;
}) {
  return (
    <Dialog
      open={isFiltersOpen}
      onOpenChange={(open) => {
        if (open) {
          onOpenFilters();
          return;
        }

        onCloseFilters();
      }}
    >
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
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="lg"
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
            </DialogTrigger>

            <div className="flex items-center gap-3 rounded-[20px] border border-border/70 bg-background px-4 py-2 shadow-none">
              <span id={sortSelectId} className="text-sm font-semibold text-muted-foreground">
                Sort
              </span>
              <Select value={sortBy} onValueChange={value => onSortChange(value as TSortValue)}>
                <SelectTrigger
                  aria-label={sortAriaLabel}
                  aria-labelledby={sortSelectId}
                  className="h-11 min-w-[11rem] border-0 bg-transparent px-0 text-base shadow-none focus:ring-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

        <DialogContent
          hideCloseButton
          className="max-h-[calc(100vh-3rem)] max-w-2xl overflow-y-auto p-5 sm:p-7"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                <SlidersHorizontal className="size-5" />
              </div>
              <DialogHeader>
                <DialogTitle>{filtersTitle}</DialogTitle>
                <DialogDescription className={filtersDescription ? undefined : 'sr-only'}>
                  {filtersDescription ?? 'Adjust filters.'}
                </DialogDescription>
              </DialogHeader>
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

          <div className="mt-7 flex flex-wrap items-center justify-end gap-4 border-t border-border/70 pt-5">
            <Button type="button" onClick={onCloseFilters} className="rounded-[18px] px-5">
              Done
            </Button>
          </div>
        </DialogContent>
    </Dialog>
  );
}
