import type { FormEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Box, Flex, Grid, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, ShieldCheck, ShieldX, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CreateButton,
  RestoreArchiveButton,
  SaveButton,
} from '@/components/ui/action-buttons';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  useAdminAiSettingsQuery,
  useAdminBackupsQuery,
  useAdminUsersQuery,
  useAdminVaultsQuery,
} from '@/features/admin/admin.queries';
import type { AdminAiSettings, AdminUser } from '@/features/admin/admin.types';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';
import {
  KeyValueRows,
  SettingsPageFrame,
  SettingsDropdown,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from '@/features/settings/components/settings-ui';

type AdminUserStatusFilter = 'all' | 'active' | 'disabled';
type AdminUserAccessFilter = 'all' | 'global-admin' | 'vault-creator' | 'user';

const ADMIN_USERS_GRID_COLUMNS = 'minmax(0, 1.45fr) 8.5rem 8rem 7rem 8rem 8rem 8.5rem 2.75rem';

const userStatusFilterOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
];

const userAccessFilterOptions = [
  { value: 'all', label: 'All access' },
  { value: 'global-admin', label: 'Global admins' },
  { value: 'vault-creator', label: 'Vault creators' },
  { value: 'user', label: 'Users' },
];

function formatCount(value: number | undefined, singular: string, plural = `${singular}s`) {
  const safeValue = value ?? 0;
  return `${safeValue} ${safeValue === 1 ? singular : plural}`;
}

function getUserAccessLabel(user: AdminUser) {
  if (user.isGlobalAdmin) return 'Global admin';
  if (user.canCreateVault) return 'Vault creator';
  return 'User';
}

function getProviderLabel(provider: string) {
  const labels: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
  };

  return labels[provider.toLowerCase()] ?? provider;
}

function getAccountTypeLabel(user: AdminUser) {
  const authMethods = user.authMethods;

  if (!authMethods) return 'Unknown';

  const providers = authMethods.oauthProviders.map(getProviderLabel);

  if (authMethods.hasPassword && providers.length > 0) {
    return `Local & ${providers.join(', ')}`;
  }

  if (authMethods.hasPassword) return 'Local';
  if (providers.length > 0) return providers.join(', ');

  return 'Unknown';
}

function getUserAccessFilter(user: AdminUser): AdminUserAccessFilter {
  if (user.isGlobalAdmin) return 'global-admin';
  if (user.canCreateVault) return 'vault-creator';
  return 'user';
}

const emptyAiSettings: AdminAiSettings = {
  ollamaHost: '',
  model: '',
};

function AdminAccessBoundary({
  accessTitle,
  children,
  description,
  isEnabled,
  isLoading,
  title,
}: {
  title?: ReactNode;
  accessTitle?: string;
  description?: ReactNode;
  isEnabled: boolean;
  isLoading: boolean;
  children: ReactNode;
}) {
  if (isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title={title ?? accessTitle} description="Global admin access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Global admin access is required to open this page.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  return (
    <SettingsPageFrame title={title} description={description}>
      {children}
    </SettingsPageFrame>
  );
}

export function AdminOverviewPage() {
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isGlobalAdmin === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const backupsQuery = useAdminBackupsQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const backups = backupsQuery.data?.backups ?? [];
  const users = usersQuery.data?.users ?? [];
  const vaults = vaultsQuery.data?.vaults ?? [];

  return (
    <AdminAccessBoundary
      title="Overview"
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection title="Instance overview" description="Current installation-wide resources visible to the admin API.">
        <KeyValueRows
          rows={[
            { label: 'Backups', value: backupsQuery.isLoading ? 'Loading...' : formatCount(backups.length, 'archive') },
            { label: 'Users', value: usersQuery.isLoading ? 'Loading...' : formatCount(users.length, 'account') },
            { label: 'Vaults', value: vaultsQuery.isLoading ? 'Loading...' : formatCount(vaults.length, 'vault') },
          ]}
        />
      </SettingsSection>

    </AdminAccessBoundary>
  );
}

