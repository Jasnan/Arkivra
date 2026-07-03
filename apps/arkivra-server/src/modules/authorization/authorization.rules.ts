import type {
  SystemCapability,
  SystemRole,
  VaultRole,
} from './authorization.types.js';

export const CREATE_VAULTS_CAPABILITY = 'system.create_vaults' satisfies SystemCapability;
export const USE_AI_CAPABILITY = 'system.use_ai' satisfies SystemCapability;

export function isAdminRole(role: SystemRole) {
  return role === 'admin';
}

export function canVaultRoleRead(role: VaultRole | null) {
  return role === 'owner' || role === 'editor' || role === 'viewer';
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getInvitationSystemCapabilities(payload: Record<string, unknown>) {
  const value = payload.systemCapabilities;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (capability): capability is SystemCapability =>
      capability === CREATE_VAULTS_CAPABILITY || capability === USE_AI_CAPABILITY,
  );
}
