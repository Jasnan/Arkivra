import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, FolderKanban, FolderOpen, ShieldCheck, Vault } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageIntro, SectionTitle, StatCard, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';
import { createVault } from '@/features/vaults/vaults.api';
import { vaultQueryKeys } from '@/features/vaults/vaults.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

export function VaultsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const vaultsQuery = useVaultsQuery();
  const vaults = vaultsQuery.data?.vaults ?? [];
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [openMenuVaultId, setOpenMenuVaultId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canCreateVault = meQuery.data?.canCreateVault === true;

  const ownedVaults = useMemo(
    () => vaults.filter(vault => vault.role === 'owner').length,
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
      setErrorMessage(null);
      navigate(`/vaults/${vault.id}/settings`);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create vault.');
    },
  });

  useEffect(() => {
    if (!isCreateModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !createMutation.isPending) {
        setIsCreateModalOpen(false);
        setErrorMessage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [createMutation.isPending, isCreateModalOpen]);

  useEffect(() => {
    if (openMenuVaultId === null) {
      return;
    }

    const handlePointerDown = () => {
      setOpenMenuVaultId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuVaultId(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuVaultId]);

  function openCreateModal() {
    setErrorMessage(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (createMutation.isPending) {
      return;
    }

    setIsCreateModalOpen(false);
    setErrorMessage(null);
    setName('');
    setDescription('');
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!canCreateVault) {
      setErrorMessage('A global admin must grant vault creation before this account can create a workspace.');
      return;
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      setErrorMessage('Vault name is required.');
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
        eyebrow="Storage Infrastructure"
        title="Vault overview"
        description="Open a vault and get to work."
        actions={meQuery.data?.canCreateVault ? <Button onClick={openCreateModal}>Create vault</Button> : undefined}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total vaults"
          value={vaults.length}
          meta="Available now"
          icon={<Vault className="size-5" />}
          className="gap-3"
        />
        <StatCard
          label="Owned by you"
          value={ownedVaults}
          meta="Full control"
          icon={<ShieldCheck className="size-5" />}
          className="gap-3"
        />
        <StatCard
          label="Shared access"
          value={memberVaults}
          meta="Member access"
          icon={<FolderKanban className="size-5" />}
          className="gap-3"
        />
      </div>

      <SurfacePanel className="space-y-5">
        <SectionTitle eyebrow="Active Vaults" title={`${vaults.length} ${vaults.length === 1 ? 'vault' : 'vaults'}`} />

        {vaultsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading vaults...</p> : null}
        {vaultsQuery.isError ? <p className="text-sm text-destructive">Unable to load vaults.</p> : null}

        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <div className="vault-empty">
            {meQuery.data?.canCreateVault
              ? 'No vaults yet. Create your first vault to start storing documents.'
              : 'No vaults available yet. A global admin must grant vault creation before you can open a new workspace.'}
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {vaults.map(vault => (
              <article
                key={vault.id}
                role="link"
                tabIndex={0}
                className="flex h-full cursor-pointer flex-col rounded-[24px] bg-secondary/58 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-card hover:shadow-[0_18px_40px_rgba(19,27,46,0.10)] hover:ring-1 hover:ring-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:p-6"
                onClick={() => navigate(`/vaults/${vault.id}/documents`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/vaults/${vault.id}/documents`);
                  }
                }}
              >
                <div className="flex min-h-[14rem] h-full gap-4">
                  <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-card/90 text-primary">
                    <FolderOpen className="size-[1.15rem]" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="truncate font-display text-[1.65rem] font-bold leading-none tracking-[-0.04em] text-foreground">
                        {vault.name}
                      </h2>
                      <div className="flex shrink-0 items-start gap-2">
                        <span className="vault-chip shrink-0">
                          {vault.role ?? 'global_admin'}
                        </span>
                        <div
                          className="relative"
                          onPointerDown={event => event.stopPropagation()}
                          onClick={event => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`Vault actions for ${vault.name}`}
                            aria-expanded={openMenuVaultId === vault.id}
                            aria-haspopup="menu"
                            className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-card/90 text-muted-foreground transition hover:text-foreground"
                            onClick={() => setOpenMenuVaultId(current => current === vault.id ? null : vault.id)}
                          >
                            <Ellipsis className="size-4" />
                          </button>

                          {openMenuVaultId === vault.id ? (
                            <div
                              role="menu"
                              className="absolute right-0 top-11 z-10 min-w-36 rounded-xl border border-border/70 bg-card p-2 shadow-[0_18px_38px_rgba(19,27,46,0.12)]"
                            >
                              <button
                                type="button"
                                className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                                onClick={() => {
                                  setOpenMenuVaultId(null);
                                  navigate(`/vaults/${vault.id}/settings`);
                                }}
                              >
                                Settings
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {vault.description ? (
                      <p className="mt-2 text-[1rem] leading-7 text-muted-foreground">
                        {getDescriptionPreview(vault.description)}
                      </p>
                    ) : null}
                    <div className="mt-auto pt-4">
                      <p className="text-sm font-medium text-muted-foreground">
                        {vault.fileCount} {vault.fileCount === 1 ? 'file' : 'files'} • {formatBytes(vault.totalSize)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Created {formatDate(vault.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SurfacePanel>

      {isCreateModalOpen && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/65 px-4 py-8 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={closeCreateModal}
          />
          <SurfacePanel className="relative z-10 w-full max-w-xl space-y-5 p-5 sm:p-6">
            <div className="space-y-2">
              <p className="vault-label">Vault Creation</p>
              <h2 className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground">Create vault</h2>
              <p className="text-sm text-muted-foreground">Set a name and continue to vault settings.</p>
            </div>

            {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}

            <form className="space-y-4" onSubmit={handleCreateSubmit}>
              <div className="space-y-2">
                <label htmlFor="create-vault-name" className="vault-label">Vault name</label>
                <input
                  id="create-vault-name"
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className={vaultInputClassName}
                  placeholder="Personal Vault"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="create-vault-description" className="vault-label">Description</label>
                <textarea
                  id="create-vault-description"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  className={`${vaultInputClassName} min-h-24 resize-y`}
                  placeholder="What belongs in this vault?"
                />
              </div>

              {!canCreateVault ? (
                <p className="text-sm text-muted-foreground">
                  Vault creation is currently disabled for this account.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button type="button" variant="outline" onClick={closeCreateModal} disabled={createMutation.isPending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create vault'}
                </Button>
              </div>
            </form>
          </SurfacePanel>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
