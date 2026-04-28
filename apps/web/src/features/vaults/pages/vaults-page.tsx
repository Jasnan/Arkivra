import type { FormEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, FolderKanban, FolderOpen, ShieldCheck, Vault } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  PageIntro,
  SectionTitle,
  StatCard,
  SurfacePanel,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatBytes } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';
import { createVault } from '@/features/vaults/vaults.api';
import { useVaultsQuery, vaultQueryKeys } from '@/features/vaults/vaults.queries';

function formatVaultCreatedDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatVaultRole(role: string | null | undefined) {
  if (role === 'owner') {
    return 'Owner';
  }

  if (role === 'member') {
    return 'Member';
  }

  if (role === 'global_admin') {
    return 'Global admin';
  }

  return 'Access';
}

function getVaultDescription(value: string | null) {
  if (!value) {
    return null;
  }

  if (value === 'Credise default vault') {
    return 'Default vault';
  }

  return value;
}

export function VaultsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const vaults = vaultsQuery.data?.vaults ?? [];
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const canCreateVault = meQuery.data?.canCreateVault === true;
  const createButtonRef = useRef<HTMLButtonElement | null>(null);

  const ownedVaults = useMemo(
    () => vaults.filter((vault) => vault.role === 'owner').length,
    [vaults],
  );
  const memberVaults = Math.max(0, vaults.length - ownedVaults);

  const createMutation = useMutation({
    mutationFn: createVault,
    onSuccess: async ({ vault }) => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
      setIsCreateModalOpen(false);
      setName('');
      setDescription('');
      toast.success('Vault created.');
      navigate(`/vaults/${vault.id}/settings`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create vault.');
    },
  });

  function restoreCreateButtonFocus() {
    const button = createButtonRef.current;
    if (button) {
      requestAnimationFrame(() => {
        button.focus();
      });
    }
  }

  function openCreateModal() {
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (createMutation.isPending) {
      return;
    }

    setIsCreateModalOpen(false);
    setName('');
    setDescription('');
    restoreCreateButtonFocus();
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateVault) {
      toast.error(
        'A global admin must grant vault creation before this account can create a workspace.',
      );
      return;
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      toast.error('Vault name is required.');
      return;
    }

    createMutation.mutate({
      name: normalizedName,
      description: description.trim() || null,
    });
  }

  function getDescriptionPreview(value: string) {
    if (value.length <= 280) {
      return value;
    }

    return `${value.slice(0, 277).trimEnd()}...`;
  }

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        title="Vaults"
        description="Manage and access your vaults."
        actions={
          meQuery.data?.canCreateVault ? (
            <Button ref={createButtonRef} onClick={openCreateModal}>
              New vault
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Vaults"
          value={vaults.length}
          icon={<Vault className="size-5" />}
          className="gap-3"
        />
        <StatCard
          label="Owned"
          value={ownedVaults}
          icon={<ShieldCheck className="size-5" />}
          className="gap-3"
        />
        <StatCard
          label="Shared"
          value={memberVaults}
          icon={<FolderKanban className="size-5" />}
          className="gap-3"
        />
      </div>

      <SurfacePanel className="space-y-5">
        <SectionTitle
          eyebrow="Vaults"
          title={`${vaults.length} ${vaults.length === 1 ? 'vault' : 'vaults'}`}
        />

        {vaultsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading vaults...</p>
        ) : null}
        {vaultsQuery.isError ? (
          <p className="text-sm text-destructive">Unable to load vaults.</p>
        ) : null}

        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <div className="vault-empty">
            {meQuery.data?.canCreateVault
              ? 'No vaults yet. Create your first vault to start storing documents.'
              : 'No vaults available yet. A global admin must grant vault creation before you can open a new workspace.'}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {vaults.map((vault) => (
              <article
                key={vault.id}
                role="link"
                tabIndex={0}
                className="flex h-full cursor-pointer flex-col rounded-lg border border-border/70 bg-background p-4 transition-colors hover:bg-secondary/45 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:p-5"
                onClick={() => navigate(`/vaults/${vault.id}/documents`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/vaults/${vault.id}/documents`);
                  }
                }}
              >
                <div className="flex h-full min-h-40 gap-4">
                  <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                    <FolderOpen className="size-[1.15rem]" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="truncate text-base font-semibold leading-tight text-foreground">
                        {vault.name}
                      </h2>
                      <div className="flex shrink-0 items-start gap-2">
                        <span className="vault-chip shrink-0">{formatVaultRole(vault.role)}</span>
                        <div
                          className="relative"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Vault actions for ${vault.name}`}
                                className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground transition hover:text-foreground"
                              >
                                <Ellipsis className="size-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-36">
                              <DropdownMenuItem
                                onSelect={() => navigate(`/vaults/${vault.id}/settings`)}
                              >
                                Settings
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                    {getVaultDescription(vault.description) ? (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {getDescriptionPreview(getVaultDescription(vault.description) ?? '')}
                      </p>
                    ) : null}
                    <div className="mt-auto pt-4">
                      <p className="text-sm font-medium text-muted-foreground">
                        {vault.fileCount} {vault.fileCount === 1 ? 'file' : 'files'} •{' '}
                        {formatBytes(vault.totalSize)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Created {formatVaultCreatedDate(vault.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SurfacePanel>

      <Dialog
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeCreateModal();
          }
        }}
      >
        <DialogContent
          className="max-w-xl px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6"
          onPointerDownOutside={(event) => {
            if (createMutation.isPending) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (createMutation.isPending) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader className="space-y-2 pr-10">
            <DialogTitle className="text-sm">New vault</DialogTitle>
            <DialogDescription className="sr-only">Create a new vault.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateSubmit}>
            <Field>
              <FieldLabel htmlFor="create-vault-name">Name</FieldLabel>
              <Input
                id="create-vault-name"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Personal Vault"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="create-vault-description">Description</FieldLabel>
              <Textarea
                id="create-vault-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-24 resize-y"
                placeholder="Optional"
              />
              <FieldDescription>Optional context to help identify this vault later.</FieldDescription>
            </Field>

            {!canCreateVault ? (
              <p className="text-sm text-muted-foreground">
                Vault creation is currently disabled for this account.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateModal}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create vault'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
