import { useDeferredValue, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, Bot, DatabaseBackup, RefreshCw, Users, Vault } from 'lucide-react';
import { PageIntro, StatCard, StatusBanner, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  createBackup,
  getBackupDownloadUrl,
  grantGlobalAdmin,
  grantVaultCreator,
  restoreBackup,
  revokeGlobalAdmin,
  revokeVaultCreator,
  updateAdminAiSettings,
  updateAdminUser,
} from '@/features/admin/admin.api';
import {
  adminQueryKeys,
  useAdminAiAvailabilityQuery,
  useAdminAiSettingsQuery,
  useAdminBackupsQuery,
  useAdminOllamaModelsQuery,
  useAdminUsersQuery,
  useAdminVaultsQuery,
} from '@/features/admin/admin.queries';
import type { AdminAiSettings } from '@/features/admin/admin.types';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';

const defaultAiSettings: AdminAiSettings = {
  enabled: false,
  ollamaHost: 'http://127.0.0.1:11434',
  model: '',
  minTokenLength: 12,
  maxCandidates: 100,
  batchSize: 10,
  logRequests: false,
};

export function AdminPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isGlobalAdmin === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const backupsQuery = useAdminBackupsQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const aiSettingsQuery = useAdminAiSettingsQuery({ enabled: isEnabled });
  const [aiSettings, setAiSettings] = useState<AdminAiSettings>(defaultAiSettings);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const deferredHost = useDeferredValue(aiSettings.ollamaHost.trim());
  const deferredModel = useDeferredValue(aiSettings.model.trim());
  const modelsQuery = useAdminOllamaModelsQuery({
    host: deferredHost,
    enabled: isEnabled && deferredHost.length > 0,
  });
  const availabilityQuery = useAdminAiAvailabilityQuery({
    host: deferredHost,
    model: deferredModel,
    enabled: isEnabled && aiSettings.enabled && deferredHost.length > 0 && deferredModel.length > 0,
  });

  useEffect(() => {
    if (aiSettingsQuery.data?.settings !== undefined) {
      setAiSettings(aiSettingsQuery.data.settings);
    }
  }, [aiSettingsQuery.data?.settings]);

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

  const updateAiSettingsMutation = useMutation({
    mutationFn: updateAdminAiSettings,
    onSuccess: async ({ settings }) => {
      setAiSettings(settings);
      setAiStatusMessage('AI settings saved.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.ai() }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiSettings() }),
      ]);
    },
    onError: () => {
      setAiStatusMessage(null);
    },
  });

  const modelOptions = [...(modelsQuery.data?.models ?? [])];
  if (aiSettings.model.trim().length > 0 && !modelOptions.some(model => model.name === aiSettings.model)) {
    modelOptions.unshift({
      name: aiSettings.model,
      size: null,
      modifiedAt: null,
    });
  }

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
        description="Manage backups, AI normalization, user access, and installation-wide vault oversight from a single governance surface."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
        <StatCard
          label="AI OCR"
          value={aiSettingsQuery.data?.settings.enabled ? 'On' : 'Off'}
          meta={
            aiSettingsQuery.data?.settings.model
              ? `Model: ${aiSettingsQuery.data.settings.model}`
              : 'AI normalization is disabled.'
          }
          icon={<Bot className="size-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-6">
          <SurfacePanel className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="vault-label">AI Normalization</p>
                <h2 className="font-display mt-2 text-3xl font-bold tracking-[-0.04em] text-foreground">OCR repair controls</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Point Arkivra at an Ollama host, choose the normalization model, and verify availability before ingestion uses it.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={modelsQuery.isFetching || deferredHost.length === 0}
                onClick={() => void modelsQuery.refetch()}
              >
                <RefreshCw className={`size-4 ${modelsQuery.isFetching ? 'animate-spin' : ''}`} />
                Refresh models
              </Button>
            </div>

            {aiStatusMessage ? <StatusBanner>{aiStatusMessage}</StatusBanner> : null}
            {updateAiSettingsMutation.isError ? (
              <StatusBanner tone="danger">
                {updateAiSettingsMutation.error instanceof Error ? updateAiSettingsMutation.error.message : 'Could not save AI settings.'}
              </StatusBanner>
            ) : null}
            {modelsQuery.isError ? (
              <StatusBanner tone="danger">
                {modelsQuery.error instanceof Error ? modelsQuery.error.message : 'Could not load Ollama models.'}
              </StatusBanner>
            ) : null}
            {!aiSettings.enabled ? (
              <StatusBanner>AI normalization is disabled. Documents will skip the Ollama step.</StatusBanner>
            ) : availabilityQuery.data?.availability.reachable === false ? (
              <StatusBanner tone="danger">
                {availabilityQuery.data.availability.error ?? 'Could not reach the configured Ollama host.'}
              </StatusBanner>
            ) : availabilityQuery.data?.availability.modelAvailable === false ? (
              <StatusBanner tone="danger">
                Selected model `{aiSettings.model}` is not available on `{aiSettings.ollamaHost}`.
              </StatusBanner>
            ) : availabilityQuery.data?.availability.modelAvailable === true ? (
              <StatusBanner>
                Model `{availabilityQuery.data.availability.model}` is available on `{availabilityQuery.data.availability.host}`.
              </StatusBanner>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="vault-label">Feature toggle</span>
                <span className="flex min-h-12 items-center gap-3 rounded-[16px] border border-border/70 bg-background px-4">
                  <input
                    type="checkbox"
                    checked={aiSettings.enabled}
                    onChange={event => {
                      setAiStatusMessage(null);
                      setAiSettings(current => ({ ...current, enabled: event.target.checked }));
                    }}
                  />
                  <span className="text-sm font-semibold text-foreground">Enable AI OCR normalization</span>
                </span>
              </label>

              <label className="space-y-2">
                <span className="vault-label">Ollama host</span>
                <input
                  aria-label="Ollama host"
                  value={aiSettings.ollamaHost}
                  onChange={(event) => {
                    setAiStatusMessage(null);
                    setAiSettings(current => ({ ...current, ollamaHost: event.target.value }));
                  }}
                  className={`${vaultInputClassName} h-11 rounded-[16px]`}
                  placeholder="http://127.0.0.1:11434"
                />
              </label>

              <label className="space-y-2">
                <span className="vault-label">Model</span>
                {modelOptions.length > 0 ? (
                  <Select
                    value={aiSettings.model}
                    onValueChange={(value) => {
                      setAiStatusMessage(null);
                      setAiSettings(current => ({ ...current, model: value }));
                    }}
                  >
                    <SelectTrigger aria-label="Ollama model" className="rounded-[16px]">
                      <SelectValue placeholder="Select an Ollama model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map(model => (
                        <SelectItem key={model.name} value={model.name}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <input
                    aria-label="Ollama model"
                    value={aiSettings.model}
                    onChange={(event) => {
                      setAiStatusMessage(null);
                      setAiSettings(current => ({ ...current, model: event.target.value }));
                    }}
                    className={`${vaultInputClassName} h-11 rounded-[16px]`}
                    placeholder="gemma4:e2b"
                  />
                )}
              </label>

              <label className="space-y-2">
                <span className="vault-label">Log requests</span>
                <span className="flex min-h-12 items-center gap-3 rounded-[16px] border border-border/70 bg-background px-4">
                  <input
                    type="checkbox"
                    checked={aiSettings.logRequests}
                    onChange={event => {
                      setAiStatusMessage(null);
                      setAiSettings(current => ({ ...current, logRequests: event.target.checked }));
                    }}
                  />
                  <span className="text-sm font-semibold text-foreground">Record Ollama request logs</span>
                </span>
              </label>

              <label className="space-y-2">
                <span className="vault-label">Min token length</span>
                <input
                  aria-label="Min token length"
                  type="number"
                  min={4}
                  max={128}
                  value={aiSettings.minTokenLength}
                  onChange={event => {
                    setAiStatusMessage(null);
                    setAiSettings(current => ({ ...current, minTokenLength: Number(event.target.value) || 4 }));
                  }}
                  className={`${vaultInputClassName} h-11 rounded-[16px]`}
                />
              </label>

              <label className="space-y-2">
                <span className="vault-label">Max candidates</span>
                <input
                  aria-label="Max candidates"
                  type="number"
                  min={1}
                  max={1000}
                  value={aiSettings.maxCandidates}
                  onChange={event => {
                    setAiStatusMessage(null);
                    setAiSettings(current => ({ ...current, maxCandidates: Number(event.target.value) || 1 }));
                  }}
                  className={`${vaultInputClassName} h-11 rounded-[16px]`}
                />
              </label>

              <label className="space-y-2">
                <span className="vault-label">Batch size</span>
                <input
                  aria-label="Batch size"
                  type="number"
                  min={1}
                  max={200}
                  value={aiSettings.batchSize}
                  onChange={event => {
                    setAiStatusMessage(null);
                    setAiSettings(current => ({ ...current, batchSize: Number(event.target.value) || 1 }));
                  }}
                  className={`${vaultInputClassName} h-11 rounded-[16px]`}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={updateAiSettingsMutation.isPending || aiSettingsQuery.isLoading}
                onClick={() => updateAiSettingsMutation.mutate(aiSettings)}
              >
                {updateAiSettingsMutation.isPending ? 'Saving...' : 'Save AI settings'}
              </Button>
              <p className="text-sm text-muted-foreground">
                {modelsQuery.data?.models.length
                  ? `${modelsQuery.data.models.length} model(s) discovered on this host.`
                  : 'Enter an Ollama host to discover models.'}
              </p>
            </div>
          </SurfacePanel>

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
