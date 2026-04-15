import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Search as SearchIcon, Tags, Vault } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageIntro, StatCard, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { listDocuments } from '@/features/documents/documents.api';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { formatBytes, formatDate, sortDocuments } from '@/features/documents/documents.utils';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import type { SearchResultItem } from '@/features/search/search.types';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

function DocumentIcon() {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary ring-1 ring-border/60">
      <FileText className="size-5" />
    </div>
  );
}

export function AllDocumentsPage() {
  const [query, setQuery] = useState('');
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [collapsedVaults, setCollapsedVaults] = useState<Record<string, boolean>>({});
  const deferredQuery = useDeferredValue(query.trim());

  const vaultsQuery = useVaultsQuery();
  const vaults = vaultsQuery.data?.vaults ?? [];
  const tagsQuery = useTagsQuery({ vaultId: selectedVaultId });

  const documentQueries = useQueries({
    queries: vaults.map(vault => ({
      queryKey: documentQueryKeys.list(vault.id, {
        tagId: selectedVaultId === vault.id && selectedTagId ? selectedTagId : undefined,
      }),
      queryFn: () => listDocuments({
        vaultId: vault.id,
        tagId: selectedVaultId === vault.id && selectedTagId ? selectedTagId : undefined,
      }),
      enabled: vaults.length > 0,
    })),
  });

  const searchQuery = useGlobalSearchDocumentsQuery({
    query: deferredQuery,
    pageIndex: 0,
    pageSize: 25,
    vaultId: selectedVaultId || undefined,
    tagId: selectedTagId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const isLoadingDocuments = documentQueries.some(queryResult => queryResult.isLoading);
  const isErrorDocuments = documentQueries.some(queryResult => queryResult.isError);

  useEffect(() => {
    setCollapsedVaults((current) => {
      const next = { ...current };

      for (const vault of vaults) {
        if (!(vault.id in next)) {
          next[vault.id] = false;
        }
      }

      return next;
    });
  }, [vaults]);

  useEffect(() => {
    if (!selectedVaultId) {
      setSelectedTagId('');
    }
  }, [selectedVaultId]);

  const groupedDocuments = useMemo(() => {
    if (deferredQuery.length > 0) {
      const grouped = new Map<string, {
        vault: (typeof vaults)[number];
        documents: SearchResultItem[];
      }>();

      for (const result of searchQuery.data?.results ?? []) {
        const vault = vaults.find(item => item.id === result.vaultId);

        if (!vault) {
          continue;
        }

        if (!grouped.has(vault.id)) {
          grouped.set(vault.id, { vault, documents: [] });
        }

        grouped.get(vault.id)?.documents.push(result);
      }

      return Array.from(grouped.values());
    }

    const selectedVault = selectedVaultId.length > 0 ? selectedVaultId : null;
    const dateFromValue = dateFrom ? new Date(dateFrom) : null;
    const dateToValue = dateTo ? new Date(dateTo) : null;

    return vaults
      .filter(vault => !selectedVault || vault.id === selectedVault)
      .map((vault, index) => {
        const documents = sortDocuments(documentQueries[index]?.data?.documents ?? [], 'newest')
          .filter((document) => {
            const documentDateValue = document.documentDate ? new Date(document.documentDate) : null;

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
          });

        return {
          vault,
          documents,
        };
      })
      .filter(group => group.documents.length > 0 || selectedVaultId.length === 0);
  }, [dateFrom, dateTo, deferredQuery, documentQueries, searchQuery.data?.results, selectedVaultId, vaults]);

  const totalDocuments = useMemo(
    () => groupedDocuments.reduce((count, group) => count + group.documents.length, 0),
    [groupedDocuments],
  );

  useEffect(() => {
    if (deferredQuery.length > 0) {
      setCollapsedVaults((current) => {
        const next = { ...current };

        for (const group of groupedDocuments) {
          next[group.vault.id] = false;
        }

        return next;
      });
    }
  }, [deferredQuery, groupedDocuments]);

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Documents Library"
        title="Documents"
        description="Browse all accessible documents across your vaults, grouped by workspace."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Accessible vaults"
          value={(vaultsQuery.data?.vaults ?? []).length}
          meta="Documents remain grouped by the workspaces you can access."
          icon={<Vault className="size-5" />}
        />
        <StatCard
          label="Current scope"
          value={selectedVaultId ? 'Focused' : 'All vaults'}
          meta={selectedVaultId ? 'The current view is limited to one vault.' : 'The current view spans every accessible vault.'}
          icon={<FileText className="size-5" />}
        />
        <StatCard
          label="Matches"
          value={deferredQuery.length > 0 ? (searchQuery.data?.resultsCount ?? 0) : totalDocuments}
          meta={deferredQuery.length > 0 ? 'Full-text results update as filters change.' : 'Document count for the current filtered library view.'}
          icon={<SearchIcon className="size-5" />}
        />
      </div>

      <SurfacePanel className="space-y-5">
        <div>
          <p className="vault-label">Search Controls</p>
          <h2 className="font-display mt-2 text-xl font-bold tracking-[-0.03em] text-foreground">Query and refine</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-2">
            <label htmlFor="documents-search" className="vault-label">Search text</label>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="documents-search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search invoices, clauses, names..."
                className={`${vaultInputClassName} pl-11`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="documents-vault" className="vault-label">Vault scope</label>
            <select
              id="documents-vault"
              value={selectedVaultId}
              onChange={event => setSelectedVaultId(event.target.value)}
              className={vaultInputClassName}
            >
              <option value="">All vaults</option>
              {(vaultsQuery.data?.vaults ?? []).map(vault => (
                <option key={vault.id} value={vault.id}>{vault.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="documents-tag" className="vault-label">Tag filter</label>
            <select
              id="documents-tag"
              value={selectedTagId}
              onChange={event => setSelectedTagId(event.target.value)}
              className={vaultInputClassName}
              disabled={!selectedVaultId}
            >
              <option value="">{selectedVaultId ? 'All tags' : 'Choose a vault first'}</option>
              {(tagsQuery.data?.tags ?? []).map(tag => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-2">
              <label htmlFor="documents-date-from" className="vault-label">Date from</label>
              <input
                id="documents-date-from"
                type="date"
                value={dateFrom}
                onChange={event => setDateFrom(event.target.value)}
                className={vaultInputClassName}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="documents-date-to" className="vault-label">Date to</label>
              <input
                id="documents-date-to"
                type="date"
                value={dateTo}
                onChange={event => setDateTo(event.target.value)}
                className={vaultInputClassName}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <p className="text-muted-foreground">
            {deferredQuery.length > 0
              ? `${searchQuery.data?.resultsCount ?? 0} match${(searchQuery.data?.resultsCount ?? 0) === 1 ? '' : 'es'}`
              : `${totalDocuments} document${totalDocuments === 1 ? '' : 's'} across ${vaults.length} vault${vaults.length === 1 ? '' : 's'}`}
          </p>
          {groupedDocuments.length > 0 ? (
            <>
              <button
                type="button"
                className="vault-link"
                onClick={() => {
                  setCollapsedVaults(
                    Object.fromEntries(groupedDocuments.map(group => [group.vault.id, true])),
                  );
                }}
              >
                Collapse all
              </button>
              <button
                type="button"
                className="vault-link"
                onClick={() => {
                  setCollapsedVaults(
                    Object.fromEntries(groupedDocuments.map(group => [group.vault.id, false])),
                  );
                }}
              >
                Expand all
              </button>
            </>
          ) : null}
        </div>
      </SurfacePanel>

      {vaultsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading vaults...</p> : null}
      {vaultsQuery.isError ? <p className="text-sm text-destructive">Unable to load vaults.</p> : null}
      {deferredQuery.length === 0 && isLoadingDocuments ? <p className="text-sm text-muted-foreground">Loading documents...</p> : null}
      {deferredQuery.length === 0 && isErrorDocuments ? <p className="text-sm text-destructive">Unable to load the full document library.</p> : null}
      {deferredQuery.length > 0 && searchQuery.isLoading ? <p className="text-sm text-muted-foreground">Searching documents...</p> : null}
      {deferredQuery.length > 0 && searchQuery.isError ? <p className="text-sm text-destructive">Unable to search your documents.</p> : null}

      {!vaultsQuery.isLoading && !isLoadingDocuments && !searchQuery.isLoading && groupedDocuments.length === 0 ? (
        <SurfacePanel>
          <p className="text-sm text-muted-foreground">
            {deferredQuery.length > 0 ? 'No documents matched your query and filters.' : 'No documents matched the current filters.'}
          </p>
        </SurfacePanel>
      ) : null}

      <div className="space-y-6">
        {groupedDocuments.map(group => (
          <SurfacePanel key={group.vault.id} className="overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b border-border/70 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
              <button
                type="button"
                className="flex flex-1 items-start gap-3 text-left"
                onClick={() => {
                  setCollapsedVaults(current => ({
                    ...current,
                    [group.vault.id]: !current[group.vault.id],
                  }));
                }}
              >
                <span className="mt-1 text-muted-foreground">
                  {collapsedVaults[group.vault.id] ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                </span>
                <div>
                  <p className="vault-label">Vault</p>
                  <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-foreground">
                    {group.vault.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {group.documents.length} result{group.documents.length === 1 ? '' : 's'} • role: {group.vault.role ?? 'global_admin'}
                  </p>
                </div>
              </button>
              <div className="flex gap-4">
                <Link to={`/vaults/${group.vault.id}/documents`} className="vault-link">Open vault documents</Link>
                <Link to={`/vaults/${group.vault.id}/settings`} className="vault-link">Vault settings</Link>
              </div>
            </div>

            {!collapsedVaults[group.vault.id] ? (
              <div className="divide-y divide-border/70">
                {group.documents.map(document => {
                  const isSearchResult = 'documentId' in document;
                  const documentId = isSearchResult ? document.documentId : document.id;

                  return (
                    <article key={documentId} className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.3fr)_200px_180px_140px] md:items-center md:gap-6">
                      <div className="flex items-start gap-4">
                        <DocumentIcon />
                        <div className="min-w-0">
                          <Link to={`/vaults/${group.vault.id}/documents/${documentId}`} className="block truncate text-2xl font-semibold tracking-[-0.03em] text-foreground transition hover:text-primary">
                            {document.name}
                          </Link>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {isSearchResult
                              ? `${document.mimeType} • Updated ${formatDate(document.updatedAt)}`
                              : `${formatBytes(document.originalSize)} • ${document.mimeType}`}
                          </p>
                          {isSearchResult ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {tokenizeSnippet(document.bestChunk.snippet).map(part =>
                                part.highlighted
                                  ? (
                                      <mark key={`${documentId}-${part.key}`} className="rounded bg-accent px-1 text-accent-foreground">
                                        {part.text}
                                      </mark>
                                    )
                                  : <span key={`${documentId}-${part.key}`}>{part.text}</span>,
                              )}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {document.documentDate ? formatDate(document.documentDate) : 'No date'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(document.createdAt)}
                      </div>
                      <div className="flex gap-3">
                        <Link to={`/vaults/${group.vault.id}/documents/${documentId}`} className="vault-link">Open</Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </SurfacePanel>
        ))}
      </div>
    </section>
  );
}
