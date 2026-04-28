import type { FormEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  PageIntro,
  StatusBanner,
  SurfacePanel,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createTag, deleteTag, updateTag } from '@/features/tags/tags.api';
import { TagDialog } from '@/features/tags/components/tag-dialog';
import { tagQueryKeys, useAccessibleTagsQuery, useTagsQuery } from '@/features/tags/tags.queries';
import type { Tag } from '@/features/tags/tags.types';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

type DialogMode = 'create' | 'edit';

const DEFAULT_TAG_COLOR = '#0EA5E9';

function DeleteTagDialog({
  tag,
  isPending,
  onClose,
  onConfirm,
}: {
  tag: Tag;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const attachedDocuments = tag.documentsCount ?? 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-xl px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-7"
        onPointerDownOutside={(event) => {
          if (isPending) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isPending) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="pr-10">
          <p className="vault-label text-destructive/80">Delete Tag</p>
          <DialogTitle>{`Delete “${tag.name}”?`}</DialogTitle>
          <DialogDescription>
            {attachedDocuments > 0
              ? `This tag is currently attached to ${attachedDocuments} document${attachedDocuments === 1 ? '' : 's'}. Deleting it here will remove the tag from all of those documents.`
              : 'This tag is not attached to any documents right now.'}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            {attachedDocuments > 0
              ? 'This action cannot be undone from the tags page.'
              : 'You can create the tag again later if needed.'}
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/30 text-destructive hover:bg-destructive/8 hover:text-destructive"
              onClick={onConfirm}
              disabled={isPending}
            >
              <Trash2 className="size-4" />
              {isPending ? 'Deleting...' : 'Delete tag'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TagActionsMenu({
  tag,
  deletePending,
  onEdit,
  onDelete,
}: {
  tag: Tag;
  deletePending: boolean;
  onEdit: (trigger: HTMLButtonElement | null) => void;
  onDelete: (trigger: HTMLButtonElement | null) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Open actions for ${tag.name}`}
          className="h-11 w-11 rounded-lg border border-border/60 bg-background/80 text-muted-foreground  hover:bg-secondary/70 hover:text-foreground"
        >
          <Ellipsis className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => onEdit(triggerRef.current)}>
          <Pencil className="size-4 text-primary" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={deletePending}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={() => onDelete(triggerRef.current)}
        >
          <Trash2 className="size-4 text-destructive" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatTagCreatedDate(value?: string) {
  if (!value) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function getTagDescription(tag: Tag) {
  const description = tag.description?.trim();
  return description && description.length > 0 ? description : '—';
}

export function TagsPage() {
  const params = useParams<{ vaultId: string }>();
  const scopedVaultId = params.vaultId;
  const isVaultScoped = scopedVaultId !== undefined && scopedVaultId.length > 0;
  const queryClient = useQueryClient();
  const vaultsQuery = useVaultsQuery();
  const scopedTagsQuery = useTagsQuery({ vaultId: scopedVaultId ?? '' });
  const accessibleTagsQuery = useAccessibleTagsQuery();

  const [filterText, setFilterText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagPendingDelete, setTagPendingDelete] = useState<Tag | null>(null);
  const [formVaultId, setFormVaultId] = useState(scopedVaultId ?? '');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState(DEFAULT_TAG_COLOR);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusRestoreTargetRef = useRef<HTMLElement | null>(null);

  const tagsQuery = isVaultScoped ? scopedTagsQuery : accessibleTagsQuery;
  const tags = tagsQuery.data?.tags ?? [];
  const vaults = vaultsQuery.data?.vaults ?? [];
  const selectedTag = useMemo(
    () => tags.find((tag) => tag.id === editingTagId) ?? null,
    [editingTagId, tags],
  );

  const filteredTags = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase();

    return tags.filter((tag) => {
      if (normalizedFilter.length === 0) {
        return true;
      }

      return [tag.name, tag.description ?? '', tag.vaultName ?? ''].some((value) =>
        value.toLowerCase().includes(normalizedFilter),
      );
    });
  }, [filterText, tags]);

  function rememberFocusTarget(target?: HTMLElement | null) {
    focusRestoreTargetRef.current =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  }

  function restoreFocusTarget() {
    const target = focusRestoreTargetRef.current;
    focusRestoreTargetRef.current = null;

    if (target) {
      requestAnimationFrame(() => {
        target.focus();
      });
    }
  }

  function openCreateDialog() {
    rememberFocusTarget(createButtonRef.current);
    setDialogMode('create');
    setEditingTagId(null);
    setFormVaultId(scopedVaultId ?? vaults[0]?.id ?? '');
    setFormName('');
    setFormDescription('');
    setFormColor(DEFAULT_TAG_COLOR);
    setStatusMessage(null);
    setErrorMessage(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(tag: Tag, trigger?: HTMLButtonElement | null) {
    rememberFocusTarget(trigger);
    setDialogMode('edit');
    setEditingTagId(tag.id);
    setFormVaultId(tag.vaultId ?? scopedVaultId ?? '');
    setFormName(tag.name);
    setFormDescription(tag.description ?? '');
    setFormColor(tag.color ?? DEFAULT_TAG_COLOR);
    setStatusMessage(null);
    setErrorMessage(null);
    setIsDialogOpen(true);
  }

  function closeDialog() {
    setIsDialogOpen(false);
    restoreFocusTarget();
  }

  async function invalidateTagQueries(targetVaultId?: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: tagQueryKeys.all }),
      targetVaultId
        ? queryClient.invalidateQueries({ queryKey: tagQueryKeys.list(targetVaultId) })
        : Promise.resolve(),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: createTag,
    onSuccess: async (_, variables) => {
      await invalidateTagQueries(variables.vaultId);
      setStatusMessage('Tag created.');
      setErrorMessage(null);
      closeDialog();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create tag.');
      setStatusMessage(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTag,
    onSuccess: async (_, variables) => {
      await invalidateTagQueries(variables.vaultId);
      setStatusMessage('Tag updated.');
      setErrorMessage(null);
      closeDialog();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update tag.');
      setStatusMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTag,
    onSuccess: async (_, variables) => {
      await invalidateTagQueries(variables.vaultId);
      setStatusMessage('Tag deleted.');
      setErrorMessage(null);
      setTagPendingDelete(null);
      restoreFocusTarget();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete tag.');
      setStatusMessage(null);
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    const targetVaultId = (isVaultScoped ? scopedVaultId : formVaultId)?.trim() ?? '';
    if (targetVaultId.length === 0) {
      setErrorMessage('Choose a vault before saving this tag.');
      return;
    }

    const payload = {
      vaultId: targetVaultId,
      name: formName.trim(),
      color: formColor || null,
      description: formDescription.trim() || null,
    };

    if (dialogMode === 'edit' && selectedTag?.id) {
      await updateMutation.mutateAsync({
        ...payload,
        tagId: selectedTag.id,
      });
      return;
    }

    await createMutation.mutateAsync(payload);
  }

  if (isVaultScoped && !scopedVaultId) {
    return <p className="text-sm text-destructive">Invalid vault id.</p>;
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <section className="space-y-6 pb-8">
      <PageIntro
        title="Tags"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button
              ref={createButtonRef}
              type="button"
              className="bg-primary text-primary-foreground  hover:bg-primary/95"
              onClick={openCreateDialog}
              disabled={vaultsQuery.isLoading || vaults.length === 0}
            >
              <Plus className="size-4" />
              New tag
            </Button>
          </div>
        }
      />

      {statusMessage || errorMessage ? (
        <div className="grid gap-3">
          {statusMessage ? <StatusBanner>{statusMessage}</StatusBanner> : null}
          {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}
        </div>
      ) : null}

      <SurfacePanel>
        <div className="w-full lg:w-[22rem]">
          <Field>
            <FieldLabel htmlFor="tag-filter" className="sr-only">
              Search tags
            </FieldLabel>
            <Input
            id="tag-filter"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Search tags"
            />
          </Field>
        </div>
      </SurfacePanel>

      <SurfacePanel className="overflow-hidden p-0">
        <div className="hidden grid-cols-[180px_minmax(0,1.4fr)_140px_170px_150px_130px] gap-6 px-6 py-4 text-sm font-medium text-muted-foreground md:grid">
          <span>Tag</span>
          <span>Description</span>
          <span>Documents</span>
          <span>Vault</span>
          <span>Created</span>
          <span className="text-right">Actions</span>
        </div>

        {tagsQuery.isLoading ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">Loading tags...</p>
        ) : null}
        {tagsQuery.isError ? (
          <p className="px-6 py-6 text-sm text-destructive">Unable to load tags.</p>
        ) : null}
        {!tagsQuery.isLoading && tags.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">
            No tags yet. Create the first one to start organizing documents.
          </div>
        ) : null}
        {!tagsQuery.isLoading && tags.length > 0 && filteredTags.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">No tags match that search.</div>
        ) : null}

        <div className="divide-y divide-border/70">
          {filteredTags.map((tag) => (
            <article
              key={tag.id}
              className="grid gap-4 px-6 py-5 md:grid-cols-[180px_minmax(0,1.4fr)_140px_170px_150px_130px] md:items-center md:gap-6"
            >
              <div className="space-y-2">
                <div className="inline-flex w-fit items-center gap-3 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                  />
                  <span>{tag.name}</span>
                </div>
                <p className="text-xs text-muted-foreground md:hidden">
                  {tag.vaultName ?? 'Current vault'}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-foreground">{getTagDescription(tag)}</p>
              </div>

              <div className="flex items-center gap-2 text-sm text-foreground">
                <FileText className="size-4 text-muted-foreground" />
                <span>{tag.documentsCount ?? 0}</span>
              </div>

              <div className="text-sm text-muted-foreground">
                {tag.vaultName ?? 'Current vault'}
              </div>

              <div className="text-sm text-muted-foreground">
                <p>{formatTagCreatedDate(tag.createdAt)}</p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <TagActionsMenu
                  tag={tag}
                  deletePending={deleteMutation.isPending}
                  onEdit={(trigger) => openEditDialog(tag, trigger)}
                  onDelete={(trigger) => {
                    rememberFocusTarget(trigger);
                    setStatusMessage(null);
                    setErrorMessage(null);
                    setTagPendingDelete(tag);
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      </SurfacePanel>

      <TagDialog
        isOpen={isDialogOpen}
        title={dialogMode === 'create' ? 'Create tag' : 'Edit tag'}
        submitLabel={dialogMode === 'create' ? 'Create tag' : 'Save changes'}
        pendingLabel={dialogMode === 'create' ? 'Creating...' : 'Saving...'}
        closeLabel={dialogMode === 'create' ? 'Close create tag dialog' : 'Close edit tag dialog'}
        extraFields={
          !isVaultScoped ? (
            <Field className="gap-3">
              <FieldLabel id="tag-dialog-vault-label">Vault</FieldLabel>
              <Select
                value={formVaultId || '__none__'}
                onValueChange={(value) => setFormVaultId(value === '__none__' ? '' : value)}
              >
                <SelectTrigger
                  aria-labelledby="tag-dialog-vault-label"
                  className={`${vaultInputClassName} h-10 rounded-lg border-foreground/20 text-sm focus:border-foreground/35`}
                >
                  <SelectValue placeholder="Choose a vault" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choose a vault</SelectItem>
                  {vaults.map((vault) => (
                    <SelectItem key={vault.id} value={vault.id}>
                      {vault.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null
        }
        isPending={isSubmitting}
        isSubmitDisabled={
          formName.trim().length === 0 ||
          (!isVaultScoped && formVaultId.trim().length === 0) ||
          isSubmitting
        }
        nameValue={formName}
        colorValue={formColor}
        descriptionValue={formDescription}
        onNameChange={setFormName}
        onColorChange={setFormColor}
        onDescriptionChange={setFormDescription}
        onClose={closeDialog}
        onSubmit={handleSubmit}
      />

      {tagPendingDelete ? (
        <DeleteTagDialog
          tag={tagPendingDelete}
          isPending={deleteMutation.isPending}
          onClose={() => {
            setTagPendingDelete(null);
            restoreFocusTarget();
          }}
          onConfirm={() => {
            deleteMutation.mutate({
              vaultId: tagPendingDelete.vaultId ?? scopedVaultId ?? '',
              tagId: tagPendingDelete.id,
            });
          }}
        />
      ) : null}
    </section>
  );
}
