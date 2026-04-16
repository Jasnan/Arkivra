import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowRight, Search as SearchIcon, Tags, Vault } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageIntro, SectionTitle, StatCard, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/features/documents/documents.utils';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { stripSnippetMarkup, tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

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
    }
    else {
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
    enabled: deferredQuery.length > 0 || vaultId.length > 0 || tagId.length > 0 || dateFrom.length > 0 || dateTo.length > 0,
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
      }
      else {
        next.delete(key);
      }
    }

    next.set('pageIndex', '0');
    setSearchParams(next, { replace: true });
  }

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Global Discovery"
        title="Search across vaults"
        description="Run full-text discovery across every vault you can access, then narrow results by vault, tag, or document date."
        actions={<Link to="/vaults" className="vault-link">Back to vaults</Link>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Accessible vaults"
          value={(vaultsQuery.data?.vaults ?? []).length}
          meta="Search spans only the workspaces your account can reach."
          icon={<Vault className="size-5" />}
        />
        <StatCard
          label="Current scope"
          value={vaultId ? 'Focused' : 'All vaults'}
          meta={vaultId ? 'Results are limited to one selected vault.' : 'Results can come from any accessible vault.'}
          icon={<Archive className="size-5" />}
        />
        <StatCard
          label="Matches"
          value={deferredQuery.length > 0 ? (searchQuery.data?.resultsCount ?? 0) : 0}
          meta={deferredQuery.length > 0 ? 'Count updates as search terms and filters change.' : 'Start typing to query extracted text.'}
          icon={<SearchIcon className="size-5" />}
        />
      </div>

      <SurfacePanel className="space-y-5">
        <SectionTitle eyebrow="Search Controls" title="Query and refine" />

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-2">
            <label htmlFor="global-search" className="vault-label">Search text</label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="global-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search invoices, clauses, names..."
                className={`${vaultInputClassName} pl-11`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="search-vault" className="vault-label">Vault scope</label>
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
              className={vaultInputClassName}
            >
              <option value="">All vaults</option>
              {(vaultsQuery.data?.vaults ?? []).map(vault => (
                <option key={vault.id} value={vault.id}>{vault.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="search-tag" className="vault-label">Tag filter</label>
            <select
              id="search-tag"
              value={tagId}
              onChange={event => updateFilters({ tagId: event.target.value })}
              className={vaultInputClassName}
              disabled={!vaultId}
            >
              <option value="">{vaultId ? 'All tags' : 'Choose a vault first'}</option>
              {(tagsQuery.data?.tags ?? []).map(tag => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-2">
              <label htmlFor="date-from" className="vault-label">Date from</label>
              <input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={event => updateFilters({ dateFrom: event.target.value })}
                className={vaultInputClassName}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="date-to" className="vault-label">Date to</label>
              <input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={event => updateFilters({ dateTo: event.target.value })}
                className={vaultInputClassName}
              />
            </div>
          </div>
        </div>
      </SurfacePanel>

      {deferredQuery.length === 0 ? (
        <SurfacePanel variant="soft" className="space-y-3">
          <p className="vault-label">Discovery Idle</p>
          <p className="text-sm leading-6 text-muted-foreground">
            Start typing to search extracted text across all accessible vaults.
          </p>
        </SurfacePanel>
      ) : (
        <SurfacePanel className="space-y-5">
          <SectionTitle
            eyebrow="Search Results"
            title="Matches"
            action={<span className="vault-chip">{searchQuery.data?.resultsCount ?? 0} matches</span>}
          />

          {searchQuery.isLoading ? <p className="text-sm text-muted-foreground">Searching...</p> : null}
          {searchQuery.isError ? <p className="text-sm text-destructive">Unable to search your vaults.</p> : null}

          {!searchQuery.isLoading && (searchQuery.data?.results.length ?? 0) === 0 ? (
            <div className="vault-empty">No documents matched your query and filters.</div>
          ) : (
            <div className="space-y-4">
              {(searchQuery.data?.results ?? []).map(result => (
                <article key={`${result.vaultId}-${result.documentId}`} className="rounded-[24px] bg-secondary/56 p-5">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div>
                          <Link to={`/vaults/${result.vaultId}/documents/${result.documentId}`} className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground transition hover:text-primary">
                            {result.name}
                          </Link>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {result.vaultName} • {result.mimeType} • {result.matchedChunksCount} matching chunk{result.matchedChunksCount === 1 ? '' : 's'} • Updated {formatDate(result.updatedAt)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Document date: {formatDate(result.documentDate)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="vault-chip">
                            <Vault className="size-3.5" />
                            {result.vaultName}
                          </span>
                          {result.bestChunk ? (
                            <span className="vault-chip">
                              <Tags className="size-3.5" />
                              {result.bestChunk.chunkType ?? 'text chunk'}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <Link to={`/vaults/${result.vaultId}/documents/${result.documentId}`} className="vault-link inline-flex items-center gap-2">
                        Open document
                        <ArrowRight className="size-4" />
                      </Link>
                    </div>

                    {result.bestChunk ? (
                      <>
                        <div className="rounded-[20px] bg-card/85 p-4 text-sm leading-7 text-foreground">
                          <p className="vault-label mb-3">
                            Best matching snippet
                            {result.bestChunk.pageNumber !== null ? ` • Page ${result.bestChunk.pageNumber}` : ''}
                          </p>
                          <p className="break-words">
                            {tokenizeSnippet(result.bestChunk.snippet).map(part =>
                              part.highlighted
                                ? (
                                    <mark key={`${result.documentId}-${part.key}`} className="rounded-md bg-accent px-1.5 py-0.5 text-foreground">
                                      {part.text}
                                    </mark>
                                  )
                                : <span key={`${result.documentId}-${part.key}`}>{part.text}</span>,
                            )}
                          </p>
                        </div>

                        <details className="rounded-[20px] bg-card/70 p-4 text-sm text-muted-foreground">
                          <summary className="cursor-pointer font-semibold text-foreground">Matched chunk preview</summary>
                          <p className="mt-3 whitespace-pre-wrap break-words leading-6">
                            {stripSnippetMarkup(result.bestChunk.content)}
                          </p>
                        </details>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Page {pageIndex + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pageIndex === 0}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('pageIndex', String(Math.max(0, pageIndex - 1)));
                  setSearchParams(next, { replace: true });
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pageIndex >= totalPages - 1}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('pageIndex', String(Math.min(totalPages - 1, pageIndex + 1)));
                  setSearchParams(next, { replace: true });
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </SurfacePanel>
      )}
    </section>
  );
}
