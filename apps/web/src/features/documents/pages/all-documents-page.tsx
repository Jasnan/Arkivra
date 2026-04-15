import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Search as SearchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageIntro, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { listDocuments } from '@/features/documents/documents.api';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { formatBytes, formatDate, sortDocuments } from '@/features/documents/documents.utils';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

function DocumentIcon() {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary ring-1 ring-border/60">
      <FileText className="size-5" />
    </div>
  );
}

export function AllDocumentsPage() {
  const [searchText, setSearchText] = useState('');
  const [collapsedVaults, setCollapsedVaults] = useState<Record<string, boolean>>({});
  const vaultsQuery = useVaultsQuery();
  const vaults = vaultsQuery.data?.vaults ?? [];

  const documentQueries = useQueries({
    queries: vaults.map(vault => ({
      queryKey: documentQueryKeys.list(vault.id),
      queryFn: () => listDocuments({ vaultId: vault.id }),
      enabled: vaults.length > 0,
    })),
  });

  const isLoadingDocuments = documentQueries.some(query => query.isLoading);
  const isErrorDocuments = documentQueries.some(query => query.isError);

  const groupedDocuments = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return vaults
      .map((vault, index) => {
        const documents = sortDocuments(documentQueries[index]?.data?.documents ?? [], 'newest')
          .filter(document => document.name.toLowerCase().includes(normalizedSearch));

        return {
          vault,
          documents,
        };
      })
      .filter(group => group.documents.length > 0 || normalizedSearch.length === 0);
  }, [documentQueries, searchText, vaults]);

  const totalDocuments = useMemo(
    () => groupedDocuments.reduce((count, group) => count + group.documents.length, 0),
    [groupedDocuments],
  );

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
    if (searchText.trim().length > 0) {
      setCollapsedVaults((current) => {
        const next = { ...current };

        for (const group of groupedDocuments) {
          next[group.vault.id] = false;
        }

        return next;
      });
    }
  }, [groupedDocuments, searchText]);

  return (
    <section className="space-y-6 pb-8">
      <PageIntro
        eyebrow="Documents Library"
        title="Documents"
        description="Browse all accessible documents across your vaults, grouped by workspace."
      />

      <SurfacePanel className="space-y-4">
        <div className="relative max-w-xl">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search all documents"
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Search all documents..."
            className={`${vaultInputClassName} pl-11`}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {totalDocuments} document{totalDocuments === 1 ? '' : 's'} across {vaults.length} vault{vaults.length === 1 ? '' : 's'}
        </p>
        {groupedDocuments.length > 0 ? (
          <div className="flex gap-4 text-sm">
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
          </div>
        ) : null}
      </SurfacePanel>

      {vaultsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading vaults...</p> : null}
      {vaultsQuery.isError ? <p className="text-sm text-destructive">Unable to load vaults.</p> : null}
      {isLoadingDocuments ? <p className="text-sm text-muted-foreground">Loading documents...</p> : null}
      {isErrorDocuments ? <p className="text-sm text-destructive">Unable to load the full document library.</p> : null}

      {!vaultsQuery.isLoading && !isLoadingDocuments && groupedDocuments.length === 0 ? (
        <SurfacePanel>
          <p className="text-sm text-muted-foreground">No documents matched your search.</p>
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
                    {group.documents.length} document{group.documents.length === 1 ? '' : 's'} • role: {group.vault.role ?? 'global_admin'}
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
                {group.documents.map(document => (
                  <article key={document.id} className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1.3fr)_180px_160px_140px] md:items-center md:gap-6">
                    <div className="flex items-start gap-4">
                      <DocumentIcon />
                      <div className="min-w-0">
                        <Link to={`/vaults/${group.vault.id}/documents/${document.id}`} className="block truncate text-2xl font-semibold tracking-[-0.03em] text-foreground transition hover:text-primary">
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
                      <Link to={`/vaults/${group.vault.id}/documents/${document.id}`} className="vault-link">Open</Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </SurfacePanel>
        ))}
      </div>
    </section>
  );
}
