import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Image as ImageIcon,
  MessageSquare,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  PageIntro,
  SurfacePanel,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
import { DeleteButton, SaveButton } from '@/components/ui/action-buttons';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Input } from '@/components/ui/input';
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
  formatBytes,
  formatDate,
  getDocumentProcessingStageDescription,
  getDocumentProcessingStageLabel,
  isDocumentProcessingActive,
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
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const parentRoute = location.pathname.startsWith('/documents/')
    ? '/documents'
    : `/vaults/${vaultId}/documents`;

  const documentQuery = useDocumentQuery({ vaultId, documentId });
  const documentTagsQuery = useDocumentTagsQuery({ vaultId, documentId });
  const tagsQuery = useTagsQuery({ vaultId });

  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [documentDateValue, setDocumentDateValue] = useState<string | null>(null);
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [isDocumentDateEditing, setIsDocumentDateEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('preview');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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

  const invalidateDocumentTags = async () => {
    await queryClient.invalidateQueries({
      queryKey: documentQueryKeys.tags(vaultId, documentId),
    });
    await queryClient.invalidateQueries({
      queryKey: [...documentQueryKeys.all, 'list', vaultId],
    });
    await queryClient.invalidateQueries({ queryKey: tagQueryKeys.list(vaultId) });
  };

  const renameMutation = useMutation({
    mutationFn: renameDocument,
    onSuccess: invalidateDocument,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename document.');
    },
  });

  const dateMutation = useMutation({
    mutationFn: updateDocumentDate,
    onSuccess: invalidateDocument,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update document date.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteDocument,
    onSuccess: async () => {
      toast.success('Document moved to trash.');
      setIsDeleteDialogOpen(false);
      await invalidateDocument();
      navigate(parentRoute, { replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreDocument,
    onSuccess: async () => {
      toast.success('Document restored.');
      await invalidateDocument();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore document.');
    },
  });

  const assignTagMutation = useMutation({
    mutationFn: assignTagToDocument,
    onSuccess: async () => {
      await invalidateDocumentTags();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not assign tag.');
    },
  });

  const createTagMutation = useMutation({
    mutationFn: createTag,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create tag.');
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: removeTagFromDocument,
    onSuccess: async () => {
      await invalidateDocumentTags();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not remove tag.');
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
  const extractionStageLabel = getDocumentProcessingStageLabel(
    document.processingStatus,
    displayContent,
  );
  const extractedTextMessage = getDocumentProcessingStageDescription(
    document.processingStatus,
    displayContent,
  );
  const isExtractionActive = isDocumentProcessingActive(document.processingStatus);

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
        toast.success('Metadata saved.');
        setRenameValue(null);
        setDocumentDateValue(null);
        setIsNameEditing(false);
        setIsDocumentDateEditing(false);
      }
    } catch {}
  }

  function openCreateTagDialog(initialName: string) {
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
        toast.error('Could not open print dialog.');
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
        title={document.name}
        actions={
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <ActionMenuTriggerButton label={`Open actions for ${document.name}`} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/vaults/${vaultId}/documents/${documentId}/chat`);
                  }}
                >
                  <ActionMenuItemIcon icon={MessageSquare} />
                  Chat with document
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={getDocumentDownloadUrl({ vaultId, documentId })}>
                  <ActionMenuItemIcon icon={Download} />
                  Download original
                </a>
              </DropdownMenuItem>
              {canPrint ? (
                <DropdownMenuItem onSelect={handlePrintClick}>
                  <ActionMenuItemIcon icon={Printer} />
                  Print
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              {document.isDeleted ? (
                <DropdownMenuItem
                  disabled={restoreMutation.isPending}
                  onSelect={() => {
                    restoreMutation.mutate({ vaultId, documentId });
                  }}
                >
                  <ActionMenuItemIcon icon={RotateCcw} />
                  {restoreMutation.isPending ? 'Restoring...' : 'Restore document'}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  disabled={deleteMutation.isPending}
                  onSelect={() => setIsDeleteDialogOpen(true)}
                >
                  <ActionMenuItemIcon icon={Trash2} tone="destructive" />
                  Move to trash
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="space-y-6">
        <SurfacePanel className="space-y-5">
          <div className="space-y-4">
            <div className="flex max-h-20 min-h-8 flex-wrap items-center gap-2 overflow-y-auto pr-1">
              <span className="mr-1 text-sm font-medium text-muted-foreground">Tags</span>
              {assignedTags.length === 0 ? (
                <span className="text-sm text-muted-foreground">No tags assigned.</span>
              ) : null}
              {assignedTags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex h-8 items-center gap-2 rounded-full bg-muted px-3 text-sm leading-none text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: tag.color ?? '#64748b' }}
                  />
                  {tag.name}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${tag.name}`}
                    className="-mr-1 size-6 rounded-full text-muted-foreground hover:bg-background/70 hover:text-foreground"
                    onClick={() => {
                      removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </span>
              ))}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Add tag"
                    className="size-8 rounded-full bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Plus className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-80 overflow-hidden rounded-xl bg-popover p-0"
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                  }}
                >
                  <div className="border-b border-border/60 p-2">
                    <Field>
                      <FieldLabel htmlFor="document-detail-tag-filter" className="sr-only">
                        Filter tags
                      </FieldLabel>
                      <Input
                        id="document-detail-tag-filter"
                        type="text"
                        value={tagSearchValue}
                        onChange={(event) => setTagSearchValue(event.target.value)}
                        placeholder="Filter tags..."
                        className="h-10 border-transparent px-3 focus-visible:ring-0"
                        autoFocus
                      />
                    </Field>
                  </div>
                  <div className="max-h-72 overflow-auto py-1">
                    {selectedMatchingTags.map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag.id}
                        checked
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => {
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold  text-foreground">
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

          <div className="min-h-[720px] md:min-h-[860px]">
            {activeTab === 'preview' ? (
              <div className="space-y-4">
                {previewKind === 'pdf' && !document.isDeleted ? (
                  <div className="overflow-hidden rounded-lg bg-secondary/55 p-2">
                    <iframe
                      title="Document preview"
                      src={inlineFileUrl}
                      className="h-[82vh] min-h-[860px] w-full rounded-lg bg-white"
                    />
                  </div>
                ) : null}

                {previewKind === 'image' && !document.isDeleted ? (
                  <div className="overflow-hidden rounded-lg bg-secondary/55 p-4">
                    <div className="flex h-[82vh] min-h-[860px] items-center justify-center rounded-lg bg-white p-8">
                      <img
                        src={inlineFileUrl}
                        alt={document.name}
                        className="max-h-[84vh] w-auto max-w-full rounded-[12px] object-contain"
                      />
                    </div>
                  </div>
                ) : null}

                {previewKind === 'text' && !document.isDeleted ? (
                  <div className="overflow-hidden rounded-lg bg-secondary/55 p-2">
                    <iframe
                      title="Text preview"
                      src={inlineFileUrl}
                      className="h-[82vh] min-h-[860px] w-full rounded-lg bg-white"
                    />
                  </div>
                ) : null}

                {previewKind === 'unsupported' || document.isDeleted ? (
                  <div className="rounded-lg bg-secondary/55 p-6">
                    <div className="flex min-h-[820px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/70 bg-background/80 px-6 text-center">
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
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ${
                    document.processingStatus === 'failed'
                      ? 'bg-destructive/12 text-destructive'
                      : isExtractionActive
                        ? 'bg-amber-500/12 text-amber-700'
                        : 'bg-emerald-500/12 text-emerald-700'
                  }`}
                  >
                    {extractionStageLabel}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {isExtractionActive
                      ? 'The document detail view polls the backend while processing is in progress.'
                      : 'OCR and extracted text appear here after processing completes.'}
                  </p>
                </div>
                <div className="h-[82vh] min-h-[820px] overflow-auto rounded-lg bg-secondary/55 p-5 text-sm whitespace-pre-wrap break-words text-foreground">
                  {extractedTextMessage}
                </div>
              </div>
            ) : null}

            {activeTab === 'metadata' ? (
              <form className="min-h-[820px] space-y-5" onSubmit={handleMetadataSave}>
                <div className="grid gap-4 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-secondary/55 p-4">
                    <p className="text-muted-foreground">Display name</p>
                    {isNameEditing ? (
                      <Input
                        id="document-name"
                        type="text"
                        value={currentName}
                        className={`${vaultInputClassName} mt-2`}
                        onChange={(event) => setRenameValue(event.target.value)}
                        autoFocus
                      />
                    ) : (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">{document.name}</p>
                        <button
                          type="button"
                          aria-label="Edit display name"
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          onClick={() => setIsNameEditing(true)}
                        >
                          <Pencil className="size-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg bg-secondary/55 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <p>Document date</p>
                      <InfoTooltip
                        label="More info about document date"
                        contentClassName="max-w-72"
                        content="The date the document was issued for. For example, an invoice dated 21.01.2026 has that document date even if it was uploaded on 24.04.2026."
                      />
                    </div>
                    {isDocumentDateEditing ? (
                      <Input
                        id="document-date"
                        type="date"
                        value={currentDocumentDate}
                        className={`${vaultInputClassName} mt-2`}
                        onChange={(event) => setDocumentDateValue(event.target.value)}
                        autoFocus
                      />
                    ) : (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="font-medium text-foreground">
                          {formatDate(document.documentDate)}
                        </p>
                        <button
                          type="button"
                          aria-label="Edit document date"
                          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          onClick={() => setIsDocumentDateEditing(true)}
                        >
                          <Pencil className="size-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg bg-secondary/55 p-4">
                    <p className="text-muted-foreground">Original file</p>
                    <p className="mt-2 font-medium text-foreground">{document.originalName}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/55 p-4">
                    <p className="text-muted-foreground">File size</p>
                    <p className="mt-2 font-medium text-foreground">
                      {formatBytes(document.originalSize)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/55 p-4">
                    <p className="text-muted-foreground">Format</p>
                    <p className="mt-2 font-medium text-foreground">{document.mimeType}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/55 p-4">
                    <p className="text-muted-foreground">Uploaded by</p>
                    <p className="mt-2 font-medium text-foreground">
                      {document.createdBy ?? 'Unknown'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/55 p-4">
                    <p className="text-muted-foreground">Uploaded at</p>
                    <p className="mt-2 font-medium text-foreground">
                      {formatDate(document.createdAt)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-secondary/55 p-4">
                    <p className="text-muted-foreground">Last updated</p>
                    <p className="mt-2 font-medium text-foreground">
                      {formatDate(document.updatedAt)}
                    </p>
                  </div>
                </div>
                {isNameEditing || isDocumentDateEditing ? (
                  <SaveButton
                    type="submit"
                    disabled={isMetadataSaving || (!hasNameChanged && !hasDocumentDateChanged)}
                  >
                    {isMetadataSaving ? 'Saving...' : 'Save changes'}
                  </SaveButton>
                ) : null}
              </form>
            ) : null}
          </div>
        </SurfacePanel>
      </div>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleteMutation.isPending) {
            setIsDeleteDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="pr-10">
            <DialogTitle>{`Move "${document.name}" to trash?`}</DialogTitle>
            <DialogDescription>
              This document will be removed from the active vault, but it is recoverable from Trash
              until it is permanently removed manually or automatically after 30 days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <DeleteButton
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => {
                deleteMutation.mutate({ vaultId, documentId });
              }}
            >
              {deleteMutation.isPending ? 'Moving...' : 'Move to trash'}
            </DeleteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
