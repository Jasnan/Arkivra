import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, DatabaseBackup, Users, Vault } from 'lucide-react';
import { PageIntro, StatCard, StatusBanner, SurfacePanel } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import {
  createBackup,
  getBackupDownloadUrl,
  grantGlobalAdmin,
  grantVaultCreator,
  restoreBackup,
  revokeGlobalAdmin,
  revokeVaultCreator,
  updateAdminUser,
} from '@/features/admin/admin.api';
import { adminQueryKeys, useAdminBackupsQuery, useAdminUsersQuery, useAdminVaultsQuery } from '@/features/admin/admin.queries';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';

export function AdminPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isGlobalAdmin === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const backupsQuery = useAdminBackupsQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });

  const createBackupMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.backups() });
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: restoreBackup,
  });

  const updateUserMutation = useMutation({
    mutationFn: updateAdminUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
  });

  const grantAdminMutation = useMutation({
    mutationFn: grantGlobalAdmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
  });

  const revokeAdminMutation = useMutation({
    mutationFn: revokeGlobalAdmin,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
  });

  const grantVaultCreatorMutation = useMutation({
    mutationFn: grantVaultCreator,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
  });

  const revokeVaultCreatorMutation = useMutation({
    mutationFn: revokeVaultCreator,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
  });

  if (meQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading admin context...</p>;
  }

  if (!isEnabled) {
    return (
      <section className="space-y-6 pb-8">
        <PageIntro
          eyebrow="Instance Oversight"
          title="Admin"
          description="Global admin access is required to open this page."
        />
        <StatusBanner tone="danger">Global admin access is required to open this page.</StatusBanner>
      </section>
    );
  }

  return (
    <section className="space-y-8 pb-8">
      <PageIntro
        eyebrow="Instance Oversight"
        title="Admin"
        description="Manage backups, user access, and installation-wide vault oversight from a single governance surface."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Backups"
          value={(backupsQuery.data?.backups ?? []).length}
          meta="Archives currently available on the server."
          icon={<DatabaseBackup className="size-5" />}
        />
        <StatCard
          label="Users"
          value={(usersQuery.data?.users ?? []).length}
          meta="Accounts currently visible to the admin API."
          icon={<Users className="size-5" />}
        />
        <StatCard
          label="Vaults"
          value={(vaultsQuery.data?.vaults ?? []).length}
          meta="Active vaults under installation oversight."
          icon={<Vault className="size-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <SurfacePanel className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="vault-label">Backups</p>
                <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Archive control</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create a new archive or restore one already stored on the server.
                </p>
              </div>
              <Button
                type="button"
                disabled={createBackupMutation.isPending}
                onClick={() => createBackupMutation.mutate()}
              >
                {createBackupMutation.isPending ? 'Queueing...' : 'Create backup'}
              </Button>
            </div>

            {createBackupMutation.data ? (
              <StatusBanner>Backup queued as job `{createBackupMutation.data.jobId}`.</StatusBanner>
            ) : null}
            {createBackupMutation.isError ? (
              <StatusBanner tone="danger">
                {createBackupMutation.error instanceof Error ? createBackupMutation.error.message : 'Could not queue backup.'}
              </StatusBanner>
            ) : null}
            {restoreBackupMutation.data ? (
              <StatusBanner>Restore queued as job `{restoreBackupMutation.data.jobId}`.</StatusBanner>
            ) : null}
            {restoreBackupMutation.isError ? (
              <StatusBanner tone="danger">
                {restoreBackupMutation.error instanceof Error ? restoreBackupMutation.error.message : 'Could not queue restore.'}
              </StatusBanner>
            ) : null}

            {backupsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading backups...</p> : null}
            {!backupsQuery.isLoading && (backupsQuery.data?.backups.length ?? 0) === 0 ? (
              <div className="vault-empty">No backups available yet.</div>
            ) : null}

            <div className="space-y-4">
              {(backupsQuery.data?.backups ?? []).map(backup => (
                <article key={backup.id} className="rounded-[24px] bg-secondary/56 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground">{backup.fileName}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Created {formatDate(backup.createdAt)} • {formatBytes(backup.size)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <a href={getBackupDownloadUrl({ backupId: backup.id })} className="vault-link">
                        Download
                      </a>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={restoreBackupMutation.isPending}
                        onClick={() => restoreBackupMutation.mutate({ backupId: backup.id })}
                      >
                        <ArchiveRestore className="size-4" />
                        {restoreBackupMutation.isPending ? 'Queueing...' : 'Restore'}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </SurfacePanel>

          <SurfacePanel className="space-y-5">
            <div>
              <p className="vault-label">Users</p>
              <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Access control</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Suspend accounts and manage global admin privileges.
              </p>
            </div>

            {usersQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading users...</p> : null}

            <div className="space-y-4">
              {(usersQuery.data?.users ?? []).map(user => (
                <article key={user.id} className="rounded-[24px] bg-secondary/56 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground">{user.name ?? 'Unnamed user'}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {user.email} • {user.isGlobalAdmin ? 'global admin' : user.canCreateVault ? 'vault creator' : 'user'} • {user.disabledAt ? 'disabled' : 'active'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        2FA {user.twoFactorEnabled ? 'enabled' : 'not enabled'} • created {formatDate(user.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={updateUserMutation.isPending}
                        onClick={() => updateUserMutation.mutate({ userId: user.id, disabled: user.disabledAt === null })}
                      >
                        {user.disabledAt ? 'Re-enable' : 'Disable'}
                      </Button>
                      {user.isGlobalAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={revokeAdminMutation.isPending}
                          onClick={() => revokeAdminMutation.mutate({ userId: user.id })}
                        >
                          Revoke admin
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={grantAdminMutation.isPending}
                          onClick={() => grantAdminMutation.mutate({ userId: user.id })}
                        >
                          Grant admin
                        </Button>
                      )}
                      {user.canCreateVault && !user.isGlobalAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={revokeVaultCreatorMutation.isPending}
                          onClick={() => revokeVaultCreatorMutation.mutate({ userId: user.id })}
                        >
                          Revoke vault creation
                        </Button>
                      ) : null}
                      {!user.canCreateVault ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={grantVaultCreatorMutation.isPending}
                          onClick={() => grantVaultCreatorMutation.mutate({ userId: user.id })}
                        >
                          Grant vault creation
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {updateUserMutation.isError ? (
              <StatusBanner tone="danger">
                {updateUserMutation.error instanceof Error ? updateUserMutation.error.message : 'Could not update user.'}
              </StatusBanner>
            ) : null}
            {grantAdminMutation.isError ? (
              <StatusBanner tone="danger">
                {grantAdminMutation.error instanceof Error ? grantAdminMutation.error.message : 'Could not grant admin.'}
              </StatusBanner>
            ) : null}
            {revokeAdminMutation.isError ? (
              <StatusBanner tone="danger">
                {revokeAdminMutation.error instanceof Error ? revokeAdminMutation.error.message : 'Could not revoke admin.'}
              </StatusBanner>
            ) : null}
            {grantVaultCreatorMutation.isError ? (
              <StatusBanner tone="danger">
                {grantVaultCreatorMutation.error instanceof Error ? grantVaultCreatorMutation.error.message : 'Could not grant vault creation.'}
              </StatusBanner>
            ) : null}
            {revokeVaultCreatorMutation.isError ? (
              <StatusBanner tone="danger">
                {revokeVaultCreatorMutation.error instanceof Error ? revokeVaultCreatorMutation.error.message : 'Could not revoke vault creation.'}
              </StatusBanner>
            ) : null}
          </SurfacePanel>
        </div>

        <SurfacePanel variant="soft" className="space-y-5">
          <div>
            <p className="vault-label">Vault Oversight</p>
            <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">Ownership ledger</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Inspect active vault ownership across the installation.
            </p>
          </div>

          {vaultsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading vaults...</p> : null}
          {!vaultsQuery.isLoading && (vaultsQuery.data?.vaults.length ?? 0) === 0 ? (
            <div className="vault-empty">No active vaults found.</div>
          ) : null}

          <div className="space-y-4">
            {(vaultsQuery.data?.vaults ?? []).map(vault => (
              <article key={vault.id} className="rounded-[24px] bg-card/85 p-5">
                <h3 className="font-display text-2xl font-bold tracking-[-0.04em] text-foreground">{vault.name}</h3>
                <p className="mt-2 text-xs text-muted-foreground">{vault.id}</p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Owner: {vault.ownerName ?? 'Unknown'}{vault.ownerEmail ? ` (${vault.ownerEmail})` : ''}
                </p>
                <p className="text-sm text-muted-foreground">Created {formatDate(vault.createdAt)}</p>
              </article>
            ))}
          </div>
        </SurfacePanel>
      </div>
    </section>
  );
}
