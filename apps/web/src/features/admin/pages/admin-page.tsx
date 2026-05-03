import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  DatabaseBackup,
  Globe,
  RefreshCw,
  Sparkles,
  Users,
  Vault,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageIntro, StatCard, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CreateButton,
  RestoreArchiveButton,
  SaveButton,
} from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { FieldLabel } from '@/components/ui/field';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
        <FieldLabel className="text-[0.95rem] font-semibold text-foreground">{label}</FieldLabel>
        {tooltip ? (
          <InfoTooltip content={tooltip} />
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
    return (
      <Alert>
        <AlertDescription>{aiStatusMessage}</AlertDescription>
      </Alert>
    );
  }

  if (saveError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{saveError.message}</AlertDescription>
      </Alert>
    );
  }

  if (modelsError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{modelsError.message}</AlertDescription>
      </Alert>
    );
  }

  if (!aiSettings.enabled) {
    return (
      <Alert>
        <AlertDescription>
          AI normalization is off. Arkivra will skip the Ollama repair step during ingestion.
        </AlertDescription>
      </Alert>
    );
  }

  if (availability?.reachable === false) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {availability.error ?? 'Could not reach the configured Ollama host.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (availability?.modelAvailable === false) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {availability.error ?? `Selected model ${aiSettings.model} is not available.`}
        </AlertDescription>
      </Alert>
    );
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
  const [aiSettingsDraft, setAiSettingsDraft] = useState<AdminAiSettings | null>(null);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const aiSettings = aiSettingsDraft ?? aiSettingsQuery.data?.settings ?? defaultAiSettings;
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

  const createBackupMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: async ({ jobId }) => {
      toast.success(`Backup queued as job ${jobId}.`);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.backups() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not queue backup.');
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: restoreBackup,
    onSuccess: ({ jobId }) => {
      toast.success(`Restore queued as job ${jobId}.`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not queue restore.');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: updateAdminUser,
    onSuccess: async (_, variables) => {
      toast.success(variables.disabled ? 'User disabled.' : 'User re-enabled.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update user.');
    },
  });

  const grantAdminMutation = useMutation({
    mutationFn: grantGlobalAdmin,
    onSuccess: async () => {
      toast.success('Global admin granted.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not grant admin.');
    },
  });

  const revokeAdminMutation = useMutation({
    mutationFn: revokeGlobalAdmin,
    onSuccess: async () => {
      toast.success('Global admin revoked.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not revoke admin.');
    },
  });

  const grantVaultCreatorMutation = useMutation({
    mutationFn: grantVaultCreator,
    onSuccess: async () => {
      toast.success('Vault creation granted.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not grant vault creation.');
    },
  });

  const revokeVaultCreatorMutation = useMutation({
    mutationFn: revokeVaultCreator,
    onSuccess: async () => {
      toast.success('Vault creation revoked.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not revoke vault creation.');
    },
  });

  const updateAiSettingsMutation = useMutation({
    mutationFn: updateAdminAiSettings,
    onSuccess: async ({ settings }) => {
      setAiSettingsDraft(settings);
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
        <Alert variant="destructive">
          <AlertDescription>
            Global admin access is required to open this page.
          </AlertDescription>
        </Alert>
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
                      Use locally running Ollama models to normalize messy OCR text during ingestion into
                      clean identity-document Markdown for retrieval.
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
                <div className="space-y-3">
                  <SettingField
                    label="Feature toggle"
                    tooltip="Turns whole-document OCR normalization on or off. Disable this if you want Arkivra to keep the parser output exactly as extracted."
                  >
                    <label
                      htmlFor="ai-normalization-enabled"
                      className="flex min-h-16 items-center gap-4 rounded-[20px] border border-border/70 bg-background px-5 py-4 text-[0.96rem] font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                    >
                      <Switch
                        id="ai-normalization-enabled"
                        checked={aiSettings.enabled}
                        onCheckedChange={(checked) => {
                          setAiStatusMessage(null);
                          setAiSettingsDraft((current) => ({
                            ...(current ?? aiSettings),
                            enabled: checked,
                          }));
                        }}
                      />
                      <span>Enable AI OCR normalization</span>
                    </label>
                  </SettingField>
                </div>

                <div className="space-y-3">
                  <SettingField
                    label="Ollama host"
                    tooltip="The HTTP address Arkivra uses to talk to Ollama. Example: use http://127.0.0.1:11434 for a local install, or http://192.168.1.50:11434 if Ollama runs on another machine in your LAN."
                    icon={<Globe className="size-6" />}
                  >
                    <Input
                      aria-label="Ollama host"
                      value={aiSettings.ollamaHost}
                      disabled={!aiSettings.enabled}
                      onChange={(event) => {
                        setAiStatusMessage(null);
                        setAiSettingsDraft((current) => ({
                          ...(current ?? aiSettings),
                          ollamaHost: event.target.value,
                        }));
                      }}
                      className={`${vaultInputClassName} h-16 rounded-[20px] pl-14 text-[0.96rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:bg-secondary/40`}
                      placeholder="http://127.0.0.1:11434"
                    />
                  </SettingField>
                </div>

                <div className="space-y-3">
                  <SettingField
                    label="Model"
                    tooltip="The Ollama model used to rewrite noisy OCR into clean identity-document Markdown. A stronger model may do better with IDs, passports, visas, and messy scans."
                    icon={<Bot className="size-6" />}
                  >
                    {modelOptions.length > 0 ? (
                      <Select
                        value={aiSettings.model}
                        disabled={!aiSettings.enabled}
                        onValueChange={(value) => {
                          setAiStatusMessage(null);
                          setAiSettingsDraft((current) => ({
                            ...(current ?? aiSettings),
                            model: value,
                          }));
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
                      <Input
                        aria-label="Ollama model"
                        value={aiSettings.model}
                        disabled={!aiSettings.enabled}
                        onChange={(event) => {
                        setAiStatusMessage(null);
                        setAiSettingsDraft((current) => ({
                          ...(current ?? aiSettings),
                          model: event.target.value,
                        }));
                      }}
                        className={`${vaultInputClassName} h-16 rounded-[20px] pl-14 text-[0.96rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] disabled:bg-secondary/40`}
                        placeholder="gemma4:e4b"
                      />
                    )}
                  </SettingField>
                </div>

              </div>
            </div>

            <div className="flex flex-col gap-5 border-t border-border/70 px-8 py-7 lg:flex-row lg:items-center lg:justify-between">
              <SaveButton
                type="button"
                className="px-7"
                disabled={updateAiSettingsMutation.isPending || aiSettingsQuery.isLoading}
                onClick={() => updateAiSettingsMutation.mutate(aiSettings)}
              >
                {updateAiSettingsMutation.isPending ? 'Saving...' : 'Save changes'}
              </SaveButton>
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
              <CreateButton
                type="button"
                disabled={createBackupMutation.isPending}
                onClick={() => createBackupMutation.mutate()}
              >
                {createBackupMutation.isPending ? 'Queueing...' : 'Create backup'}
              </CreateButton>
            </div>
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
                      <RestoreArchiveButton
                        type="button"
                        variant="outline"
                        disabled={restoreBackupMutation.isPending}
                        onClick={() => restoreBackupMutation.mutate({ backupId: backup.id })}
                      >
                        {restoreBackupMutation.isPending ? 'Queueing...' : 'Restore'}
                      </RestoreArchiveButton>
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
