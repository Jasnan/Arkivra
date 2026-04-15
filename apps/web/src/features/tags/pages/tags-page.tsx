import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageIntro, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { createTag, deleteTag, updateTag } from '@/features/tags/tags.api';
import { tagQueryKeys, useTagsQuery } from '@/features/tags/tags.queries';

export function TagsPage() {
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId ?? '';
  const queryClient = useQueryClient();
  const tagsQuery = useTagsQuery({ vaultId });

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#2563eb');
  const [filterText, setFilterText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createTag,
    onSuccess: async () => {
      setNewTagName('');
      setStatusMessage('Tag created.');
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: tagQueryKeys.all });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create tag.');
      setStatusMessage(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTag,
    onSuccess: async () => {
      setStatusMessage('Tag updated.');
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: tagQueryKeys.all });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update tag.');
      setStatusMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTag,
    onSuccess: async () => {
      setStatusMessage('Tag deleted.');
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: tagQueryKeys.all });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete tag.');
      setStatusMessage(null);
    },
  });

  if (!vaultId) {
    return <p className="text-sm text-destructive">Invalid vault id.</p>;
  }

  const tags = tagsQuery.data?.tags ?? [];
  const normalizedFilter = filterText.trim().toLowerCase();
  const filteredTags = useMemo(
    () => tags.filter(tag => tag.name.toLowerCase().includes(normalizedFilter)),
    [normalizedFilter, tags],
  );
  const taggedDocumentsCount = useMemo(
    () => tags.reduce((total, tag) => total + (tag.documentsCount ?? 0), 0),
    [tags],
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    await createMutation.mutateAsync({
      vaultId,
      name: newTagName.trim(),
      color: newTagColor || null,
    });
  }

  return (
    <section className="space-y-6 pb-8">
      <PageIntro
        eyebrow="Vault Taxonomy"
        title="Tags"
        description="Manage the labels used to organize this vault."
        actions={(
          <div className="flex items-center gap-3">
            <Link to={`/vaults/${vaultId}/documents`} className="vault-link">Back to documents</Link>
            <Button type="submit" form="create-tag-form" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create tag'}
            </Button>
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
        <form id="create-tag-form" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px]" onSubmit={handleCreate}>
          <div className="space-y-2">
            <label htmlFor="tag-name" className="sr-only">Name</label>
            <input
              id="tag-name"
              value={newTagName}
              onChange={event => setNewTagName(event.target.value)}
              className={vaultInputClassName}
              placeholder="Create a tag..."
            />
          </div>
          <input
            id="tag-color"
            type="color"
            value={newTagColor}
            onChange={event => setNewTagColor(event.target.value)}
            className="h-11 w-full rounded-xl bg-background p-1 ring-1 ring-border"
          />
          <div className="space-y-2">
            <label htmlFor="tag-filter" className="sr-only">Filter tags</label>
            <input
              id="tag-filter"
              value={filterText}
              onChange={event => setFilterText(event.target.value)}
              className={vaultInputClassName}
              placeholder="Filter tags..."
            />
          </div>
        </form>

        <p className="text-sm text-muted-foreground">
          {tags.length} tag{tags.length === 1 ? '' : 's'} across {taggedDocumentsCount} assignments
        </p>
      </SurfacePanel>

      <SurfacePanel className="overflow-hidden p-0">
        <div className="hidden grid-cols-[220px_minmax(0,1fr)_160px_180px_150px] gap-6 px-6 py-4 text-sm text-muted-foreground md:grid">
          <span>Tag</span>
          <span>Description</span>
          <span>Documents</span>
          <span>Created</span>
          <span>Actions</span>
        </div>

        {tagsQuery.isLoading ? <p className="px-6 py-6 text-sm text-muted-foreground">Loading tags...</p> : null}
        {tagsQuery.isError ? <p className="px-6 py-6 text-sm text-destructive">Unable to load tags.</p> : null}
        {!tagsQuery.isLoading && tags.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">No tags yet. Create the first one to organize documents in this vault.</div>
        ) : null}
        {!tagsQuery.isLoading && tags.length > 0 && filteredTags.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground">No tags match that filter.</div>
        ) : null}

        <div className="divide-y divide-border/70">
          {filteredTags.map(tag => (
            <article key={tag.id} className="grid gap-4 px-6 py-5 md:grid-cols-[220px_minmax(0,1fr)_160px_180px_150px] md:items-center md:gap-6">
              <div className="inline-flex w-fit items-center gap-3 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-foreground">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: tag.color ?? '#64748b' }}
                />
                <span>{tag.name}</span>
              </div>

              <form
                className="contents"
                onSubmit={(event) => {
                  event.preventDefault();
                  setStatusMessage(null);
                  setErrorMessage(null);
                  const formData = new FormData(event.currentTarget);
                  updateMutation.mutate({
                    vaultId,
                    tagId: tag.id,
                    name: String(formData.get('name') ?? '').trim(),
                    color: String(formData.get('color') ?? '') || null,
                  });
                }}
              >
                <input
                  name="name"
                  defaultValue={tag.name}
                  className={`${vaultInputClassName} md:hidden`}
                  aria-label={`Tag name for ${tag.name}`}
                />
                <div className="hidden md:block text-sm text-muted-foreground">
                  Used for vault classification.
                </div>
                <div className="text-sm text-muted-foreground">Used by {tag.documentsCount ?? 0} document{(tag.documentsCount ?? 0) === 1 ? '' : 's'}</div>
                <div className="text-sm text-muted-foreground">Current vault</div>
                <div className="flex gap-2">
                  <input
                    name="color"
                    type="color"
                    defaultValue={tag.color ?? '#64748b'}
                    className="h-10 w-10 rounded-lg bg-background p-1 ring-1 ring-border"
                    aria-label={`Tag color for ${tag.name}`}
                  />
                  <Button type="submit" variant="outline" disabled={updateMutation.isPending}>Save</Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      setStatusMessage(null);
                      setErrorMessage(null);
                      deleteMutation.mutate({ vaultId, tagId: tag.id });
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </form>
            </article>
          ))}
        </div>
      </SurfacePanel>
    </section>
  );
}
