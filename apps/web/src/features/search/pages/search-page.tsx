import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { formatDate } from '@/features/documents/documents.utils';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { stripSnippetMarkup, tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
const PAGE_SIZE = 10;

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const vaultId = searchParams.get('vaultId') ?? '';
  const tagId = searchParams.get('tagId') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const pageIndex = Number.parseInt(searchParams.get('pageIndex') ?? '0', 10) || 0;

  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (query.trim().length > 0) {
      next.set('q', query.trim());
    } else {
      next.delete('q');
    }

    next.set('pageIndex', '0');
    setSearchParams(next, { replace: true });
  }, [query, searchParams, setSearchParams]);

  const vaultsQuery = useVaultsQuery();
  const tagsQuery = useTagsQuery({ vaultId });
  const searchQuery = useGlobalSearchDocumentsQuery({
    query: deferredQuery,
    pageIndex,
    pageSize: PAGE_SIZE,
    vaultId: vaultId || undefined,
    tagId: tagId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const totalPages = useMemo(() => {
    const count = searchQuery.data?.resultsCount ?? 0;
    return Math.max(1, Math.ceil(count / PAGE_SIZE));
  }, [searchQuery.data?.resultsCount]);

  function updateFilters(nextValues: Record<string, string>) {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(nextValues)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }

    next.set('pageIndex', '0');
    setSearchParams(next, { replace: true });
  }

  return (
    <section className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-serif text-4xl tracking-tight">Search</h2>
          <p className="text-sm text-muted-foreground">Search extracted text across all vaults you can access.</p>
        </div>
        <Link to="/vaults" className="text-sm font-medium text-primary hover:underline">
          Back to vaults
        </Link>
      </div>

      <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="space-y-1.5">
          <label htmlFor="global-search" className="text-sm font-medium">Search text</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="global-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search invoices, clauses, names..."
              className="h-10 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="search-vault" className="text-sm font-medium">Vault scope</label>
          <select
            id="search-vault"
            value={vaultId}
            onChange={(event) => {
              const nextVaultId = event.target.value;
              updateFilters({
                vaultId: nextVaultId,
                tagId: nextVaultId ? tagId : '',
              });
            }}
            className={inputClassName}
          >
            <option value="">All vaults</option>
            {(vaultsQuery.data?.vaults ?? []).map(vault => (
              <option key={vault.id} value={vault.id}>{vault.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="search-tag" className="text-sm font-medium">Tag filter</label>
          <select
            id="search-tag"
            value={tagId}
            onChange={event => updateFilters({ tagId: event.target.value })}
            className={inputClassName}
            disabled={!vaultId}
          >
            <option value="">{vaultId ? 'All tags' : 'Choose a vault first'}</option>
            {(tagsQuery.data?.tags ?? []).map(tag => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="space-y-1.5">
            <label htmlFor="date-from" className="text-sm font-medium">Date from</label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={event => updateFilters({ dateFrom: event.target.value })}
              className={inputClassName}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="date-to" className="text-sm font-medium">Date to</label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={event => updateFilters({ dateTo: event.target.value })}
              className={inputClassName}
            />
          </div>
        </div>
      </div>

      {deferredQuery.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-sm text-muted-foreground">
          Start typing to search extracted text across all accessible vaults.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Results</h3>
            <p className="text-sm text-muted-foreground">{searchQuery.data?.resultsCount ?? 0} matches</p>
          </div>

          {searchQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Searching…</p> : null}
          {searchQuery.isError ? <p className="mt-4 text-sm text-destructive">Unable to search your vaults.</p> : null}

          {!searchQuery.isLoading && (searchQuery.data?.results.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No documents matched your query and filters.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {(searchQuery.data?.results ?? []).map(result => (
                <li key={`${result.vaultId}-${result.documentId}`} className="rounded-xl border border-border bg-background p-4">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <Link to={`/vaults/${result.vaultId}/documents/${result.documentId}`} className="font-medium text-primary hover:underline">
                          {result.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {result.vaultName} • {result.mimeType} • {result.matchedChunksCount} matching chunk{result.matchedChunksCount === 1 ? '' : 's'} • Updated {formatDate(result.updatedAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Document date: {formatDate(result.documentDate)}
                        </p>
                      </div>
                      <Link to={`/vaults/${result.vaultId}/documents/${result.documentId}`} className="text-sm font-medium text-primary hover:underline">
                        Open document
                      </Link>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-4 text-sm leading-6">
                      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Best matching snippet
                        {result.bestChunk.pageNumber !== null ? ` • Page ${result.bestChunk.pageNumber}` : ''}
                      </p>
                      <p className="break-words">
                        {tokenizeSnippet(result.bestChunk.snippet).map(part =>
                          part.highlighted
                            ? (
                                <mark key={`${result.documentId}-${part.key}`} className="rounded-sm bg-primary/15 px-1 text-foreground">
                                  {part.text}
                                </mark>
                              )
                            : <span key={`${result.documentId}-${part.key}`}>{part.text}</span>,
                        )}
                      </p>
                    </div>

                    <details className="rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
                      <summary className="cursor-pointer font-medium text-foreground">Matched chunk preview</summary>
                      <p className="mt-3 whitespace-pre-wrap break-words">{stripSnippetMarkup(result.bestChunk.content)}</p>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Page {pageIndex + 1} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-input px-4 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 hover:bg-accent"
                disabled={pageIndex === 0}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('pageIndex', String(Math.max(0, pageIndex - 1)));
                  setSearchParams(next, { replace: true });
                }}
              >
                Previous
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-input px-4 text-sm font-medium disabled:pointer-events-none disabled:opacity-50 hover:bg-accent"
                disabled={pageIndex >= totalPages - 1}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('pageIndex', String(Math.min(totalPages - 1, pageIndex + 1)));
                  setSearchParams(next, { replace: true });
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
