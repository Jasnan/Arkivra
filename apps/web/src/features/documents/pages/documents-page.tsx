import type { ChangeEvent } from 'react';
import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  getDocumentDownloadUrl,
  softDeleteDocument,
  uploadDocument,
} from '@/features/documents/documents.api';
import { documentQueryKeys, useDocumentsQuery } from '@/features/documents/documents.queries';
import { formatBytes, formatDate, sortDocuments } from '@/features/documents/documents.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
const PAGE_SIZE = 8;

export function DocumentsPage() {
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId ?? '';
  const uploadInputId = useId();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc'>('newest');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const documentsQuery = useDocumentsQuery({
    vaultId,
    tagId: selectedTagId || undefined,
  });
  const tagsQuery = useTagsQuery({ vaultId });

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

  if (!vaultId) {
    return <p className="text-sm text-destructive">Invalid vault id.</p>;
  }

  const documents = documentsQuery.data?.documents ?? [];
  const filteredDocuments = sortDocuments(
    documents.filter(document => document.name.toLowerCase().includes(search.toLowerCase().trim())),
    sort,
  );
  const pageCount = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const visibleDocuments = filteredDocuments.slice(
    safePageIndex * PAGE_SIZE,
    (safePageIndex + 1) * PAGE_SIZE,
  );

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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-serif text-4xl tracking-tight">Documents</h2>
          <p className="text-sm text-muted-foreground">Upload, filter, and review documents in this vault.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/vaults/${vaultId}/documents/trash`} className="inline-flex h-10 items-center justify-center rounded-xl border border-input px-4 text-sm font-medium hover:bg-accent">
            Open trash
          </Link>
          <Link to={`/vaults/${vaultId}/tags`} className="inline-flex h-10 items-center justify-center rounded-xl border border-input px-4 text-sm font-medium hover:bg-accent">
            Manage tags
          </Link>
          <label htmlFor={uploadInputId} className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {uploadMutation.isPending ? 'Uploading…' : 'Upload files'}
          </label>
          <input
            id={uploadInputId}
            type="file"
            multiple
            className="sr-only"
            onChange={handleUploadChange}
          />
        </div>
      </div>

      {statusMessage ? <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">{statusMessage}</p> : null}
      {errorMessage ? <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p> : null}

      <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-1.5">
          <label htmlFor="document-search" className="text-sm font-medium">Filter by name</label>
          <input
            id="document-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPageIndex(0);
            }}
            placeholder="invoice, receipt, contract..."
            className={inputClassName}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="document-tag" className="text-sm font-medium">Tag filter</label>
          <select
            id="document-tag"
            value={selectedTagId}
            onChange={(event) => {
              setSelectedTagId(event.target.value);
              setPageIndex(0);
            }}
            className={inputClassName}
          >
            <option value="">All tags</option>
            {(tagsQuery.data?.tags ?? []).map(tag => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="document-sort" className="text-sm font-medium">Sort</label>
          <select
            id="document-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className={inputClassName}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="size-desc">Largest first</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6">
        <h3 className="text-lg font-semibold">Drop zone ready</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the upload button for single or multi-file uploads. Drag-and-drop is represented here in the layout and can share the same hidden file input workflow.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Library</h3>
          <p className="text-sm text-muted-foreground">{filteredDocuments.length} visible</p>
        </div>

        {documentsQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading documents…</p> : null}
        {documentsQuery.isError ? <p className="mt-4 text-sm text-destructive">Unable to load documents.</p> : null}

        {!documentsQuery.isLoading && filteredDocuments.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No documents match the current filters.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visibleDocuments.map(document => (
              <li key={document.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <Link to={`/vaults/${vaultId}/documents/${document.id}`} className="font-medium text-primary hover:underline">
                      {document.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {document.mimeType} • {formatBytes(document.originalSize)} • Uploaded {formatDate(document.createdAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Document date: {formatDate(document.documentDate)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={getDocumentDownloadUrl({ vaultId, documentId: document.id })}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-input px-4 text-sm font-medium hover:bg-accent"
                    >
                      Download
                    </a>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        setStatusMessage(null);
                        setErrorMessage(null);
                        deleteMutation.mutate({ vaultId, documentId: document.id });
                      }}
                    >
                      Move to trash
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {safePageIndex + 1} of {pageCount}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={safePageIndex === 0}
              onClick={() => setPageIndex(current => Math.max(0, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={safePageIndex >= pageCount - 1}
              onClick={() => setPageIndex(current => Math.min(pageCount - 1, current + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
