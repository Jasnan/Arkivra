import { Box, Flex, Grid, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DatabaseBackup,
  Users,
  Vault,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageIntro, StatCard, SurfacePanel } from '@/components/layout/vault-ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CreateButton,
  RestoreArchiveButton,
} from '@/components/ui/action-buttons';
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
import {
  adminQueryKeys,
  useAdminBackupsQuery,
  useAdminUsersQuery,
  useAdminVaultsQuery,
} from '@/features/admin/admin.queries';
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
        description="Manage backups, user access, and installation-wide vault oversight from a single governance surface."
      />

      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}>
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
      </Grid>

      <Stack gap="6">
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
