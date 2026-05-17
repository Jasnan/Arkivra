import type { FormEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Box, Flex, Grid, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, ShieldCheck, ShieldX, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CreateButton,
  RestoreArchiveButton,
  SaveButton,
} from '@/components/ui/action-buttons';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  approvePermissionRequest,
  createBackup,
  createRootEmailInvitation,
  getBackupDownloadUrl,
  grantRoot,
  grantSystemCapability,
  rejectPermissionRequest,
  restoreBackup,
  revokeRoot,
  revokeSystemCapability,
  updateAdminAiSettings,
  updateAdminUser,
} from '@/features/admin/admin.api';
import {
  adminQueryKeys,
  useAdminAiSettingsQuery,
  useAdminBackupsQuery,
  useAdminUsersQuery,
  useAdminVaultsQuery,
  usePermissionRequestsQuery,
} from '@/features/admin/admin.queries';
import type { AdminAiSettings, AdminUser, PermissionRequest } from '@/features/admin/admin.types';
import type { AiAccessLevel, VaultRole } from '@/features/vaults/vaults.types';
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
type AdminUserAccessFilter = 'all' | 'root' | 'create-vaults' | 'member';
type InviteSystemRole = 'root' | 'member';

const ADMIN_USERS_GRID_COLUMNS = 'minmax(0, 1.45fr) 8.5rem 8rem 7rem 8rem 8rem 8.5rem 2.75rem';

const userStatusFilterOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
];

const userAccessFilterOptions = [
  { value: 'all', label: 'All access' },
  { value: 'root', label: 'Roots' },
  { value: 'create-vaults', label: 'Can create vaults' },
  { value: 'member', label: 'Members' },
];

const inviteSystemRoleOptions: Array<{ value: InviteSystemRole; label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'root', label: 'Root' },
];

const inviteVaultRoleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const inviteAiAccessOptions: Array<{ value: AiAccessLevel; label: string }> = [
  { value: 'none', label: 'No AI access' },
  { value: 'document_chat', label: 'Document chat' },
  { value: 'full', label: 'Full AI access' },
];

function formatCount(value: number | undefined, singular: string, plural = `${singular}s`) {
  const safeValue = value ?? 0;
  return `${safeValue} ${safeValue === 1 ? singular : plural}`;
}

function getUserAccessLabel(user: AdminUser) {
  if (user.isRoot) return 'Root';
  if (user.systemCapabilities.includes('system.create_vaults')) return 'Can create vaults';
  return 'Member';
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
  if (user.isRoot) return 'root';
  if (user.systemCapabilities.includes('system.create_vaults')) return 'create-vaults';
  return 'member';
}

function getPermissionRequestLabel(request: PermissionRequest) {
  if (request.type === 'vault.create') return 'Create vault';
  if (request.type === 'vault.delete') return 'Delete vault';
  if (request.type === 'vault.owner_promote') return 'Promote owner';
  return 'AI access escalation';
}

