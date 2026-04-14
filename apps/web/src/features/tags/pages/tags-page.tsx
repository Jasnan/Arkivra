import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { createTag, deleteTag, updateTag } from '@/features/tags/tags.api';
import { tagQueryKeys, useTagsQuery } from '@/features/tags/tags.queries';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TagsPage() {
  const params = useParams<{ vaultId: string }>();
  const vaultId = params.vaultId ?? '';
  const queryClient = useQueryClient();
  const tagsQuery = useTagsQuery({ vaultId });

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#2563eb');
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-4xl tracking-tight">Tags</h2>
          <p className="text-sm text-muted-foreground">Create reusable labels and keep document filters tidy.</p>
        </div>
        <Link to={`/vaults/${vaultId}/documents`} className="text-sm font-medium text-primary hover:underline">Back to documents</Link>
      </div>

      {statusMessage ? <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">{statusMessage}</p> : null}
      {errorMessage ? <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Create tag</h3>
          <form className="mt-4 space-y-4" onSubmit={handleCreate}>
            <div className="space-y-1.5">
              <label htmlFor="tag-name" className="text-sm font-medium">Name</label>
              <input
                id="tag-name"
                value={newTagName}
                onChange={event => setNewTagName(event.target.value)}
                className={inputClassName}
                placeholder="Invoices"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="tag-color" className="text-sm font-medium">Color</label>
              <input
                id="tag-color"
                type="color"
                value={newTagColor}
                onChange={event => setNewTagColor(event.target.value)}
                className="h-12 w-full rounded-xl border border-input bg-background p-2"
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create tag'}
            </Button>
          </form>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Manage tags</h3>
          {tagsQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading tags…</p> : null}
          {tagsQuery.isError ? <p className="mt-4 text-sm text-destructive">Unable to load tags.</p> : null}

          <ul className="mt-4 space-y-3">
            {(tagsQuery.data?.tags ?? []).map(tag => (
              <li key={tag.id} className="rounded-xl border border-border bg-background p-4">
                <form
                  className="grid gap-3 lg:grid-cols-[1fr_120px_auto_auto]"
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
                    className={inputClassName}
                    aria-label={`Tag name for ${tag.name}`}
                  />
                  <input
                    name="color"
                    type="color"
                    defaultValue={tag.color ?? '#64748b'}
                    className="h-10 w-full rounded-xl border border-input bg-background p-1"
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
                </form>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