export function AdminBackupsPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isGlobalAdmin === true;
  const backupsQuery = useAdminBackupsQuery({ enabled: isEnabled });
  const backups = backupsQuery.data?.backups ?? [];

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

  return (
    <AdminAccessBoundary
      title="Backups"
      description="Create a new archive or restore one already stored on the server."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection
        title="Archive control"
        description="Backups are installation-wide and affect all vaults and users."
        actions={
          <CreateButton
            type="button"
            size="sm"
            disabled={createBackupMutation.isPending}
            onClick={() => createBackupMutation.mutate()}
          >
            {createBackupMutation.isPending ? 'Queueing...' : 'Create backup'}
          </CreateButton>
        }
      >
        {backupsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading backups...</Text> : null}
        {!backupsQuery.isLoading && backups.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.subtle" bg="bg.subtle" p="4" textStyle="sm" color="fg.muted">
            No backups available yet.
          </Box>
        ) : null}

        {backups.length > 0 ? (
          <SettingsRows>
            {backups.map(backup => (
              <SettingsRow
                key={backup.id}
                label={backup.fileName}
                description={`Created ${formatDate(backup.createdAt)} · ${formatBytes(backup.size)}`}
                control={
                  <HStack gap="3" flexWrap="wrap" justify={{ base: 'flex-start', lg: 'flex-end' }}>
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
                  </HStack>
                }
              />
            ))}
          </SettingsRows>
        ) : null}
      </SettingsSection>
    </AdminAccessBoundary>
  );
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isGlobalAdmin === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users]);
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusFilter>('all');
  const [accessFilter, setAccessFilter] = useState<AdminUserAccessFilter>('all');
  const visibleUsers = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        (user.name ?? '').toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && user.disabledAt === null) ||
        (statusFilter === 'disabled' && user.disabledAt !== null);
      const matchesAccess = accessFilter === 'all' || getUserAccessFilter(user) === accessFilter;

      return matchesSearch && matchesStatus && matchesAccess;
    });
  }, [accessFilter, statusFilter, userSearch, users]);

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

  if (meQuery.isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title="Users management" description="Global admin access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Global admin access is required to open this page.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  return (
    <Stack as="section" gap="0" h="full" minH="0">
      <Flex
        align={{ base: 'stretch', lg: 'center' }}
        justify="space-between"
        direction={{ base: 'column', lg: 'row' }}
        gap="3"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        bg="bg.workspace"
        px={{ base: '4', lg: '6' }}
        py="3"
      >
        <Text fontWeight="semibold" color="fg">
          Users
        </Text>

        <Flex
          align={{ base: 'stretch', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          justify={{ base: 'flex-start', lg: 'flex-end' }}
          gap="2"
          minW="0"
        >
          <Flex align={{ sm: 'center' }} direction={{ base: 'column', sm: 'row' }} gap="2" minW="0">
            <Input
              value={userSearch}
              placeholder="Search users"
              aria-label="Search users"
              maxW={{ base: 'full', sm: '18rem' }}
              onChange={(event) => setUserSearch(event.target.value)}
            />
            <Box w={{ base: 'full', sm: '11rem' }}>
              <SettingsDropdown
                ariaLabel="Filter users by status"
                options={userStatusFilterOptions}
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as AdminUserStatusFilter)}
              />
            </Box>
            <Box w={{ base: 'full', sm: '12rem' }}>
              <SettingsDropdown
                ariaLabel="Filter users by access"
                options={userAccessFilterOptions}
                value={accessFilter}
                onValueChange={(value) => setAccessFilter(value as AdminUserAccessFilter)}
              />
            </Box>
          </Flex>
        </Flex>
      </Flex>

      <Box flex="1" minH="0" overflowY="auto">
        <Flex
          display={{ base: 'none', md: visibleUsers.length > 0 ? 'grid' : 'none' }}
          gridTemplateColumns={ADMIN_USERS_GRID_COLUMNS}
          gap="3"
          position="sticky"
          top="0"
          zIndex="1"
          borderBottomWidth="1px"
          borderColor="border.subtle"
          bg="bg.workspace"
          px="6"
          py="var(--arkivra-listHeaderPaddingY, 0.75rem)"
          fontSize="sm"
          color="fg.muted"
        >
          <Text as="span">User</Text>
          <Text as="span">Access</Text>
          <Text as="span">Status</Text>
          <Text as="span">2FA</Text>
          <Text as="span">Email</Text>
          <Text as="span">Type</Text>
          <Text as="span">Joined</Text>
          <Text as="span" srOnly>Actions</Text>
        </Flex>

        {usersQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading users...</Text> : null}
        {!usersQuery.isLoading && visibleUsers.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.subtle" bg="bg.subtle" p="4" textStyle="sm" color="fg.muted">
            No users match the current filters.
          </Box>
        ) : null}
        {visibleUsers.length > 0 ? (
          <Stack gap="0">
            {visibleUsers.map(user => (
              <Grid
                key={user.id}
                as="article"
                alignItems="center"
                gap="3"
                h={{ base: 'auto', md: 'var(--arkivra-listRowHeight, 4.5rem)' }}
                minH={{ base: 'var(--arkivra-listRowHeight, 4.5rem)', md: undefined }}
                borderBottomWidth="1px"
                borderColor="border.subtle"
                bg="bg.workspace"
                px="6"
                py="var(--arkivra-rowPaddingY, 0.875rem)"
                templateColumns={{ base: 'minmax(0, 1fr) auto', md: ADMIN_USERS_GRID_COLUMNS }}
                transition="background-color 0.15s ease"
                _hover={{ bg: 'bg.workspaceMuted' }}
              >
                <Stack gap="1" minW="0">
                  <Text fontSize="md" fontWeight="semibold" color="fg" truncate>
                    {user.name ?? 'Unnamed user'}
                  </Text>
                  <Text truncate fontSize="sm" color="fg.muted">
                    {user.email}
                  </Text>
                </Stack>
                <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm" color="fg">
                  {getUserAccessLabel(user)}
                </Text>
                <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm" color={user.disabledAt ? 'fg.warning' : 'fg'}>
                  {user.disabledAt ? 'Disabled' : 'Active'}
                </Text>
                <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm" color={user.twoFactorEnabled ? 'fg' : 'fg.muted'}>
                  {user.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                </Text>
                <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm" color={user.emailVerified ? 'fg' : 'fg.warning'}>
                  {user.emailVerified ? 'Verified' : 'Unverified'}
                </Text>
                <Text display={{ base: 'none', md: 'block' }} truncate textStyle="sm" color="fg.muted">
                  {getAccountTypeLabel(user)}
                </Text>
                <Text display={{ base: 'none', md: 'block' }} textStyle="sm" color="fg.muted">
                  {formatDate(user.createdAt)}
                </Text>
                <Box justifySelf="end">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <ActionMenuTriggerButton label={`User actions for ${user.email}`} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" minWidth="12rem">
                      <DropdownMenuItem
                        disabled={updateUserMutation.isPending}
                        onSelect={() => updateUserMutation.mutate({ userId: user.id, disabled: user.disabledAt === null })}
                      >
                        <ActionMenuItemIcon icon={user.disabledAt ? UserCheck : Ban} tone={user.disabledAt ? 'default' : 'destructive'} />
                        {user.disabledAt ? 'Re-enable' : 'Disable'}
                      </DropdownMenuItem>
                      {user.isGlobalAdmin ? (
                        <DropdownMenuItem
                          disabled={revokeAdminMutation.isPending}
                          onSelect={() => revokeAdminMutation.mutate({ userId: user.id })}
                        >
                          <ActionMenuItemIcon icon={ShieldX} tone="destructive" />
                          Revoke admin
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={grantAdminMutation.isPending}
                          onSelect={() => grantAdminMutation.mutate({ userId: user.id })}
                        >
                          <ActionMenuItemIcon icon={ShieldCheck} />
                          Grant admin
                        </DropdownMenuItem>
                      )}
                      {user.canCreateVault && !user.isGlobalAdmin ? (
                        <DropdownMenuItem
                          disabled={revokeVaultCreatorMutation.isPending}
                          onSelect={() => revokeVaultCreatorMutation.mutate({ userId: user.id })}
                        >
                          <ActionMenuItemIcon icon={UserX} tone="destructive" />
                          Revoke vault creation
                        </DropdownMenuItem>
                      ) : null}
                      {!user.canCreateVault ? (
                        <DropdownMenuItem
                          disabled={grantVaultCreatorMutation.isPending}
                          onSelect={() => grantVaultCreatorMutation.mutate({ userId: user.id })}
                        >
                          <ActionMenuItemIcon icon={UserCheck} />
                          Grant vault creation
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Box>
              </Grid>
            ))}
          </Stack>
        ) : null}
      </Box>
    </Stack>
  );
}

export function AdminVaultsPage() {
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isGlobalAdmin === true;
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const vaults = vaultsQuery.data?.vaults ?? [];

  return (
    <AdminAccessBoundary
      title="Vault oversight"
      description="Inspect active vault ownership across the installation."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection title="Ownership ledger" description="Vault-specific settings and permissions remain inside each vault's settings page.">
        {vaultsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading vaults...</Text> : null}
        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.subtle" bg="bg.subtle" p="4" textStyle="sm" color="fg.muted">
            No active vaults found.
          </Box>
        ) : null}

        {vaults.length > 0 ? (
          <SettingsRows>
            {vaults.map(vault => (
              <SettingsRow
                key={vault.id}
                label={vault.name}
                description={`Owner: ${vault.ownerName ?? 'Unknown'}${vault.ownerEmail ? ` (${vault.ownerEmail})` : ''}`}
                meta={
                  <Stack gap="1" textAlign={{ base: 'left', lg: 'right' }}>
                    <Text textStyle="sm" color="fg.muted">{vault.id}</Text>
                    <Text textStyle="sm" color="fg.muted">Created {formatDate(vault.createdAt)}</Text>
                  </Stack>
                }
              />
            ))}
          </SettingsRows>
        ) : null}
      </SettingsSection>
    </AdminAccessBoundary>
  );
}

