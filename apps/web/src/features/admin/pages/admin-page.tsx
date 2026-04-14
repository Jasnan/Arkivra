import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  createBackup,
  getBackupDownloadUrl,
  grantGlobalAdmin,
  restoreBackup,
  revokeGlobalAdmin,
  updateAdminUser,
} from '@/features/admin/admin.api';
import { adminQueryKeys, useAdminBackupsQuery, useAdminUsersQuery, useAdminVaultsQuery } from '@/features/admin/admin.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';

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

  if (meQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading admin context…</p>;
  }

  if (!isEnabled) {
    return (
      <section className="space-y-4 pb-8">
        <h2 className="font-serif text-4xl tracking-tight">Admin</h2>
        <p className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Global admin access is required to open this page.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-8">
      <div>
        <h2 className="font-serif text-4xl tracking-tight">Admin</h2>
        <p className="text-sm text-muted-foreground">Manage backups, user access, and installation-wide vault oversight.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">Backups</h3>
                <p className="text-sm text-muted-foreground">Create a new archive or restore one already stored on the server.</p>
              </div>
              <Button
                type="button"
                disabled={createBackupMutation.isPending}
                onClick={() => createBackupMutation.mutate()}
              >
                {createBackupMutation.isPending ? 'Queueing…' : 'Create backup'}
              </Button>
            </div>

            {createBackupMutation.data ? (
              <p className="mt-4 text-sm text-muted-foreground">Backup queued as job `{createBackupMutation.data.jobId}`.</p>
            ) : null}
            {createBackupMutation.isError ? (
              <p className="mt-4 text-sm text-destructive">
                {createBackupMutation.error instanceof Error ? createBackupMutation.error.message : 'Could not queue backup.'}
              </p>
            ) : null}

            {backupsQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading backups…</p> : null}
            {!backupsQuery.isLoading && (backupsQuery.data?.backups.length ?? 0) === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No backups available yet.</p>
            ) : null}

            <ul className="mt-4 space-y-3">
              {(backupsQuery.data?.backups ?? []).map(backup => (
                <li key={backup.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-medium">{backup.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatDate(backup.createdAt)} • {formatBytes(backup.size)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={getBackupDownloadUrl({ backupId: backup.id })}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-input px-4 text-sm font-medium hover:bg-accent"
                      >
                        Download
                      </a>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={restoreBackupMutation.isPending}
                        onClick={() => restoreBackupMutation.mutate({ backupId: backup.id })}
                      >
                        {restoreBackupMutation.isPending ? 'Queueing…' : 'Restore'}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {restoreBackupMutation.data ? (
              <p className="mt-4 text-sm text-muted-foreground">Restore queued as job `{restoreBackupMutation.data.jobId}`.</p>
            ) : null}
            {restoreBackupMutation.isError ? (
              <p className="mt-4 text-sm text-destructive">
                {restoreBackupMutation.error instanceof Error ? restoreBackupMutation.error.message : 'Could not queue restore.'}
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">Users</h3>
            <p className="text-sm text-muted-foreground">Suspend accounts and manage global admin privileges.</p>

            {usersQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading users…</p> : null}
            <ul className="mt-4 space-y-3">
              {(usersQuery.data?.users ?? []).map(user => (
                <li key={user.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="font-medium">{user.name ?? 'Unnamed user'}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email} • {user.isGlobalAdmin ? 'global admin' : 'user'} • {user.disabledAt ? 'disabled' : 'active'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        2FA {user.twoFactorEnabled ? 'enabled' : 'not enabled'} • created {formatDate(user.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {updateUserMutation.isError ? (
              <p className="mt-4 text-sm text-destructive">
                {updateUserMutation.error instanceof Error ? updateUserMutation.error.message : 'Could not update user.'}
              </p>
            ) : null}
            {grantAdminMutation.isError ? (
              <p className="mt-4 text-sm text-destructive">
                {grantAdminMutation.error instanceof Error ? grantAdminMutation.error.message : 'Could not grant admin.'}
              </p>
            ) : null}
            {revokeAdminMutation.isError ? (
              <p className="mt-4 text-sm text-destructive">
                {revokeAdminMutation.error instanceof Error ? revokeAdminMutation.error.message : 'Could not revoke admin.'}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">Vault oversight</h3>
          <p className="text-sm text-muted-foreground">Inspect active vault ownership across the installation.</p>

          {vaultsQuery.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading vaults…</p> : null}
          {!vaultsQuery.isLoading && (vaultsQuery.data?.vaults.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No active vaults found.</p>
          ) : null}

          <ul className="mt-4 space-y-3">
            {(vaultsQuery.data?.vaults ?? []).map(vault => (
              <li key={vault.id} className="rounded-xl border border-border bg-background p-4">
                <p className="font-medium">{vault.name}</p>
                <p className="text-xs text-muted-foreground">{vault.id}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Owner: {vault.ownerName ?? 'Unknown'}{vault.ownerEmail ? ` (${vault.ownerEmail})` : ''}
                </p>
                <p className="text-xs text-muted-foreground">Created {formatDate(vault.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
