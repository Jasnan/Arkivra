import type { AiAccessLevel, VaultRole } from '@/features/vaults/vaults.types';

export function formatVaultRole(role: VaultRole | null | undefined, isAdmin = false) {
  if (role === 'owner') return 'Owner';
  if (role === 'editor') return 'Editor';
  if (role === 'viewer') return 'Viewer';
  return isAdmin ? 'Administrative Read-Only Access' : 'No membership';
}

export function formatAiAccess(level: AiAccessLevel | null | undefined) {
  if (level === 'full') return 'Enabled';
  return 'Disabled';
}
