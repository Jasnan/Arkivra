export const SYSTEM_ROLES = ['admin', 'member'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const SYSTEM_CAPABILITIES = ['system.create_vaults', 'system.use_ai'] as const;
export type SystemCapability = (typeof SYSTEM_CAPABILITIES)[number];

export const VAULT_ROLES = ['owner', 'editor', 'viewer'] as const;
export type VaultRole = (typeof VAULT_ROLES)[number];

export const PERMISSION_REQUEST_TYPES = [
  'vault.create',
  'vault.delete',
  'vault.owner_promote',
  'vault.external_invite',
] as const;
export type PermissionRequestType = (typeof PERMISSION_REQUEST_TYPES)[number];

export const PERMISSION_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type PermissionRequestStatus = (typeof PERMISSION_REQUEST_STATUSES)[number];

export const EMAIL_INVITATION_TYPES = ['platform_account', 'vault_member'] as const;
export type EmailInvitationType = (typeof EMAIL_INVITATION_TYPES)[number];

export const EMAIL_INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type EmailInvitationStatus = (typeof EMAIL_INVITATION_STATUSES)[number];

export type VaultAuthorizationState = {
  userId: string;
  vaultId: string;
  isAdmin: boolean;
  role: VaultRole | null;
  isMember: boolean;
};

export function isSystemRole(value: unknown): value is SystemRole {
  return typeof value === 'string' && (SYSTEM_ROLES as readonly string[]).includes(value);
}

export function isSystemCapability(value: unknown): value is SystemCapability {
  return typeof value === 'string' && (SYSTEM_CAPABILITIES as readonly string[]).includes(value);
}

export function isVaultRole(value: unknown): value is VaultRole {
  return typeof value === 'string' && (VAULT_ROLES as readonly string[]).includes(value);
}

export function isEmailInvitationType(value: unknown): value is EmailInvitationType {
  return typeof value === 'string' && (EMAIL_INVITATION_TYPES as readonly string[]).includes(value);
}
