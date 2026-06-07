import { useQuery } from '@tanstack/react-query';
import { getVault, listVaultMembers, listVaultPendingInvitations, listVaults } from './vaults.api';

export const vaultQueryKeys = {
  all: ['vaults'] as const,
  list: () => [...vaultQueryKeys.all, 'list'] as const,
  detail: (vaultId: string) => [...vaultQueryKeys.all, 'detail', vaultId] as const,
  members: (vaultId: string) => [...vaultQueryKeys.all, 'members', vaultId] as const,
  invitations: (vaultId: string) => [...vaultQueryKeys.all, 'invitations', vaultId] as const,
};

export function useVaultsQuery() {
  return useQuery({
    queryKey: vaultQueryKeys.list(),
    queryFn: listVaults,
  });
}

export function useVaultQuery({ vaultId }: { vaultId: string }) {
  return useQuery({
    queryKey: vaultQueryKeys.detail(vaultId),
    queryFn: () => getVault({ vaultId }),
    enabled: vaultId.length > 0,
  });
}

export function useVaultMembersQuery({ vaultId }: { vaultId: string }) {
  return useQuery({
    queryKey: vaultQueryKeys.members(vaultId),
    queryFn: () => listVaultMembers({ vaultId }),
    enabled: vaultId.length > 0,
  });
}

export function useVaultPendingInvitationsQuery({ vaultId }: { vaultId: string }) {
  return useQuery({
    queryKey: vaultQueryKeys.invitations(vaultId),
    queryFn: () => listVaultPendingInvitations({ vaultId }),
    enabled: vaultId.length > 0,
  });
}
