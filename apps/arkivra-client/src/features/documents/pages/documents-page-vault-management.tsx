/* eslint-disable react-refresh/only-export-components */
import { Box, Tabs as ChakraTabs } from '@chakra-ui/react';
import { History, Settings2, Users } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { CenteredEmptyState } from '@/components/ui/empty-state';
import { VaultActivityPanel } from '@/features/audit/components/vault-activity-panel';
import { VaultMembersPanel } from '@/features/vaults/components/vault-members-panel';
import { canManageVaultWorkspace } from '@/features/vaults/vault-permissions';
import { VaultSettingsPanel } from '@/features/vaults/components/vault-settings-panel';
import type { VaultDetail } from '@/features/vaults/vaults.types';

export type VaultSection = 'contents' | 'members' | 'activity' | 'settings';
export type VaultManagementSection = Exclude<VaultSection, 'contents'>;

const vaultManagementTabs: Array<{
  value: VaultManagementSection;
  label: string;
  icon: typeof Users | typeof Settings2 | typeof History;
}> = [
  { value: 'members', label: 'Members', icon: Users },
  { value: 'settings', label: 'Settings', icon: Settings2 },
  { value: 'activity', label: 'Activity', icon: History },
];

function canViewVaultManagementSection(vault: VaultDetail, section: VaultManagementSection) {
  return section === 'activity' || canManageVaultWorkspace(vault);
}

export function getVaultManagementRoute(vaultId: string, section: VaultManagementSection) {
  if (section === 'members') return ROUTES.vaultMembers(vaultId);
  if (section === 'activity') return ROUTES.vaultActivity(vaultId);
  return ROUTES.vaultSettings(vaultId);
}

export function VaultManagementTabs({
  vault,
  vaultId,
  section,
  onSectionChange,
}: {
  vault: VaultDetail;
  vaultId: string;
  section: VaultManagementSection;
  onSectionChange: (section: VaultManagementSection) => void;
}) {
  const visibleTabs = vaultManagementTabs.filter((tab) =>
    canViewVaultManagementSection(vault, tab.value),
  );
  const canViewSection = canViewVaultManagementSection(vault, section);

  return (
    <ChakraTabs.Root
      value={section}
      onValueChange={(event) => {
        if (
          (event.value === 'members' || event.value === 'settings' || event.value === 'activity') &&
          canViewVaultManagementSection(vault, event.value)
        ) {
          onSectionChange(event.value);
        }
      }}
      lazyMount
      unmountOnExit
      display="flex"
      flexDirection="column"
      flex="1"
      minH="0"
      gap="0"
    >
      <ChakraTabs.List
        w="full"
        flexShrink={0}
        borderBottomWidth="1px"
        borderColor="border.surface"
        gap="8"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <ChakraTabs.Trigger
              key={tab.value}
              value={tab.value}
              position="relative"
              gap="2"
              borderBottomWidth="2px"
              borderColor="transparent"
              rounded="0"
              px="0"
              py="3"
              fontSize="sm"
              fontWeight="semibold"
              color="fg.muted"
              _selected={{ color: 'teal.fg', borderColor: 'teal.solid' }}
            >
              <Icon size={15} />
              {tab.label}
            </ChakraTabs.Trigger>
          );
        })}
      </ChakraTabs.List>

      {canViewSection ? (
        <>
          {canViewVaultManagementSection(vault, 'members') ? (
            <ChakraTabs.Content value="members" flex="1" minH="0" pt="8">
              <VaultMembersPanel vault={vault} vaultId={vaultId} />
            </ChakraTabs.Content>
          ) : null}

          {canViewVaultManagementSection(vault, 'settings') ? (
            <ChakraTabs.Content value="settings" flex="1" minH="0" pt="8">
              <VaultSettingsPanel vaultId={vaultId} />
            </ChakraTabs.Content>
          ) : null}

          <ChakraTabs.Content value="activity" flex="1" minH="0" pt="8">
            <VaultActivityPanel vaultId={vaultId} />
          </ChakraTabs.Content>
        </>
      ) : (
        <Box pt="8">
          <CenteredEmptyState
            title="Vault management is restricted"
            description="Only vault owners and admins can view members and settings."
          />
        </Box>
      )}
    </ChakraTabs.Root>
  );
}