export function AdminAiSettingsPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isGlobalAdmin === true;
  const aiSettingsQuery = useAdminAiSettingsQuery({ enabled: isEnabled });
  const [aiDraftOverride, setAiDraftOverride] = useState<Partial<AdminAiSettings>>({});
  const savedAiSettings = aiSettingsQuery.data?.settings ?? emptyAiSettings;
  const aiDraft: AdminAiSettings = {
    ollamaHost: aiDraftOverride.ollamaHost ?? savedAiSettings.ollamaHost,
    model: aiDraftOverride.model ?? savedAiSettings.model,
  };
  const canSaveAiSettings = aiDraft.ollamaHost.trim().length > 0 && aiDraft.model.trim().length > 0;

  const aiSettingsMutation = useMutation({
    mutationFn: () => updateAdminAiSettings({
      ollamaHost: aiDraft.ollamaHost.trim(),
      model: aiDraft.model.trim(),
    }),
    onSuccess: async ({ settings }) => {
      toast.success('AI settings saved.');
      setAiDraftOverride(settings);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiSettings() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save AI settings.');
    },
  });

  return (
    <AdminAccessBoundary
      title="AI settings"
      description="Configure the Ollama host and default model used by instance-level AI services."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection
        title="Ollama defaults"
        description="These settings apply globally to the instance, not to a single user or vault."
        actions={
          <SaveButton
            type="submit"
            form="admin-ai-settings-form"
            size="sm"
            disabled={!canSaveAiSettings || aiSettingsMutation.isPending}
          >
            {aiSettingsMutation.isPending ? 'Saving...' : 'Save changes'}
          </SaveButton>
        }
      >
        {aiSettingsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading AI settings...</Text> : null}
        <chakra.form
          id="admin-ai-settings-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            aiSettingsMutation.mutate();
          }}
        >
          <Grid gap="4" templateColumns={{ base: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }}>
            <Field>
              <FieldLabel htmlFor="admin-ollama-host">Ollama host</FieldLabel>
              <Input
                id="admin-ollama-host"
                mt="2"
                type="url"
                value={aiDraft.ollamaHost}
                placeholder="http://127.0.0.1:11434"
                onChange={(event) => setAiDraftOverride((draft) => ({ ...draft, ollamaHost: event.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-ollama-model">Default model</FieldLabel>
              <Input
                id="admin-ollama-model"
                mt="2"
                value={aiDraft.model}
                placeholder="gemma4:e4b"
                onChange={(event) => setAiDraftOverride((draft) => ({ ...draft, model: event.target.value }))}
              />
            </Field>
          </Grid>
        </chakra.form>
      </SettingsSection>
    </AdminAccessBoundary>
  );
}

export const AdminPage = AdminOverviewPage;
