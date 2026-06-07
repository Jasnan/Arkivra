import type { VaultDetail } from './vaults.types';

export function canMutateVaultDocuments(vault: VaultDetail | null | undefined) {
  return Boolean(vault?.role === 'owner' || vault?.role === 'editor');
}

export function canReadVault(vault: VaultDetail | null | undefined) {
  return Boolean(vault?.role === 'owner' || vault?.role === 'editor' || vault?.role === 'viewer');
}

export function canManageVaultWorkspace(vault: VaultDetail | null | undefined) {
  return Boolean(vault?.role === 'owner' || vault?.isAdmin || vault?.accessMode === 'admin');
}

export function canUseVaultChat(vault: VaultDetail | null | undefined) {
  return Boolean(vault?.aiAccessLevel === 'full');
}
