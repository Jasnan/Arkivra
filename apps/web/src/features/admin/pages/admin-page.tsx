import { type ReactNode, useDeferredValue, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArchiveRestore,
  Bot,
  CircleHelp,
  DatabaseBackup,
  Globe,
  Layers3,
  RefreshCw,
  Save,
  ScanSearch,
  Sparkles,
  Users,
  Vault,
} from 'lucide-react';
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
};

function SettingField({
  label,
  tooltip,
  icon,
  children,
  className = '',
}: {
  label: string;
  tooltip?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-[0.95rem] font-semibold text-foreground">{label}</span>
        {tooltip ? (
          <span className="group relative inline-flex">
            <span
              aria-label="More info"
              tabIndex={0}
              className="inline-flex size-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:text-foreground"
            >
              <CircleHelp className="size-3.5" />
            </span>
            <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-[16px] border border-border/70 bg-card px-3 py-2 text-xs leading-5 text-muted-foreground shadow-[0_18px_45px_rgba(18,29,66,0.16)] group-hover:block group-focus-within:block">
              {tooltip}
            </span>
          </span>
        ) : null}
      </div>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}

function AiStatusBlock({
  aiSettings,
  aiStatusMessage,
  modelsError,
  saveError,
  availability,
}: {
  aiSettings: AdminAiSettings;
  aiStatusMessage: string | null;
  modelsError: Error | null;
  saveError: Error | null;
  availability:
    | {
        reachable: boolean;
        modelAvailable: boolean;
        host: string;
        model: string;
        error: string | null;
      }
    | undefined;
}) {
  if (aiStatusMessage) {
    return <StatusBanner>{aiStatusMessage}</StatusBanner>;
  }

  if (saveError) {
    return <StatusBanner tone="danger">{saveError.message}</StatusBanner>;
  }

  if (modelsError) {
    return <StatusBanner tone="danger">{modelsError.message}</StatusBanner>;
  }

  if (!aiSettings.enabled) {
    return <StatusBanner>AI normalization is off. Arkivra will skip the Ollama repair step during ingestion.</StatusBanner>;
  }

  if (availability?.reachable === false) {
    return <StatusBanner tone="danger">{availability.error ?? 'Could not reach the configured Ollama host.'}</StatusBanner>;
  }

  if (availability?.modelAvailable === false) {
    return <StatusBanner tone="danger">{availability.error ?? `Selected model ${aiSettings.model} is not available.`}</StatusBanner>;
  }

  if (availability?.modelAvailable === true) {
    return null;
  }

  return null;
}

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

      <div className="space-y-6">
        <SurfacePanel className="overflow-hidden p-0">
            <div className="space-y-8 p-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-5">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-[#f2efff] text-[#7a73f0] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <Sparkles className="size-6" />
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="font-display text-[2.2rem] font-extrabold tracking-[-0.05em] text-primary">AI Normalization</h2>
                      <span className={`inline-flex rounded-full px-3.5 py-1 text-[0.82rem] font-semibold tracking-[0.1em] ${
                        aiSettings.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'
                      }`}>
                        {aiSettings.enabled ? 'ENABLED' : 'OFF'}
                      </span>
                    </div>
                    <p className="max-w-3xl text-[0.96rem] leading-8 text-muted-foreground">
                      Use locally running Ollama models to clean messy OCR text during ingestion. This can
                      help repair glued or broken word boundaries from scanned documents.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-14 rounded-[22px] px-7 text-[0.96rem]"
                  disabled={modelsQuery.isFetching || deferredHost.length === 0}
                  onClick={() => void modelsQuery.refetch()}
                >
                  <RefreshCw className={`size-5 ${modelsQuery.isFetching ? 'animate-spin' : ''}`} />
                  Refresh models
                </Button>
              </div>

              <AiStatusBlock
                aiSettings={aiSettings}
                aiStatusMessage={aiStatusMessage}
                modelsError={modelsQuery.error instanceof Error ? modelsQuery.error : null}
                saveError={updateAiSettingsMutation.error instanceof Error ? updateAiSettingsMutation.error : null}
                availability={availabilityQuery.data?.availability}
              />

              <div className="grid gap-8 md:grid-cols-2">
                <label className="space-y-3">
                  <SettingField
                    label="Feature toggle"
                    tooltip="Turns OCR repair on or off. Example: disable this if you want Arkivra to keep the parser output exactly as extracted without asking Ollama to fix suspicious glued words."
                  >
                    <span className="flex min-h-16 items-center gap-4 rounded-[20px] border border-border/70 bg-background px-5 py-4 text-[0.96rem] font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                      <input
                        type="checkbox"
                        checked={aiSettings.enabled}
                        onChange={event => {
                          setAiStatusMessage(null);
                          setAiSettings(current => ({ ...current, enabled: event.target.checked }));
                        }}
                        className="size-6 accent-[#5f57f5]"
                      />
                      <span>Enable AI OCR normalization</span>
                    </span>
                  </SettingField>
                </label>

                <label className="space-y-3">
                  <SettingField
                    label="Ollama host"
                    tooltip="The HTTP address Arkivra uses to talk to Ollama. Example: use http://127.0.0.1:11434 for a local install, or http://192.168.1.50:11434 if Ollama runs on another machine in your LAN."
                    icon={<Globe className="size-6" />}
                  >
                    <input
                      aria-label="Ollama host"
                      value={aiSettings.ollamaHost}
                      disabled={!aiSettings.enabled}
                      onChange={(event) => {
                        setAiStatusMessage(null);
                        setAiSettings(current => ({ ...current, ollamaHost: event.target.value }));
                      }}
                      className={`${vaultInputClassName} h-16 rounded-[20px] pl-14 text-[0.96rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:bg-secondary/40`}
                      placeholder="http://127.0.0.1:11434"
                    />
                  </SettingField>
                </label>

                <label className="space-y-3">
                  <SettingField
                    label="Model"
                    tooltip="The Ollama model used to repair suspicious OCR lines. Example: a smaller model may be faster, while a stronger model may do better with legal forms or messy scans."
                    icon={<Bot className="size-6" />}
                  >
                    {modelOptions.length > 0 ? (
                      <Select
                        value={aiSettings.model}
                        disabled={!aiSettings.enabled}
                        onValueChange={(value) => {
                          setAiStatusMessage(null);
                          setAiSettings(current => ({ ...current, model: value }));
                        }}
                      >
                        <SelectTrigger aria-label="Ollama model" className="h-16 rounded-[20px] pl-14 text-[0.96rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:bg-secondary/40">
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
                        disabled={!aiSettings.enabled}
                        onChange={(event) => {
                          setAiStatusMessage(null);
                          setAiSettings(current => ({ ...current, model: event.target.value }));
                        }}
                        className={`${vaultInputClassName} h-16 rounded-[20px] pl-14 text-[0.96rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:bg-secondary/40`}
                        placeholder="gemma4:e2b"
                      />
                    )}
                  </SettingField>
                </label>

                <label className="space-y-3">
                  <SettingField
                    label="Min token length"
                    tooltip="The minimum glued-looking run before Arkivra treats a line as suspicious. Example: with 12, a line like GOVERNMENTOFKERALA is a candidate, but a shorter token like VATNo may be ignored."
                    icon={<ScanSearch className="size-6" />}
                  >
                    <input
                      aria-label="Min token length"
                      type="number"
                      min={4}
                      max={128}
                      value={aiSettings.minTokenLength}
                      disabled={!aiSettings.enabled}
                      onChange={event => {
                        setAiStatusMessage(null);
                        setAiSettings(current => ({ ...current, minTokenLength: Number(event.target.value) || 4 }));
                      }}
                      className={`${vaultInputClassName} h-16 rounded-[20px] pl-14 text-[0.96rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:bg-secondary/40`}
                    />
                  </SettingField>
                </label>

                <label className="space-y-3">
                  <SettingField
                    label="Max candidates"
                    tooltip="Caps how many suspicious lines from one document are sent to Ollama. Example: if a scan has 300 noisy lines and this is 100, Arkivra will only send the first 100 candidates."
                    icon={<DatabaseBackup className="size-6" />}
                  >
                    <input
                      aria-label="Max candidates"
                      type="number"
                      min={1}
                      max={1000}
                      value={aiSettings.maxCandidates}
                      disabled={!aiSettings.enabled}
                      onChange={event => {
                        setAiStatusMessage(null);
                        setAiSettings(current => ({ ...current, maxCandidates: Number(event.target.value) || 1 }));
                      }}
                      className={`${vaultInputClassName} h-16 rounded-[20px] pl-14 text-[0.96rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:bg-secondary/40`}
                    />
                  </SettingField>
                </label>

                <label className="space-y-3">
                  <SettingField
                    label="Batch size"
                    tooltip="How many suspicious lines Arkivra sends in each Ollama request. Example: batch size 5 means 20 candidate lines will be sent as 4 requests instead of 20 single-line requests."
                    icon={<Layers3 className="size-6" />}
                  >
                    <input
                      aria-label="Batch size"
                      type="number"
                      min={1}
                      max={200}
                      value={aiSettings.batchSize}
                      disabled={!aiSettings.enabled}
                      onChange={event => {
                        setAiStatusMessage(null);
                        setAiSettings(current => ({ ...current, batchSize: Number(event.target.value) || 1 }));
                      }}
                      className={`${vaultInputClassName} h-16 rounded-[20px] pl-14 text-[0.96rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:bg-secondary/40`}
                    />
                  </SettingField>
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-5 border-t border-border/70 px-8 py-7 lg:flex-row lg:items-center lg:justify-between">
              <Button
                type="button"
                className="h-14 rounded-[22px] px-7 text-[0.96rem]"
                disabled={updateAiSettingsMutation.isPending || aiSettingsQuery.isLoading}
                onClick={() => updateAiSettingsMutation.mutate(aiSettings)}
              >
                <Save className="size-5" />
                {updateAiSettingsMutation.isPending ? 'Saving...' : 'Save settings'}
              </Button>
              <p className="text-[0.94rem] text-muted-foreground">Changes are applied to new ingestion jobs.</p>
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
