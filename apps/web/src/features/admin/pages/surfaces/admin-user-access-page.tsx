import { Box, Flex, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useParams } from '@tanstack/react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAdminUsersQuery, useAdminVaultsQuery } from '@/features/admin/admin.queries';
import { useMeQuery } from '@/features/me/me.queries';
import { KeyValueRows, SettingsPageFrame, SettingsSection } from '@/features/settings/components/settings-ui';
import { formatCount, getUserRoleLabel } from './admin-formatters';

export function AdminUserAccessPage() {
  const params = useParams({ strict: false }) as { userId?: string };
  const userId = params.userId ?? '';
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const users = usersQuery.data?.users ?? [];
  const vaults = vaultsQuery.data?.vaults ?? [];
  const user = users.find((candidate) => candidate.id === userId);

  if (meQuery.isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title="User access" description="Admin access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Admin access is required to manage user access.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  if (usersQuery.isLoading || vaultsQuery.isLoading) {
    return <Text textStyle="sm" color="fg.muted">Loading access profile...</Text>;
  }

  if (!user) {
    return (
      <SettingsPageFrame
        title="Pending access profile"
        description="This invite has not resolved to an active user account yet."
      >
        <SettingsSection title="Access management" description="Detailed permissions become available after the user accepts the invitation.">
          <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="4">
            <Stack gap="2">
              <Text textStyle="sm" fontWeight="medium" color="fg">
                Invite pending
              </Text>
              <Text textStyle="sm" color="fg.muted">
                Keep the invite flow quick. Vault matrices, AI feature permissions, audit visibility, and granular overrides live here once an account exists.
              </Text>
            </Stack>
          </Box>
        </SettingsSection>
      </SettingsPageFrame>
    );
  }

  return (
    <SettingsPageFrame
      title="User access"
      description="Manage long-term permissions, vault access, AI features, and audit visibility outside the invite flow."
    >
      <SettingsSection
        title={user.email}
        description="Use this workspace for access changes after the user has joined Arkivra."
        actions={<Badge variant="secondary">{getUserRoleLabel(user)}</Badge>}
      >
        <HStack gap="2" flexWrap="wrap">
          {['Overview', 'Access', 'Security', 'Activity'].map((tab) => (
            <Badge
              key={tab}
              variant={tab === 'Access' ? 'default' : 'secondary'}
              bg={tab === 'Access' ? 'teal.subtle' : 'bg.subtle'}
              color={tab === 'Access' ? 'teal.fg' : 'fg.muted'}
              rounded="full"
              px="3"
              py="1"
            >
              {tab}
            </Badge>
          ))}
        </HStack>

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap="4">
          <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="4">
            <Stack gap="3">
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                System permissions
              </Text>
              <KeyValueRows
                rows={[
                  { label: 'Role', value: getUserRoleLabel(user) },
                  { label: 'Create vaults', value: user.canCreateVault ? 'Allowed' : 'Not allowed' },
                  { label: 'Status', value: user.disabledAt ? 'Disabled' : 'Active' },
                ]}
              />
            </Stack>
          </Box>

          <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="4">
            <Stack gap="3">
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                Access expansion
              </Text>
              <Text textStyle="sm" color="fg.muted">
                Vault permission matrices, AI feature permissions, granular overrides, and audit events belong in this dedicated management surface.
              </Text>
            </Stack>
          </Box>
        </SimpleGrid>

        <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" p="4">
          <Stack gap="3">
            <HStack justify="space-between" gap="3" align="start">
              <Stack gap="1">
                <Text textStyle="sm" fontWeight="semibold" color="fg">
                  Vault permissions
                </Text>
                <Text textStyle="sm" color="fg.muted">
                  Dedicated matrix for current and future vault-level access controls.
                </Text>
              </Stack>
              <Badge variant="secondary">{formatCount(vaults.length, 'vault')}</Badge>
            </HStack>

            {vaults.length > 0 ? (
              <Stack gap="0" divideY="1px" divideColor="border.surface">
                {vaults.slice(0, 4).map((vault) => (
                  <Flex key={vault.id} align="center" justify="space-between" gap="4" py="3">
                    <Text textStyle="sm" fontWeight="medium" color="fg">
                      {vault.name}
                    </Text>
                    <Text textStyle="sm" color="fg.muted">
                      Configure role, AI features, and overrides
                    </Text>
                  </Flex>
                ))}
              </Stack>
            ) : (
              <Text textStyle="sm" color="fg.muted">
                No vaults are available yet.
              </Text>
            )}
          </Stack>
        </Box>
      </SettingsSection>
    </SettingsPageFrame>
  );
}
