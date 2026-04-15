import { useMemo, useState } from 'react';
import { ArrowRight, FolderKanban, ShieldCheck, Vault } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageIntro, SectionTitle, StatCard, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

export function VaultsPage() {
  const navigate = useNavigate();
  const vaultsQuery = useVaultsQuery();
  const vaults = vaultsQuery.data?.vaults ?? [];
  const [selectedVaultId, setSelectedVaultId] = useState('');

  const ownedVaults = useMemo(
    () => vaults.filter(vault => vault.role === 'owner').length,
    [vaults],
  );
  const memberVaults = Math.max(0, vaults.length - ownedVaults);

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Storage Infrastructure"
        title="Vault overview"
        description="Switch between secure workspaces, keep roles visible, and move quickly into the vault that needs attention."
        actions={<Button onClick={() => navigate('/vaults/new')}>Create vault</Button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total vaults"
          value={vaults.length}
          meta="Every vault is isolated by membership and permissions."
          icon={<Vault className="size-5" />}
        />
        <StatCard
          label="Owned by you"
          value={ownedVaults}
          meta="Owner access includes governance, transfer, and deletion controls."
          icon={<ShieldCheck className="size-5" />}
        />
        <StatCard
          label="Shared access"
          value={memberVaults}
          meta="Member vaults stay available with their assigned permissions."
          icon={<FolderKanban className="size-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <SurfacePanel className="space-y-6">
          <SectionTitle eyebrow="Active Vaults" title="Workspace directory" />

          {vaultsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading vaults...</p> : null}
          {vaultsQuery.isError ? <p className="text-sm text-destructive">Unable to load vaults.</p> : null}

          {!vaultsQuery.isLoading && vaults.length === 0 ? (
            <div className="vault-empty">
              No vaults yet. Create your first vault to start storing documents.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {vaults.map(vault => (
                <div key={vault.id} className="rounded-[24px] bg-secondary/58 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-card/90 text-primary">
                        <Vault className="size-5" />
                      </div>
                      <div>
                        <h2 className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground">
                          {vault.name}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {vault.id}
                        </p>
                      </div>
                    </div>

                    <span className="vault-chip">
                      {vault.role ?? 'global_admin'}
                    </span>
                  </div>

                  <p className="mt-5 text-sm leading-6 text-muted-foreground">
                    Open the document library for daily work or jump into governance controls for membership and vault settings.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link to={`/vaults/${vault.id}/documents`} className="vault-link inline-flex items-center gap-2">
                      Open documents
                      <ArrowRight className="size-4" />
                    </Link>
                    <Link to={`/vaults/${vault.id}/settings`} className="vault-link">
                      Settings
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfacePanel>

        <SurfacePanel variant="soft" className="space-y-5">
          <p className="vault-label">Jump to a workspace</p>
          <select
            className={vaultInputClassName}
            value={selectedVaultId}
            onChange={event => setSelectedVaultId(event.target.value)}
          >
            <option value="">Select a vault</option>
            {vaults.map(vault => (
              <option key={vault.id} value={vault.id}>
                {vault.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            className="w-full"
            disabled={selectedVaultId.length === 0}
            onClick={() => navigate(`/vaults/${selectedVaultId}/settings`)}
          >
            Open selected vault
          </Button>
        </SurfacePanel>
      </div>
    </section>
  );
}
