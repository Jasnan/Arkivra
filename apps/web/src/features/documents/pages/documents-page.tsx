import type { ChangeEvent } from 'react';
import { useId, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search as SearchIcon, Upload } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageIntro, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  getDocumentDownloadUrl,
  softDeleteDocument,
  uploadDocument,
} from '@/features/documents/documents.api';
import { documentQueryKeys, useDocumentsQuery } from '@/features/documents/documents.queries';
import { formatBytes, formatDate, sortDocuments } from '@/features/documents/documents.utils';
import { useVaultSearchDocumentsQuery } from '@/features/search/search.queries';
import { tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';

const PAGE_SIZE = 8;

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
  const uploadInputId = useId();
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc'>('newest');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const documentsQuery = useDocumentsQuery({
    vaultId,
    tagId: selectedTagId || undefined,
  });
  const tagsQuery = useTagsQuery({ vaultId });
  const searchQuery = useVaultSearchDocumentsQuery({
    vaultId,
    query: searchText,
    pageIndex,
    pageSize: PAGE_SIZE,
    tagId: selectedTagId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    enabled: searchText.trim().length > 0,
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const uploads = [];

      for (const file of files) {
        uploads.push(await uploadDocument({ vaultId, file }));
      }

      return uploads;
    },
    onSuccess: async (documents) => {
      setStatusMessage(`${documents.length} document${documents.length === 1 ? '' : 's'} uploaded.`);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed.');
      setStatusMessage(null);
    },
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

  const filteredDocuments = useMemo(() => sortDocuments(
    (documentsQuery.data?.documents ?? []).filter((document) => {
      const documentDateValue = document.documentDate ? new Date(document.documentDate) : null;
      const dateFromValue = dateFrom ? new Date(dateFrom) : null;
      const dateToValue = dateTo ? new Date(dateTo) : null;

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
    sort,
  ), [dateFrom, dateTo, documentsQuery.data?.documents, sort]);

  if (!vaultId) {
    return <p className="text-sm text-destructive">Invalid vault id.</p>;
  }

  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleDocuments = filteredDocuments.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE,
  );
  const usingSearch = searchText.trim().length > 0;
  const searchResultCount = searchQuery.data?.resultsCount ?? 0;
  const activeResultCount = usingSearch ? searchResultCount : filteredDocuments.length;
  const activePageCount = Math.max(1, Math.ceil(activeResultCount / PAGE_SIZE));
  const activePageIndex = usingSearch ? pageIndex : safePageIndex;
  const emptyState = !documentsQuery.isLoading
    && !searchQuery.isLoading
    && (usingSearch ? (searchQuery.data?.results.length ?? 0) === 0 : filteredDocuments.length === 0);

  async function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    await uploadMutation.mutateAsync(files);
    event.target.value = '';
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
            <label htmlFor={uploadInputId}>
              <span className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
                <Upload className="size-4" />
                Import document
              </span>
            </label>
          </div>
        )}
      />

      {(statusMessage || errorMessage) ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <SurfacePanel className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_180px_180px]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search documents"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setPageIndex(0);
              }}
              placeholder="Search documents..."
              className={`${vaultInputClassName} pl-11`}
            />
          </div>

          <select
            aria-label="Tag filter"
            value={selectedTagId}
            onChange={(event) => {
              setSelectedTagId(event.target.value);
              setPageIndex(0);
            }}
            className={vaultInputClassName}
          >
            <option value="">All tags</option>
            {(tagsQuery.data?.tags ?? []).map(tag => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>

          <input
            aria-label="Date from"
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPageIndex(0);
            }}
            className={vaultInputClassName}
          />

          <input
            aria-label="Date to"
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPageIndex(0);
            }}
            className={vaultInputClassName}
          />

          <select
            aria-label="Sort"
            value={sort}
            onChange={event => setSort(event.target.value as typeof sort)}
            className={vaultInputClassName}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="size-desc">Largest first</option>
          </select>
        </div>

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

      <input
        id={uploadInputId}
        type="file"
        multiple
        className="sr-only"
        onChange={handleUploadChange}
      />
    </section>
  );
}
