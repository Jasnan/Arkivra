import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

export function VaultsPage() {
  const navigate = useNavigate();
  const vaultsQuery = useVaultsQuery();
  const vaults = vaultsQuery.data?.vaults ?? [];
  const [selectedVaultId, setSelectedVaultId] = useState('');

  const canSwitch = useMemo(() => selectedVaultId.length > 0, [selectedVaultId]);

  return (
    <section className="space-y-6 pb-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-4xl tracking-tight">Vaults</h2>
          <p className="text-sm text-muted-foreground">List and switch between vault workspaces.</p>
        </div>
        <Button type="button" onClick={() => navigate('/vaults/new')}>Create vault</Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Vault switcher</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose a vault and open its settings.</p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={selectedVaultId}
            onChange={event => setSelectedVaultId(event.target.value)}
          >
            <option value="">Select a vault</option>
            {vaults.map(vault => (
              <option key={vault.id} value={vault.id}>{vault.name}</option>
            ))}
          </select>
          <Button type="button" disabled={!canSwitch} onClick={() => navigate(`/vaults/${selectedVaultId}/settings`)}>
            Switch
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Your vaults</h3>

        {vaultsQuery.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading vaults…</p> : null}
        {vaultsQuery.isError ? <p className="mt-3 text-sm text-destructive">Unable to load vaults.</p> : null}

        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No vaults yet. Create your first vault.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {vaults.map(vault => (
              <li key={vault.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{vault.name}</p>
                    <p className="text-xs text-muted-foreground">{vault.id} • role: {vault.role ?? 'global_admin'}</p>
                  </div>
                  <Link to={`/vaults/${vault.id}/settings`} className="text-sm font-medium text-primary hover:underline">
                    Open settings
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
