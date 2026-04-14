import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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
    <section className="space-y-6 pb-8">
      <div>
        <h2 className="font-serif text-4xl tracking-tight">Create vault</h2>
        <p className="text-sm text-muted-foreground">Create a new vault and become its owner.</p>
      </div>

      <div className="max-w-xl rounded-2xl border border-border bg-card p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium">Vault name</label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={event => setName(event.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Personal Vault"
            />
          </div>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create vault'}
            </Button>
            <Link to="/vaults" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}