function getPermissionRequestDescription(request: PermissionRequest) {
  if (request.type === 'vault.create') {
    const name = typeof request.payload.name === 'string' ? request.payload.name : 'Untitled vault';
    return `Requested by ${request.requestedBy} for "${name}".`;
  }

  if (request.type === 'vault.delete') {
    return `Requested by ${request.requestedBy} for vault ${request.vaultId ?? 'unknown'}.`;
  }

  if (request.type === 'vault.owner_promote') {
    return `Requested by ${request.requestedBy} for ${request.targetUserId ?? 'unknown user'}.`;
  }

  const aiAccessLevel = typeof request.payload.aiAccessLevel === 'string' ? request.payload.aiAccessLevel : 'AI access';
  return `Requested by ${request.requestedBy} for ${request.targetUserId ?? 'unknown user'}: ${aiAccessLevel}.`;
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
    return <Text textStyle="sm">Loading root context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title={title ?? accessTitle} description="Root access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Root access is required to open this page.
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
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isRoot === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const backupsQuery = useAdminBackupsQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const permissionRequestsQuery = usePermissionRequestsQuery({ enabled: isEnabled });
  const backups = backupsQuery.data?.backups ?? [];
  const users = usersQuery.data?.users ?? [];
  const vaults = vaultsQuery.data?.vaults ?? [];
  const permissionRequests = permissionRequestsQuery.data?.requests ?? [];

  const approveRequestMutation = useMutation({
    mutationFn: approvePermissionRequest,
    onSuccess: async () => {
      toast.success('Request approved.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.permissionRequests('pending') }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.vaults() }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not approve request.');
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: ({ requestId }: { requestId: string }) => rejectPermissionRequest({ requestId }),
    onSuccess: async () => {
      toast.success('Request rejected.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.permissionRequests('pending') });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not reject request.');
    },
  });

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

      <SettingsSection title="Approval queue" description="Pending authorization requests requiring root review.">
        {permissionRequestsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading requests...</Text> : null}
        {!permissionRequestsQuery.isLoading && permissionRequests.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.subtle" bg="bg.subtle" p="4" textStyle="sm" color="fg.muted">
            No pending requests.
          </Box>
        ) : null}
        {permissionRequests.length > 0 ? (
          <SettingsRows>
            {permissionRequests.map((request) => (
              <SettingsRow
                key={request.id}
                label={getPermissionRequestLabel(request)}
                description={getPermissionRequestDescription(request)}
                meta={
                  <HStack gap="2" justify={{ base: 'flex-start', lg: 'flex-end' }} flexWrap="wrap">
                    <SaveButton
                      type="button"
                      size="sm"
                      disabled={approveRequestMutation.isPending || rejectRequestMutation.isPending}
                      onClick={() => approveRequestMutation.mutate({ requestId: request.id })}
                    >
                      Approve
                    </SaveButton>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={approveRequestMutation.isPending || rejectRequestMutation.isPending}
                      onClick={() => rejectRequestMutation.mutate({ requestId: request.id })}
                    >
                      Reject
                    </Button>
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

export function AdminBackupsPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isRoot === true;
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
  const isEnabled = meQuery.data?.isRoot === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users]);
  const vaults = useMemo(() => vaultsQuery.data?.vaults ?? [], [vaultsQuery.data?.vaults]);
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusFilter>('all');
  const [accessFilter, setAccessFilter] = useState<AdminUserAccessFilter>('all');
  const [rootInviteEmail, setRootInviteEmail] = useState('');
  const [inviteSystemRole, setInviteSystemRole] = useState<InviteSystemRole>('member');
  const [inviteCanCreateVaults, setInviteCanCreateVaults] = useState(false);
  const [inviteVaultId, setInviteVaultId] = useState('');
  const [inviteVaultRole, setInviteVaultRole] = useState<VaultRole>('viewer');
  const [inviteAiAccessLevel, setInviteAiAccessLevel] = useState<AiAccessLevel>('none');
  const [createdInvitationToken, setCreatedInvitationToken] = useState<string | null>(null);
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

  const grantRootMutation = useMutation({
    mutationFn: grantRoot,
    onSuccess: async () => {
      toast.success('Root role granted.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not grant root role.');
    },
  });

  const revokeRootMutation = useMutation({
    mutationFn: revokeRoot,
    onSuccess: async () => {
      toast.success('Root role revoked.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not revoke root role.');
    },
  });

  const grantCreateVaultsMutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      grantSystemCapability({ userId, capability: 'system.create_vaults' }),
    onSuccess: async () => {
      toast.success('Vault creation granted.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not grant vault creation.');
    },
  });

  const revokeCreateVaultsMutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) =>
      revokeSystemCapability({ userId, capability: 'system.create_vaults' }),
    onSuccess: async () => {
      toast.success('Vault creation revoked.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not revoke vault creation.');
    },
  });

  const createRootInvitationMutation = useMutation({
    mutationFn: createRootEmailInvitation,
    onSuccess: ({ invitation }) => {
      toast.success(`Invitation created for ${invitation.email}.`);
      setCreatedInvitationToken(invitation.id);
      setRootInviteEmail('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create root invitation.');
    },
  });

  if (meQuery.isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title="Users management" description="Root access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Root access is required to open this page.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  return (
    <Stack as="section" gap="0" h="full" minH="0">
      <Box borderBottomWidth="1px" borderColor="border.subtle" bg="bg.workspace" px={{ base: '4', lg: '6' }} py="4">
        <chakra.form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const email = rootInviteEmail.trim();
            if (!email) {
              toast.error('Email is required.');
              return;
            }
            createRootInvitationMutation.mutate({
              email,
              systemRole: inviteSystemRole,
              systemCapabilities: inviteCanCreateVaults ? ['system.create_vaults'] : [],
              vaultMemberships: inviteVaultId
                ? [{
                    vaultId: inviteVaultId,
                    role: inviteVaultRole,
                    aiAccessLevel: inviteAiAccessLevel,
                  }]
                : [],
            });
          }}
        >
          <Stack gap="3">
            <Flex align={{ base: 'stretch', xl: 'end' }} direction={{ base: 'column', xl: 'row' }} gap="3">
            <Field>
              <FieldLabel htmlFor="admin-root-invite-email">Invite user</FieldLabel>
              <Input
                id="admin-root-invite-email"
                type="email"
                value={rootInviteEmail}
                placeholder="person@example.com"
                onChange={(event) => setRootInviteEmail(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>System role</FieldLabel>
              <Select value={inviteSystemRole} onValueChange={(value) => setInviteSystemRole(value as InviteSystemRole)}>
                <SelectTrigger aria-label="System role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {inviteSystemRoleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Checkbox
              checked={inviteCanCreateVaults}
              onCheckedChange={setInviteCanCreateVaults}
              alignSelf={{ base: 'flex-start', xl: 'center' }}
            >
              Can create vaults
            </Checkbox>
            <CreateButton type="submit" size="sm" disabled={createRootInvitationMutation.isPending}>
              {createRootInvitationMutation.isPending ? 'Creating...' : 'Create invitation'}
            </CreateButton>
            </Flex>
            <Grid gap="3" templateColumns={{ base: '1fr', lg: 'minmax(0, 1.2fr) 11rem 13rem' }}>
              <Field>
                <FieldLabel>Initial vault membership</FieldLabel>
                <Select value={inviteVaultId || '__none__'} onValueChange={(value) => setInviteVaultId(value === '__none__' ? '' : value)}>
                  <SelectTrigger aria-label="Initial vault membership">
                    <SelectValue placeholder="No vault pre-seed" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No vault pre-seed</SelectItem>
                    {vaults.map((vault) => (
                      <SelectItem key={vault.id} value={vault.id}>{vault.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Vault role</FieldLabel>
                <Select value={inviteVaultRole} onValueChange={(value) => setInviteVaultRole(value as VaultRole)} disabled={!inviteVaultId}>
                  <SelectTrigger aria-label="Initial vault role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inviteVaultRoleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>AI access</FieldLabel>
                <Select value={inviteAiAccessLevel} onValueChange={(value) => setInviteAiAccessLevel(value as AiAccessLevel)} disabled={!inviteVaultId}>
                  <SelectTrigger aria-label="Initial AI access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inviteAiAccessOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Grid>
            {createdInvitationToken ? (
              <Text fontSize="sm" color="fg.muted">
                Invitation token: <Text as="span" fontFamily="mono" color="fg">{createdInvitationToken}</Text>
              </Text>
            ) : null}
          </Stack>
        </chakra.form>
      </Box>
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
                      {user.isRoot ? (
                        <DropdownMenuItem
                          disabled={revokeRootMutation.isPending}
                          onSelect={() => revokeRootMutation.mutate({ userId: user.id })}
                        >
                          <ActionMenuItemIcon icon={ShieldX} tone="destructive" />
                          Revoke root
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={grantRootMutation.isPending}
                          onSelect={() => grantRootMutation.mutate({ userId: user.id })}
                        >
                          <ActionMenuItemIcon icon={ShieldCheck} />
                          Grant root
                        </DropdownMenuItem>
                      )}
                      {user.systemCapabilities.includes('system.create_vaults') ? (
                        <DropdownMenuItem
                          disabled={revokeCreateVaultsMutation.isPending}
                          onSelect={() => revokeCreateVaultsMutation.mutate({ userId: user.id })}
                        >
                          <ActionMenuItemIcon icon={UserX} tone="destructive" />
                          Revoke vault creation
                        </DropdownMenuItem>
                      ) : null}
                      {!user.canCreateVault ? (
                        <DropdownMenuItem
                          disabled={grantCreateVaultsMutation.isPending}
                          onSelect={() => grantCreateVaultsMutation.mutate({ userId: user.id })}
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
  const isEnabled = meQuery.data?.isRoot === true;
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const vaults = vaultsQuery.data?.vaults ?? [];

  return (
    <AdminAccessBoundary
      title="Vault oversight"
      description="Inspect active vault ownership across the installation."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection title="Ownership ledger" description="Vault-specific access remains inside each vault's settings page.">
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
  const isEnabled = meQuery.data?.isRoot === true;
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
