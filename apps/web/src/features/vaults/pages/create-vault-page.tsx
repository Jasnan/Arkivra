import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ShieldCheck, Vault } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageIntro, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { createVault } from '@/features/vaults/vaults.api';
import { vaultQueryKeys } from '@/features/vaults/vaults.queries';

export function CreateVaultPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createVault,
    onSuccess: async ({ vault }) => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.list() });
      navigate(`/vaults/${vault.id}/settings`);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create vault.');
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const normalizedName = name.trim();
    if (!normalizedName) {
      setErrorMessage('Vault name is required.');
      return;
    }

    createMutation.mutate({ name: normalizedName });
  }

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Vault Creation"
        title="Create vault"
        description="Start a new secure workspace, become its owner, and prepare it for documents, members, and search."
        actions={<Link to="/vaults" className="vault-link">Back to vaults</Link>}
      />

      {errorMessage ? <StatusBanner tone="danger">{errorMessage}</StatusBanner> : null}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <SurfacePanel className="max-w-3xl space-y-5">
          <div>
            <p className="vault-label">Vault Identity</p>
            <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Name your workspace</h2>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="name" className="vault-label">Vault name</label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={event => setName(event.target.value)}
                className={vaultInputClassName}
                placeholder="Personal Vault"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create vault'}
              </Button>
              <Link to="/vaults" className="vault-link">Cancel</Link>
            </div>
          </form>
        </SurfacePanel>

        <SurfacePanel variant="strong" className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="vault-label text-primary-foreground/70">What happens next</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em]">Owner access by default</h2>
            </div>
            <Vault className="size-5 text-accent" />
          </div>

          <div className="space-y-3 text-sm leading-6 text-primary-foreground/80">
            <p className="inline-flex items-center gap-3">
              <ShieldCheck className="size-4" />
              You become the initial vault owner.
            </p>
            <p className="inline-flex items-center gap-3">
              <ArrowRight className="size-4" />
              After creation, you will land on vault settings to configure the rest.
            </p>
          </div>
        </SurfacePanel>
      </div>
    </section>
  );
}
