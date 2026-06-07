import { Box, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SaveButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster-store';
import { approvePermissionRequest, rejectPermissionRequest } from '@/features/admin/admin.api';
import { adminQueryKeys, useAdminBackupsQuery, useAdminUsersQuery, useAdminVaultsQuery, usePermissionRequestsQuery } from '@/features/admin/admin.queries';
import type { AdminVault, PermissionRequest } from '@/features/admin/admin.types';
import { formatDate } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';
import { KeyValueRows, SettingsRow, SettingsRows, SettingsSection } from '@/features/settings/components/settings-ui';
import { formatCount } from './admin-formatters';
import { AdminAccessBoundary } from './admin-shared';

function getPermissionRequestLabel(request: PermissionRequest) {
  if (request.type === 'vault.create') return 'Create vault';
  if (request.type === 'vault.delete') return 'Delete vault';
  if (request.type === 'vault.owner_promote') return 'Promote owner';
  if (request.type === 'vault.external_invite') return 'External invitation';
  return 'AI access';
}

function formatPermissionRequestRole(value: unknown) {
  if (value === 'owner') return 'Owner';
  if (value === 'editor') return 'Editor';
  if (value === 'viewer') return 'Viewer';
  return 'Member';
}

function formatPermissionRequestAiAccess(value: unknown) {
  if (value === 'full') return 'Enabled';
  return 'Disabled';
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

  if (request.type === 'vault.external_invite') {
    const email = typeof request.payload.email === 'string' ? request.payload.email : 'unknown email';
    const role = formatPermissionRequestRole(request.payload.role);
    const aiAccess = formatPermissionRequestAiAccess(request.payload.aiAccessLevel);
    return `Requested by ${request.requestedBy} for ${email}: ${role}, ${aiAccess}.`;
  }

  return `Requested by ${request.requestedBy} for ${request.targetUserId ?? 'unknown user'}: AI access enabled.`;
}

function getVaultOwnerLabel(vault: AdminVault) {
  return vault.ownerName?.trim() || vault.ownerEmail || 'Unassigned';
}

function VaultOwnershipTable({ vaults }: { vaults: AdminVault[] }) {
  return (
    <Box overflowX="auto">
      <chakra.table w="full" minW="42rem" borderCollapse="collapse">
        <chakra.thead>
          <chakra.tr borderBottomWidth="1px" borderColor="border.surface">
            {['Vault Name', 'Owner Account', 'Members', 'Created Date'].map((heading) => (
              <chakra.th
                key={heading}
                px="3"
                py="2"
                textAlign={heading === 'Members' ? 'right' : 'left'}
                fontSize="xs"
                fontWeight="semibold"
                color="fg.muted"
              >
                {heading}
              </chakra.th>
            ))}
          </chakra.tr>
        </chakra.thead>
        <chakra.tbody>
          {vaults.map((vault) => (
            <chakra.tr key={vault.id} borderBottomWidth="1px" borderColor="border.surface" _last={{ borderBottomWidth: '0' }}>
              <chakra.td px="3" py="2.5" fontSize="sm" fontWeight="medium" color="fg">
                {vault.name}
              </chakra.td>
              <chakra.td px="3" py="2.5">
                <Stack gap="0.5" minW="0">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    {getVaultOwnerLabel(vault)}
                  </Text>
                  {vault.ownerName && vault.ownerEmail ? (
                    <Text fontSize="xs" color="fg.muted">
                      {vault.ownerEmail}
                    </Text>
                  ) : null}
                </Stack>
              </chakra.td>
              <chakra.td px="3" py="2.5" textAlign="right" fontSize="sm" color="fg">
                {formatCount(vault.memberCount, 'member')}
              </chakra.td>
              <chakra.td px="3" py="2.5" fontSize="sm" color="fg.muted">
                {formatDate(vault.createdAt)}
              </chakra.td>
            </chakra.tr>
          ))}
        </chakra.tbody>
      </chakra.table>
    </Box>
  );
}

export function AdminOverviewPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
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
      <SettingsSection title="Instance overview" density="compact">
        <KeyValueRows
          density="compact"
          rows={[
            { label: 'Backups', value: backupsQuery.isLoading ? 'Loading...' : formatCount(backups.length, 'archive') },
            { label: 'Users', value: usersQuery.isLoading ? 'Loading...' : formatCount(users.length, 'account') },
            { label: 'Vaults', value: vaultsQuery.isLoading ? 'Loading...' : formatCount(vaults.length, 'vault') },
          ]}
        />
      </SettingsSection>

      <SettingsSection title="Vault ownership" density="compact">
        {vaultsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading vaults...</Text> : null}
        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="3" textStyle="sm" color="fg.muted">
            No active vaults found.
          </Box>
        ) : null}
        {vaults.length > 0 ? <VaultOwnershipTable vaults={vaults} /> : null}
      </SettingsSection>

      <SettingsSection title="Approval queue" density="compact">
        {permissionRequestsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading requests...</Text> : null}
        {!permissionRequestsQuery.isLoading && permissionRequests.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="3" textStyle="sm" color="fg.muted">
            No pending requests.
          </Box>
        ) : null}
        {permissionRequests.length > 0 ? (
          <SettingsRows density="compact">
            {permissionRequests.map((request) => (
              <SettingsRow
                density="compact"
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
