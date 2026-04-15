import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, Download, FileText, Hash, Tags, Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageIntro, StatCard, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
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
    return <p className="text-sm text-muted-foreground">Loading document...</p>;
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
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Vault Record"
        title={document.name}
        description={`${document.originalName} • ${document.id}`}
        actions={(
          <>
            <Link to={document.isDeleted ? `/vaults/${vaultId}/documents/trash` : `/vaults/${vaultId}/documents`} className="vault-link">
              Back to {document.isDeleted ? 'trash' : 'documents'}
            </Link>
            <a href={getDocumentDownloadUrl({ vaultId, documentId })} className="vault-link inline-flex items-center gap-2">
              <Download className="size-4" />
              Download original
            </a>
          </>
        )}
      />

      {(statusMessage || errorMessage) ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Extraction status"
          value={extractionStatus}
          meta="Derived from the current document processing state."
          icon={<FileText className="size-5" />}
        />
        <StatCard
          label="File size"
          value={formatBytes(document.originalSize)}
          meta={`Uploaded ${formatDate(document.createdAt)}`}
          icon={<Hash className="size-5" />}
        />
        <StatCard
          label="Tags assigned"
          value={assignedTags.length}
          meta={assignedTags.length > 0 ? 'This document already carries labels.' : 'No tags have been assigned yet.'}
          icon={<Tags className="size-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <SurfacePanel className="space-y-5">
            <div>
              <p className="vault-label">Metadata</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Document profile</h2>
            </div>

            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="rounded-[20px] bg-secondary/55 p-4">
                <dt className="text-muted-foreground">Extraction status</dt>
                <dd className="mt-2 font-medium text-foreground">{extractionStatus}</dd>
              </div>
              <div className="rounded-[20px] bg-secondary/55 p-4">
                <dt className="text-muted-foreground">Document date</dt>
                <dd className="mt-2 font-medium text-foreground">{formatDate(document.documentDate)}</dd>
              </div>
              <div className="rounded-[20px] bg-secondary/55 p-4">
                <dt className="text-muted-foreground">Created by</dt>
                <dd className="mt-2 font-medium text-foreground">{document.createdBy ?? 'Unknown'}</dd>
              </div>
              <div className="rounded-[20px] bg-secondary/55 p-4">
                <dt className="text-muted-foreground">SHA-256</dt>
                <dd className="mt-2 truncate font-mono text-xs text-foreground">{document.originalSha256Hash}</dd>
              </div>
            </dl>
          </SurfacePanel>

          <SurfacePanel className="space-y-5">
            <div>
              <p className="vault-label">Extracted Content</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">OCR and text</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Shows OCR or extracted text when processing is complete.
              </p>
            </div>

            <div className="max-h-96 overflow-auto rounded-[22px] bg-secondary/55 p-4 text-sm whitespace-pre-wrap break-words text-foreground">
              {document.content.trim().length > 0 ? document.content : 'No extracted text is available yet.'}
            </div>
          </SurfacePanel>

          {document.mimeType.includes('pdf') && !document.isDeleted ? (
            <SurfacePanel className="space-y-5">
              <div>
                <p className="vault-label">Preview</p>
                <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">PDF viewer</h2>
              </div>
              <div className="overflow-hidden rounded-[22px] bg-secondary/55 p-2">
                <iframe
                  title="PDF viewer"
                  src={getDocumentInlineFileUrl({ vaultId, documentId })}
                  className="h-[600px] w-full rounded-[18px] bg-white"
                />
              </div>
            </SurfacePanel>
          ) : null}
        </div>

        <div className="space-y-6">
          <SurfacePanel variant="soft" className="space-y-5">
            <div>
              <p className="vault-label">Rename</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Display name</h2>
            </div>
            <form className="space-y-4" onSubmit={handleRename}>
              <input
                type="text"
                defaultValue={document.name}
                className={vaultInputClassName}
                onChange={event => setRenameValue(event.target.value)}
              />
              <Button type="submit" disabled={renameMutation.isPending}>
                {renameMutation.isPending ? 'Saving...' : 'Save name'}
              </Button>
            </form>
          </SurfacePanel>

          <SurfacePanel variant="soft" className="space-y-5">
            <div>
              <p className="vault-label">Document date</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Temporal metadata</h2>
            </div>
            <form className="space-y-4" onSubmit={handleDocumentDate}>
              <input
                type="date"
                defaultValue={document.documentDate ? document.documentDate.slice(0, 10) : ''}
                className={vaultInputClassName}
                onChange={event => setDocumentDateValue(event.target.value)}
              />
              <Button type="submit" disabled={dateMutation.isPending}>
                <CalendarRange className="size-4" />
                {dateMutation.isPending ? 'Saving...' : 'Save date'}
              </Button>
            </form>
          </SurfacePanel>

          <SurfacePanel variant="soft" className="space-y-5">
            <div>
              <p className="vault-label">Tags</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Classification</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {assignedTags.length === 0 ? <p className="text-sm text-muted-foreground">No tags assigned.</p> : null}
              {assignedTags.map(tag => (
                <span key={tag.id} className="inline-flex items-center gap-2 rounded-full bg-card/85 px-3 py-1.5 text-sm text-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color ?? '#64748b' }}
                  />
                  {tag.name}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground transition hover:text-foreground"
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

            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="assign-tag" className="vault-label">Select a tag</label>
                <select
                  id="assign-tag"
                  value={selectedTagId}
                  onChange={event => setSelectedTagId(event.target.value)}
                  className={vaultInputClassName}
                >
                  <option value="">Select a tag</option>
                  {availableTags.map(tag => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                disabled={!selectedTagId || assignTagMutation.isPending}
                onClick={() => {
                  setStatusMessage(null);
                  setErrorMessage(null);
                  assignTagMutation.mutate({ vaultId, documentId, tagId: selectedTagId });
                }}
              >
                {assignTagMutation.isPending ? 'Assigning...' : 'Assign tag'}
              </Button>
              <Link to={`/vaults/${vaultId}/tags`} className="vault-link">Open tag management</Link>
            </div>
          </SurfacePanel>

          <SurfacePanel variant="strong" className="space-y-5">
            <div>
              <p className="vault-label text-primary-foreground/70">Lifecycle</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em]">Retention control</h2>
            </div>
            <p className="text-sm leading-6 text-primary-foreground/80">
              Delete active documents or restore them from trash depending on the current state of this record.
            </p>
            {document.isDeleted ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={restoreMutation.isPending}
                onClick={() => {
                  setStatusMessage(null);
                  setErrorMessage(null);
                  restoreMutation.mutate({ vaultId, documentId });
                }}
              >
                {restoreMutation.isPending ? 'Restoring...' : 'Restore document'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  setStatusMessage(null);
                  setErrorMessage(null);
                  deleteMutation.mutate({ vaultId, documentId });
                }}
              >
                <Trash2 className="size-4" />
                {deleteMutation.isPending ? 'Deleting...' : 'Move to trash'}
              </Button>
            )}
          </SurfacePanel>
        </div>
      </div>
    </section>
  );
}
