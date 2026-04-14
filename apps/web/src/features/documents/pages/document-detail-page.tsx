import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  getDocumentDownloadUrl,
  getDocumentInlineFileUrl,
  renameDocument,
  restoreDocument,
  softDeleteDocument,
  updateDocumentDate,
} from '@/features/documents/documents.api';
import { documentQueryKeys, useDocumentQuery, useDocumentTagsQuery } from '@/features/documents/documents.queries';
import { deriveExtractionStatus, formatBytes, formatDate } from '@/features/documents/documents.utils';
import { assignTagToDocument, removeTagFromDocument } from '@/features/tags/tags.api';
import { tagQueryKeys, useTagsQuery } from '@/features/tags/tags.queries';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function DocumentDetailPage() {
  const params = useParams<{ vaultId: string; documentId: string }>();
  const vaultId = params.vaultId ?? '';
  const documentId = params.documentId ?? '';
  const queryClient = useQueryClient();

  const documentQuery = useDocumentQuery({ vaultId, documentId });
  const documentTagsQuery = useDocumentTagsQuery({ vaultId, documentId });
  const tagsQuery = useTagsQuery({ vaultId });

  const [renameValue, setRenameValue] = useState('');
  const [documentDateValue, setDocumentDateValue] = useState('');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const invalidateDocument = async () => {
    await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    await queryClient.invalidateQueries({ queryKey: tagQueryKeys.list(vaultId) });
  };

  const renameMutation = useMutation({
    mutationFn: renameDocument,
    onSuccess: async () => {
      setStatusMessage('Document renamed.');
      setErrorMessage(null);
      await invalidateDocument();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not rename document.');
      setStatusMessage(null);
    },
  });

  const dateMutation = useMutation({
    mutationFn: updateDocumentDate,
    onSuccess: async () => {
      setStatusMessage('Document date updated.');
      setErrorMessage(null);
      await invalidateDocument();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update document date.');
      setStatusMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteDocument,
    onSuccess: async () => {
      setStatusMessage('Document moved to trash.');
      setErrorMessage(null);
      await invalidateDocument();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete document.');
      setStatusMessage(null);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreDocument,
    onSuccess: async () => {
      setStatusMessage('Document restored.');
      setErrorMessage(null);
      await invalidateDocument();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not restore document.');
      setStatusMessage(null);
    },
  });

  const assignTagMutation = useMutation({
    mutationFn: assignTagToDocument,
    onSuccess: async () => {
      setStatusMessage('Tag assigned.');
      setErrorMessage(null);
      setSelectedTagId('');
      await invalidateDocument();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not assign tag.');
      setStatusMessage(null);
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: removeTagFromDocument,
    onSuccess: async () => {
      setStatusMessage('Tag removed.');
      setErrorMessage(null);
      await invalidateDocument();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not remove tag.');
      setStatusMessage(null);
    },
  });

  if (!vaultId || !documentId) {
    return <p className="text-sm text-destructive">Invalid document route.</p>;
  }

  if (documentQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading document…</p>;
  }

  if (documentQuery.isError || !documentQuery.data) {
    return <p className="text-sm text-destructive">Unable to load document.</p>;
  }

  const document = documentQuery.data.document;
  const assignedTags = documentTagsQuery.data?.tags ?? [];
  const availableTags = (tagsQuery.data?.tags ?? []).filter(
    tag => !assignedTags.some(assigned => assigned.id === tag.id),
  );
  const extractionStatus = deriveExtractionStatus(document);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = renameValue.trim() || document.name;
    setStatusMessage(null);
    setErrorMessage(null);
    await renameMutation.mutateAsync({ vaultId, documentId, name: nextName });
  }

  async function handleDocumentDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    await dateMutation.mutateAsync({
      vaultId,
      documentId,
      documentDate: documentDateValue ? new Date(documentDateValue).toISOString() : null,
    });
  }

  return (
    <section className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to={document.isDeleted ? `/vaults/${vaultId}/documents/trash` : `/vaults/${vaultId}/documents`} className="text-sm font-medium text-primary hover:underline">
            Back to {document.isDeleted ? 'trash' : 'documents'}
          </Link>
          <h2 className="mt-2 font-serif text-4xl tracking-tight">{document.name}</h2>
          <p className="text-sm text-muted-foreground">{document.originalName} • {document.id}</p>
        </div>
        <a
          href={getDocumentDownloadUrl({ vaultId, documentId })}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Download original
        </a>
      </div>

      {statusMessage ? <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">{statusMessage}</p> : null}
      {errorMessage ? <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Metadata</h3>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Extraction status</dt>
                <dd className="font-medium">{extractionStatus}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">File size</dt>
                <dd className="font-medium">{formatBytes(document.originalSize)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Uploaded</dt>
                <dd className="font-medium">{formatDate(document.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Document date</dt>
                <dd className="font-medium">{formatDate(document.documentDate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created by</dt>
                <dd className="font-medium">{document.createdBy ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">SHA-256</dt>
                <dd className="truncate font-mono text-xs">{document.originalSha256Hash}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Extracted content</h3>
            <p className="mt-1 text-sm text-muted-foreground">Shows OCR or extracted text when processing is complete.</p>
            <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-border bg-background p-4 text-sm whitespace-pre-wrap break-words">
              {document.content.trim().length > 0 ? document.content : 'No extracted text is available yet.'}
            </div>
          </div>

          {document.mimeType.includes('pdf') && !document.isDeleted ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="text-lg font-semibold">PDF preview</h3>
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <iframe
                  title="PDF viewer"
                  src={getDocumentInlineFileUrl({ vaultId, documentId })}
                  className="h-[600px] w-full bg-white"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Rename</h3>
            <form className="mt-4 space-y-4" onSubmit={handleRename}>
              <input
                type="text"
                defaultValue={document.name}
                className={inputClassName}
                onChange={event => setRenameValue(event.target.value)}
              />
              <Button type="submit" disabled={renameMutation.isPending}>
                {renameMutation.isPending ? 'Saving…' : 'Save name'}
              </Button>
            </form>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Document date</h3>
            <form className="mt-4 space-y-4" onSubmit={handleDocumentDate}>
              <input
                type="date"
                defaultValue={document.documentDate ? document.documentDate.slice(0, 10) : ''}
                className={inputClassName}
                onChange={event => setDocumentDateValue(event.target.value)}
              />
              <Button type="submit" disabled={dateMutation.isPending}>
                {dateMutation.isPending ? 'Saving…' : 'Save date'}
              </Button>
            </form>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Tags</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {assignedTags.length === 0 ? <p className="text-sm text-muted-foreground">No tags assigned.</p> : null}
              {assignedTags.map(tag => (
                <span key={tag.id} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color ?? '#64748b' }}
                  />
                  {tag.name}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setStatusMessage(null);
                      setErrorMessage(null);
                      removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                    }}
                  >
                    Remove
                  </button>
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <label htmlFor="assign-tag" className="text-sm font-medium">Select a tag</label>
              <select
                id="assign-tag"
                value={selectedTagId}
                onChange={event => setSelectedTagId(event.target.value)}
                className={inputClassName}
              >
                <option value="">Select a tag</option>
                {availableTags.map(tag => (
                  <option key={tag.id} value={tag.id}>{tag.name}</option>
                ))}
              </select>
              <Button
                type="button"
                disabled={!selectedTagId || assignTagMutation.isPending}
                onClick={() => {
                  setStatusMessage(null);
                  setErrorMessage(null);
                  assignTagMutation.mutate({ vaultId, documentId, tagId: selectedTagId });
                }}
              >
                {assignTagMutation.isPending ? 'Assigning…' : 'Assign tag'}
              </Button>
              <Link to={`/vaults/${vaultId}/tags`} className="text-sm font-medium text-primary hover:underline">Open tag management</Link>
            </div>
          </div>

          <div className="rounded-2xl border border-destructive/40 bg-card p-6">
            <h3 className="text-lg font-semibold text-destructive">Lifecycle</h3>
            <p className="mt-1 text-sm text-muted-foreground">Delete active documents or restore them from trash.</p>
            {document.isDeleted ? (
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={restoreMutation.isPending}
                onClick={() => {
                  setStatusMessage(null);
                  setErrorMessage(null);
                  restoreMutation.mutate({ vaultId, documentId });
                }}
              >
                {restoreMutation.isPending ? 'Restoring…' : 'Restore document'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  setStatusMessage(null);
                  setErrorMessage(null);
                  deleteMutation.mutate({ vaultId, documentId });
                }}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Move to trash'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
