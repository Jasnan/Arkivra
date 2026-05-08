import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
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
}: {
  label: string;
  tooltip?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack gap="3">
      <Flex align="center" gap="2">
        <FieldLabel fontSize="sm" fontWeight="semibold" color="fg">
          {label}
        </FieldLabel>
        {tooltip ? <InfoTooltip content={tooltip} /> : null}
      </Flex>
      <Box position="relative">
        {icon ? (
          <Box
            position="absolute"
            left="5"
            top="50%"
            transform="translateY(-50%)"
            color="fg.muted"
            pointerEvents="none"
          >
            {icon}
          </Box>
        ) : null}
        {children}
      </Box>
    </Stack>
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
    return <Text fontSize="sm" color="fg.muted">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <Stack as="section" gap="6" pb="8">
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
      </Stack>
    );
  }

  return (
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        eyebrow="Instance Oversight"
        title="Admin"
        description="Manage backups, AI normalization, user access, and installation-wide vault oversight from a single governance surface."
      />

      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }}>
        <StatCard
          label="Backups"
          value={(backupsQuery.data?.backups ?? []).length}
          meta="Archives currently available on the server."
          icon={<DatabaseBackup size={20} />}
        />
        <StatCard
          label="Users"
          value={(usersQuery.data?.users ?? []).length}
          meta="Accounts currently visible to the admin API."
          icon={<Users size={20} />}
        />
        <StatCard
          label="Vaults"
          value={(vaultsQuery.data?.vaults ?? []).length}
          meta="Active vaults under installation oversight."
          icon={<Vault size={20} />}
        />
        <StatCard
          label="AI OCR"
          value={aiSettingsQuery.data?.settings.enabled ? 'On' : 'Off'}
          meta={
            aiSettingsQuery.data?.settings.model
              ? `Model: ${aiSettingsQuery.data.settings.model}`
              : 'AI normalization is disabled.'
          }
          icon={<Bot size={20} />}
        />
      </Grid>

      <Stack gap="6">
        <SurfacePanel overflow="hidden" p="0">
          <Stack gap="8" p="8">
            <Flex
              direction={{ base: 'column', xl: 'row' }}
              align={{ base: 'stretch', xl: 'flex-start' }}
              justify={{ base: 'flex-start', xl: 'space-between' }}
              gap="6"
            >
              <Flex gap="5">
                <Flex
                  boxSize="12"
                  shrink="0"
                  align="center"
                  justify="center"
                  rounded="lg"
                  bg="teal.solid"
                  color="fg.inverted"
                >
                  <Sparkles size={24} />
                </Flex>
                <Stack gap="2.5">
                  <Flex align="center" gap="3" flexWrap="wrap">
                    <Text fontSize="xl" fontWeight="semibold" color="fg">
                      AI Normalization
                    </Text>
                    <Box
                      display="inline-flex"
                      rounded="full"
                      px="3"
                      py="1"
                      fontSize="xs"
                      fontWeight="semibold"
                      textTransform="uppercase"
                      letterSpacing="0.08em"
                      bg={aiSettings.enabled ? 'bg.success' : 'bg.subtle'}
                      color={aiSettings.enabled ? 'fg.success' : 'fg.muted'}
                    >
                      {aiSettings.enabled ? 'ENABLED' : 'OFF'}
                    </Box>
                  </Flex>
                  <Text maxW="container.sm" fontSize="sm" lineHeight="6" color="fg.muted">
                    Use locally running Ollama models to normalize messy OCR text during ingestion into
                    clean identity-document Markdown for retrieval.
                  </Text>
                </Stack>
              </Flex>
              <Button
                type="button"
                variant="outline"
                h="10"
                rounded="lg"
                px="4"
                fontSize="sm"
                disabled={modelsQuery.isFetching || deferredHost.length === 0}
                onClick={() => void modelsQuery.refetch()}
              >
                <RefreshCw size={20} style={{ animation: modelsQuery.isFetching ? 'spin 1s linear infinite' : undefined }} />
                Refresh models
              </Button>
            </Flex>

            <AiStatusBlock
              aiSettings={aiSettings}
              aiStatusMessage={aiStatusMessage}
              modelsError={modelsQuery.error instanceof Error ? modelsQuery.error : null}
              saveError={updateAiSettingsMutation.error instanceof Error ? updateAiSettingsMutation.error : null}
              availability={availabilityQuery.data?.availability}
            />

            <Grid gap="8" templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}>
              <Stack gap="3">
                <SettingField
                  label="Feature toggle"
                  tooltip="Turns whole-document OCR normalization on or off. Disable this if you want Arkivra to keep the parser output exactly as extracted."
                >
                  <chakra.label
                    htmlFor="ai-normalization-enabled"
                    display="flex"
                    minH="12"
                    alignItems="center"
                    gap="4"
                    rounded="lg"
                    borderWidth="1px"
                    borderColor="border.subtle"
                    bg="bg.surface"
                    px="4"
                    py="3"
                    fontSize="sm"
                    fontWeight="semibold"
                    color="fg"
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
                    <Text as="span">Enable AI OCR normalization</Text>
                  </chakra.label>
                </SettingField>
              </Stack>

              <Stack gap="3">
                <SettingField
                  label="Ollama host"
                  tooltip="The HTTP address Arkivra uses to talk to Ollama. Example: use http://127.0.0.1:11434 for a local install, or http://192.168.1.50:11434 if Ollama runs on another machine in your LAN."
                  icon={<Globe size={24} />}
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
                    className={vaultInputClassName}
                    h="12"
                    rounded="lg"
                    pl="14"
                    fontSize="sm"
                    placeholder="http://127.0.0.1:11434"
                  />
                </SettingField>
              </Stack>

              <Stack gap="3">
                <SettingField
                  label="Model"
                  tooltip="The Ollama model used to rewrite noisy OCR into clean identity-document Markdown. A stronger model may do better with IDs, passports, visas, and messy scans."
                  icon={<Bot size={24} />}
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
                      <SelectTrigger
                        aria-label="Ollama model"
                        className={vaultInputClassName}
                        h="12"
                        rounded="lg"
                        pl="14"
                        fontSize="sm"
                      >
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
                      className={vaultInputClassName}
                      h="12"
                      rounded="lg"
                      pl="14"
                      fontSize="sm"
                      placeholder="gemma4:e4b"
                    />
                  )}
                </SettingField>
              </Stack>
            </Grid>
          </Stack>

          <Flex
            direction={{ base: 'column', lg: 'row' }}
            align={{ base: 'stretch', lg: 'center' }}
            justify={{ base: 'flex-start', lg: 'space-between' }}
            gap="5"
            borderTopWidth="1px"
            borderColor="border.subtle"
            px="8"
            py="7"
          >
            <SaveButton
              type="button"
              px="7"
              disabled={updateAiSettingsMutation.isPending || aiSettingsQuery.isLoading}
              onClick={() => updateAiSettingsMutation.mutate(aiSettings)}
            >
              {updateAiSettingsMutation.isPending ? 'Saving...' : 'Save changes'}
            </SaveButton>
            <Text fontSize="sm" color="fg.muted">Changes are applied to new ingestion jobs.</Text>
          </Flex>
        </SurfacePanel>

        <SurfacePanel display="flex" flexDirection="column" gap="5">
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'stretch', sm: 'flex-end' }}
            justify={{ base: 'flex-start', sm: 'space-between' }}
            gap="3"
          >
            <Box>
              <Text textStyle="label">Backups</Text>
              <Text fontSize="lg" fontWeight="semibold" color="fg" mt="2">
                Archive control
              </Text>
              <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
                Create a new archive or restore one already stored on the server.
              </Text>
            </Box>
            <CreateButton
              type="button"
              disabled={createBackupMutation.isPending}
              onClick={() => createBackupMutation.mutate()}
            >
              {createBackupMutation.isPending ? 'Queueing...' : 'Create backup'}
            </CreateButton>
          </Flex>
          {backupsQuery.isLoading ? <Text fontSize="sm" color="fg.muted">Loading backups...</Text> : null}
          {!backupsQuery.isLoading && (backupsQuery.data?.backups.length ?? 0) === 0 ? (
            <Box
              rounded="lg"
              borderWidth="1px"
              borderStyle="dashed"
              borderColor="border"
              bg="bg.subtle"
              p="4"
              fontSize="sm"
              color="fg.muted"
            >
              No backups available yet.
            </Box>
          ) : null}

          <Stack gap="4">
            {(backupsQuery.data?.backups ?? []).map(backup => (
              <Box key={backup.id} rounded="lg" bg="bg.subtle" p="5">
                <Flex
                  direction={{ base: 'column', lg: 'row' }}
                  align={{ base: 'stretch', lg: 'center' }}
                  justify={{ base: 'flex-start', lg: 'space-between' }}
                  gap="4"
                >
                  <Box>
                    <Text fontSize="base" fontWeight="semibold" color="fg">{backup.fileName}</Text>
                    <Text mt="2" fontSize="sm" color="fg.muted">
                      Created {formatDate(backup.createdAt)} • {formatBytes(backup.size)}
                    </Text>
                  </Box>
                  <Flex gap="3" flexWrap="wrap">
                    <chakra.a
                      href={getBackupDownloadUrl({ backupId: backup.id })}
                      color="teal.solid"
                      fontWeight="semibold"
                      fontSize="sm"
                    >
                      Download
                    </chakra.a>
                    <RestoreArchiveButton
                      type="button"
                      variant="outline"
                      disabled={restoreBackupMutation.isPending}
                      onClick={() => restoreBackupMutation.mutate({ backupId: backup.id })}
                    >
                      {restoreBackupMutation.isPending ? 'Queueing...' : 'Restore'}
                    </RestoreArchiveButton>
                  </Flex>
                </Flex>
              </Box>
            ))}
          </Stack>
        </SurfacePanel>

        <SurfacePanel display="flex" flexDirection="column" gap="5">
          <Box>
            <Text textStyle="label">Users</Text>
            <Text fontSize="lg" fontWeight="semibold" color="fg" mt="2">
              Access control
            </Text>
            <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
              Suspend accounts and manage global admin privileges.
            </Text>
          </Box>

          {usersQuery.isLoading ? <Text fontSize="sm" color="fg.muted">Loading users...</Text> : null}

          <Stack gap="4">
            {(usersQuery.data?.users ?? []).map(user => (
              <Box key={user.id} rounded="lg" bg="bg.subtle" p="5">
                <Flex
                  direction={{ base: 'column', lg: 'row' }}
                  align={{ base: 'stretch', lg: 'center' }}
                  justify={{ base: 'flex-start', lg: 'space-between' }}
                  gap="4"
                >
                  <Box>
                    <Text fontSize="base" fontWeight="semibold" color="fg">{user.name ?? 'Unnamed user'}</Text>
                    <Text mt="2" fontSize="sm" color="fg.muted">
                      {user.email} • {user.isGlobalAdmin ? 'global admin' : user.canCreateVault ? 'vault creator' : 'user'} • {user.disabledAt ? 'disabled' : 'active'}
                    </Text>
                    <Text fontSize="sm" color="fg.muted">
                      2FA {user.twoFactorEnabled ? 'enabled' : 'not enabled'} • created {formatDate(user.createdAt)}
                    </Text>
                  </Box>
                  <Flex gap="3" flexWrap="wrap">
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
                  </Flex>
                </Flex>
              </Box>
            ))}
          </Stack>
        </SurfacePanel>

        <SurfacePanel variant="soft" display="flex" flexDirection="column" gap="5">
          <Box>
            <Text textStyle="label">Vault Oversight</Text>
            <Text fontSize="lg" fontWeight="semibold" color="fg" mt="2">
              Ownership ledger
            </Text>
            <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
              Inspect active vault ownership across the installation.
            </Text>
          </Box>

          {vaultsQuery.isLoading ? <Text fontSize="sm" color="fg.muted">Loading vaults...</Text> : null}
          {!vaultsQuery.isLoading && (vaultsQuery.data?.vaults.length ?? 0) === 0 ? (
            <Box rounded="lg" borderWidth="1px" borderStyle="dashed" borderColor="border" bg="bg.subtle" p="4" color="fg.muted">
              No active vaults found.
            </Box>
          ) : null}

          <Stack gap="4">
            {(vaultsQuery.data?.vaults ?? []).map(vault => (
              <Box key={vault.id} rounded="lg" bg="bg.surface" p="5">
                <Text fontSize="base" fontWeight="semibold" color="fg">{vault.name}</Text>
                <Text mt="2" fontSize="xs" color="fg.muted">{vault.id}</Text>
                <Text mt="4" fontSize="sm" color="fg.muted">
                  Owner: {vault.ownerName ?? 'Unknown'}{vault.ownerEmail ? ` (${vault.ownerEmail})` : ''}
                </Text>
                <Text fontSize="sm" color="fg.muted">Created {formatDate(vault.createdAt)}</Text>
              </Box>
            ))}
          </Stack>
        </SurfacePanel>
      </Stack>
    </Stack>
  );
}
