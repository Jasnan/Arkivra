import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange,
  Download,
  Image as ImageIcon,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  PageIntro,
  StatusBanner,
  SurfacePanel,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getDocumentDownloadUrl,
  getDocumentInlineFileUrl,
  renameDocument,
  restoreDocument,
  softDeleteDocument,
  updateDocumentDate,
} from '@/features/documents/documents.api';
import {
  documentQueryKeys,
  useDocumentQuery,
  useDocumentTagsQuery,
} from '@/features/documents/documents.queries';
import {
  deriveExtractionStatus,
  formatBytes,
  formatDate,
} from '@/features/documents/documents.utils';
import { assignTagToDocument, createTag, removeTagFromDocument } from '@/features/tags/tags.api';
import { TagDialog } from '@/features/tags/components/tag-dialog';
import { tagQueryKeys, useTagsQuery } from '@/features/tags/tags.queries';

type PreviewKind = 'pdf' | 'image' | 'text' | 'unsupported';
type DetailTab = 'preview' | 'content' | 'metadata';

function getPreviewKind(mimeType: string): PreviewKind {
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('text/')) {
    return 'text';
  }

  return 'unsupported';
}

export function DocumentDetailPage() {
  const params = useParams<{ vaultId: string; documentId: string }>();
  const vaultId = params.vaultId ?? '';
  const documentId = params.documentId ?? '';
  const queryClient = useQueryClient();

  const documentQuery = useDocumentQuery({ vaultId, documentId });
  const documentTagsQuery = useDocumentTagsQuery({ vaultId, documentId });
  const tagsQuery = useTagsQuery({ vaultId });

  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [documentDateValue, setDocumentDateValue] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('preview');
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [tagSearchValue, setTagSearchValue] = useState('');
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false);
  const [createTagNameValue, setCreateTagNameValue] = useState('');
  const [createTagColorValue, setCreateTagColorValue] = useState('#D8FF75');
  const [createTagDescriptionValue, setCreateTagDescriptionValue] = useState('');

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string; documentId?: string }>).detail;

      if (detail?.vaultId !== vaultId || detail?.documentId !== documentId) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(vaultId, documentId),
      });
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, [documentId, queryClient, vaultId]);

  const invalidateDocument = async () => {
    await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    await queryClient.invalidateQueries({ queryKey: tagQueryKeys.list(vaultId) });
  };

  const renameMutation = useMutation({
    mutationFn: renameDocument,
    onSuccess: invalidateDocument,
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not rename document.');
      setStatusMessage(null);
    },
  });

  const dateMutation = useMutation({
    mutationFn: updateDocumentDate,
    onSuccess: invalidateDocument,
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
      await invalidateDocument();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not assign tag.');
      setStatusMessage(null);
    },
  });

  const createTagMutation = useMutation({
    mutationFn: createTag,
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create tag.');
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
    (tag) => !assignedTags.some((assigned) => assigned.id === tag.id),
  );
  const normalizedTagSearchValue = tagSearchValue.trim().toLowerCase();
  const filteredAvailableTags = availableTags.filter((tag) => {
    if (normalizedTagSearchValue.length === 0) {
      return true;
    }

    return tag.name.toLowerCase().includes(normalizedTagSearchValue);
  });
  const sortedFilteredAvailableTags = [...filteredAvailableTags].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const selectedMatchingTags = [...assignedTags]
    .filter((tag) => {
      if (normalizedTagSearchValue.length === 0) {
        return true;
      }

      return tag.name.toLowerCase().includes(normalizedTagSearchValue);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasExactTagMatch = availableTags.some(
    (tag) => tag.name.trim().toLowerCase() === normalizedTagSearchValue,
  );
  const extractionStatus = deriveExtractionStatus(document);
  const inlineFileUrl = getDocumentInlineFileUrl({ vaultId, documentId });
  const previewKind = getPreviewKind(document.mimeType);
  const canPreview = !document.isDeleted && previewKind !== 'unsupported';
  const canPrint = !document.isDeleted && canPreview;
  const currentName = renameValue ?? document.name;
  const currentDocumentDate =
    documentDateValue ?? (document.documentDate ? document.documentDate.slice(0, 10) : '');
  const hasNameChanged = currentName.trim() !== document.name;
  const hasDocumentDateChanged =
    currentDocumentDate !== (document.documentDate ? document.documentDate.slice(0, 10) : '');
  const isMetadataSaving = renameMutation.isPending || dateMutation.isPending;
  const normalizedCreateTagName = createTagNameValue.trim();
  const createTagDescription = createTagDescriptionValue.trim();
  const isCreateTagSaveDisabled =
    normalizedCreateTagName.length === 0 ||
    createTagMutation.isPending ||
    assignTagMutation.isPending;
  const displayContent = document.displayContent ?? document.content;
  const extractedTextMessage =
    displayContent.trim().length > 0
      ? displayContent
      : document.processingStatus === 'processing'
        ? 'Text/OCR extraction is still running.'
        : document.processingStatus === 'failed'
          ? 'Text/OCR extraction failed for this document.'
          : document.processingStatus === 'completed'
            ? 'Extraction completed, but no text content was found.'
            : 'No extracted text is available yet.';

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    const nextName = currentName.trim() || document.name;

    try {
      if (hasNameChanged) {
        await renameMutation.mutateAsync({ vaultId, documentId, name: nextName });
      }

      if (hasDocumentDateChanged) {
        await dateMutation.mutateAsync({
          vaultId,
          documentId,
          documentDate: currentDocumentDate ? new Date(currentDocumentDate).toISOString() : null,
        });
      }

      if (hasNameChanged || hasDocumentDateChanged) {
        setStatusMessage('Metadata saved.');
        setRenameValue(null);
        setDocumentDateValue(null);
      }
    } catch {}
  }

  function openCreateTagDialog(initialName: string) {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsTagPickerOpen(false);
    setCreateTagNameValue(initialName);
    setCreateTagColorValue('#D8FF75');
    setCreateTagDescriptionValue('');
    setIsCreateTagDialogOpen(true);
  }

  function closeCreateTagDialog() {
    if (createTagMutation.isPending || assignTagMutation.isPending) {
      return;
    }

    setIsCreateTagDialogOpen(false);
  }

  async function handleCreateTagSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (normalizedCreateTagName.length === 0) {
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const result = await createTagMutation.mutateAsync({
        vaultId,
        name: normalizedCreateTagName,
        color: createTagColorValue,
        description: createTagDescription.length > 0 ? createTagDescription : null,
      });

      await assignTagMutation.mutateAsync({
        vaultId,
        documentId,
        tagId: result.tag.id,
      });
      setStatusMessage(`Tag "${normalizedCreateTagName}" created and assigned.`);
      setIsCreateTagDialogOpen(false);
      setIsTagPickerOpen(false);
      setTagSearchValue('');
    } catch {}
  }

  function handlePrintClick() {
    if (!canPrint) {
      return;
    }

    if (previewKind === 'pdf' || previewKind === 'text') {
      const frame = window.document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.src = inlineFileUrl;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      };
      window.document.body.appendChild(frame);
      window.setTimeout(() => {
        frame.remove();
      }, 60_000);
      return;
    }

    if (previewKind === 'image') {
      const printWindow = window.open('', '_blank', 'noopener,noreferrer');

      if (printWindow === null) {
        setErrorMessage('Could not open print dialog.');
        setStatusMessage(null);
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>${document.name}</title>
            <style>
              body {
                margin: 0;
                display: flex;
                min-height: 100vh;
                align-items: center;
                justify-content: center;
                background: white;
              }
              img {
                max-width: 100%;
                max-height: 100vh;
                object-fit: contain;
              }
            </style>
          </head>
          <body>
            <img src="${inlineFileUrl}" alt="${document.name}" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    }
  }

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Vault Record"
        title={document.name}
        description={`${document.originalName} • ${formatBytes(document.originalSize)} • ${document.id}`}
        actions={
          <>
            <Link
              to={
                document.isDeleted
                  ? `/vaults/${vaultId}/documents/trash`
                  : `/vaults/${vaultId}/documents`
              }
              className="vault-link"
            >
              Back to {document.isDeleted ? 'trash' : 'documents'}
            </Link>
            {canPrint ? (
              <Button type="button" variant="outline" onClick={handlePrintClick}>
                <Printer className="size-4" />
                Print
              </Button>
            ) : null}
            <a
              href={getDocumentDownloadUrl({ vaultId, documentId })}
              className="vault-link inline-flex items-center gap-2"
            >
              <Download className="size-4" />
              Download original
            </a>
          </>
        }
      />

      {statusMessage || errorMessage ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_360px] 2xl:grid-cols-[minmax(0,1.75fr)_380px]">
        <div className="space-y-6">
          <SurfacePanel className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-secondary/70 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    {document.mimeType}
                  </span>
                  <span className="rounded-full bg-secondary/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    {extractionStatus}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {canPreview
                    ? 'Primary reading surface for this document.'
                    : 'This file can be downloaded, and extracted content will be shown below when available.'}
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <p>Uploaded {formatDate(document.createdAt)}</p>
                <p>{formatBytes(document.originalSize)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="vault-label">Workspace</p>
                <h2 className="font-display mt-2 text-xl font-bold  text-foreground">
                  {activeTab === 'preview'
                    ? 'Document preview'
                    : activeTab === 'content'
                      ? 'Extracted text'
                      : 'Metadata'}
                </h2>
              </div>
              <div className="inline-flex rounded-full bg-secondary/70 p-1">
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('preview')}
                >
                  Preview
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'content' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('content')}
                >
                  Extracted text
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'metadata' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setActiveTab('metadata')}
                >
                  Metadata
                </button>
              </div>
            </div>

            {activeTab === 'preview' ? (
              <div className="space-y-4">
                {previewKind === 'pdf' && !document.isDeleted ? (
                  <div className="overflow-hidden rounded-lg bg-secondary/55 p-2">
                    <iframe
                      title="Document preview"
                      src={inlineFileUrl}
                      className="h-[72vh] min-h-[760px] w-full rounded-lg bg-white"
                    />
                  </div>
                ) : null}

                {previewKind === 'image' && !document.isDeleted ? (
                  <div className="overflow-hidden rounded-lg bg-secondary/55 p-4">
                    <div className="flex min-h-[72vh] items-center justify-center rounded-lg bg-white p-8">
                      <img
                        src={inlineFileUrl}
                        alt={document.name}
                        className="max-h-[78vh] w-auto max-w-full rounded-[12px] object-contain"
                      />
                    </div>
                  </div>
                ) : null}

                {previewKind === 'text' && !document.isDeleted ? (
                  <div className="overflow-hidden rounded-lg bg-secondary/55 p-2">
                    <iframe
                      title="Text preview"
                      src={inlineFileUrl}
                      className="h-[72vh] min-h-[760px] w-full rounded-lg bg-white"
                    />
                  </div>
                ) : null}

                {previewKind === 'unsupported' || document.isDeleted ? (
                  <div className="rounded-lg bg-secondary/55 p-6">
                    <div className="flex min-h-[520px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/70 bg-background/80 px-6 text-center">
                      <ImageIcon className="size-10 text-muted-foreground" />
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">Preview unavailable</p>
                        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                          {document.isDeleted
                            ? 'Preview is disabled for documents in trash. Restore the document to preview or print it again.'
                            : 'This file type is supported for storage and extraction, but Arkivra does not render a faithful in-browser preview for it yet.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'content' ? (
              <div className="space-y-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  OCR and extracted text appear here once processing completes.
                </p>
                <div className="max-h-[72vh] min-h-[520px] overflow-auto rounded-lg bg-secondary/55 p-5 text-sm whitespace-pre-wrap break-words text-foreground">
                  {extractedTextMessage}
                </div>
              </div>
            ) : null}

            {activeTab === 'metadata' ? (
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">Display name</dt>
                  <dd className="mt-2 font-medium text-foreground">{document.name}</dd>
                </div>
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">Original file</dt>
                  <dd className="mt-2 font-medium text-foreground">{document.originalName}</dd>
                </div>
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">File size</dt>
                  <dd className="mt-2 font-medium text-foreground">
                    {formatBytes(document.originalSize)}
                  </dd>
                </div>
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">Format</dt>
                  <dd className="mt-2 font-medium text-foreground">{document.mimeType}</dd>
                </div>
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">Document date</dt>
                  <dd className="mt-2 font-medium text-foreground">
                    {formatDate(document.documentDate)}
                  </dd>
                </div>
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">Uploaded by</dt>
                  <dd className="mt-2 font-medium text-foreground">
                    {document.createdBy ?? 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">Uploaded at</dt>
                  <dd className="mt-2 font-medium text-foreground">
                    {formatDate(document.createdAt)}
                  </dd>
                </div>
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">Last updated</dt>
                  <dd className="mt-2 font-medium text-foreground">
                    {formatDate(document.updatedAt)}
                  </dd>
                </div>
                <div className="rounded-lg bg-secondary/55 p-4">
                  <dt className="text-muted-foreground">SHA-256</dt>
                  <dd className="mt-2 break-all font-mono text-xs text-foreground">
                    {document.originalSha256Hash}
                  </dd>
                </div>
              </dl>
            ) : null}
          </SurfacePanel>
        </div>

        <div className="space-y-6">
          <SurfacePanel variant="soft" className="space-y-5">
            <div>
              <h2 className="font-display text-xl font-bold  text-foreground">Edit metadata</h2>
            </div>
            <form className="space-y-5" onSubmit={handleMetadataSave}>
              <div className="space-y-2">
                <label htmlFor="document-name" className="vault-label">
                  Display name
                </label>
                <input
                  id="document-name"
                  type="text"
                  value={currentName}
                  className={vaultInputClassName}
                  onChange={(event) => setRenameValue(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="document-date" className="vault-label">
                  Document date
                </label>
                <input
                  id="document-date"
                  type="date"
                  value={currentDocumentDate}
                  className={vaultInputClassName}
                  onChange={(event) => setDocumentDateValue(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={isMetadataSaving || (!hasNameChanged && !hasDocumentDateChanged)}
              >
                <CalendarRange className="size-4" />
                {isMetadataSaving ? 'Saving...' : 'Save'}
              </Button>
            </form>
          </SurfacePanel>

          <SurfacePanel variant="soft" className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold  text-foreground">Tags</h2>
              <DropdownMenu
                modal={false}
                open={isTagPickerOpen}
                onOpenChange={(open) => {
                  setIsTagPickerOpen(open);
                  if (!open) {
                    setTagSearchValue('');
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Add tag"
                    className="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:text-foreground"
                  >
                    <Plus className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-80 overflow-hidden rounded-xl bg-popover p-0"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                >
                  <div className="border-b border-border/60 p-2">
                    <input
                      type="text"
                      value={tagSearchValue}
                      onChange={(event) => setTagSearchValue(event.target.value)}
                      placeholder="Filter tags..."
                      className="h-10 w-full rounded-lg border border-transparent bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-border"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-72 overflow-auto py-1">
                    {selectedMatchingTags.map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag.id}
                        checked
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => {
                          setStatusMessage(null);
                          setErrorMessage(null);
                          removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ backgroundColor: tag.color ?? '#64748b' }}
                        />
                        <span className="flex-1 truncate">{tag.name}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                    {selectedMatchingTags.length > 0 && sortedFilteredAvailableTags.length > 0 ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    {sortedFilteredAvailableTags.map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag.id}
                        checked={false}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => {
                          setStatusMessage(null);
                          setErrorMessage(null);
                          assignTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full"
                          style={{ backgroundColor: tag.color ?? '#64748b' }}
                        />
                        <span className="flex-1 truncate">{tag.name}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                    {normalizedTagSearchValue.length > 0 && !hasExactTagMatch ? (
                      <DropdownMenuItem onSelect={() => openCreateTagDialog(tagSearchValue.trim())}>
                        <Plus className="size-4" />
                        <span className="flex-1 truncate">{`Create new tag "${tagSearchValue.trim()}"`}</span>
                      </DropdownMenuItem>
                    ) : null}
                    {selectedMatchingTags.length === 0 &&
                    sortedFilteredAvailableTags.length === 0 ? (
                      normalizedTagSearchValue.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted-foreground">
                          All tags are already assigned.
                        </p>
                      ) : !hasExactTagMatch ? null : (
                        <p className="px-4 py-3 text-sm text-muted-foreground">No matching tags.</p>
                      )
                    ) : null}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-wrap gap-2">
              {assignedTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags assigned.</p>
              ) : null}
              {assignedTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1 text-sm leading-none text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: tag.color ?? '#64748b' }}
                  />
                  {tag.name}
                  <button
                    type="button"
                    aria-label={`Remove ${tag.name}`}
                    className="inline-flex items-center justify-center text-muted-foreground transition hover:text-foreground"
                    onClick={() => {
                      setStatusMessage(null);
                      setErrorMessage(null);
                      removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </SurfacePanel>

          <SurfacePanel variant="soft" className="space-y-5 border-destructive/20">
            <div>
              <p className="vault-label text-destructive/80">Danger zone</p>
              <h2 className="font-display mt-2 text-xl font-bold  text-foreground">
                {document.isDeleted ? 'Restore document' : 'Delete document'}
              </h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {document.isDeleted
                ? 'Restore this document to make it available in the vault again.'
                : 'Move this document to trash. The file remains recoverable until it is permanently removed.'}
            </p>
            {document.isDeleted ? (
              <Button
                type="button"
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
                variant="outline"
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/8 hover:text-destructive"
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

      <TagDialog
        isOpen={isCreateTagDialogOpen}
        title="Create tag"
        submitLabel="Create tag"
        pendingLabel="Creating..."
        closeLabel="Close create tag dialog"
        isPending={createTagMutation.isPending || assignTagMutation.isPending}
        isSubmitDisabled={isCreateTagSaveDisabled}
        nameValue={createTagNameValue}
        colorValue={createTagColorValue}
        descriptionValue={createTagDescriptionValue}
        onNameChange={setCreateTagNameValue}
        onColorChange={setCreateTagColorValue}
        onDescriptionChange={setCreateTagDescriptionValue}
        onClose={closeCreateTagDialog}
        onSubmit={handleCreateTagSubmit}
      />
    </section>
  );
}
