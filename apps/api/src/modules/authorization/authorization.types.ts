export const SYSTEM_ROLES = ['root', 'member'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const SYSTEM_CAPABILITIES = ['system.create_vaults'] as const;
export type SystemCapability = (typeof SYSTEM_CAPABILITIES)[number];

export const VAULT_ROLES = ['owner', 'editor', 'viewer'] as const;
export type VaultRole = (typeof VAULT_ROLES)[number];

export const AI_ACCESS_LEVELS = ['none', 'document_chat', 'full'] as const;
export type AiAccessLevel = (typeof AI_ACCESS_LEVELS)[number];

export const PERMISSION_REQUEST_TYPES = [
  'vault.create',
  'vault.delete',
  'vault.owner_promote',
  'vault.ai_escalation',
] as const;
export type PermissionRequestType = (typeof PERMISSION_REQUEST_TYPES)[number];

export const PERMISSION_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type PermissionRequestStatus = (typeof PERMISSION_REQUEST_STATUSES)[number];

export const EMAIL_INVITATION_TYPES = ['root_account', 'vault_member'] as const;
export type EmailInvitationType = (typeof EMAIL_INVITATION_TYPES)[number];

export const EMAIL_INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type EmailInvitationStatus = (typeof EMAIL_INVITATION_STATUSES)[number];

export type VaultAuthorizationState = {
  userId: string;
  vaultId: string;
  isRoot: boolean;
  role: VaultRole | null;
  aiAccessLevel: AiAccessLevel;
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

export function isAiAccessLevel(value: unknown): value is AiAccessLevel {
  return typeof value === 'string' && (AI_ACCESS_LEVELS as readonly string[]).includes(value);
}

export function isPermissionRequestType(value: unknown): value is PermissionRequestType {
  return typeof value === 'string' && (PERMISSION_REQUEST_TYPES as readonly string[]).includes(value);
}

export function isEmailInvitationType(value: unknown): value is EmailInvitationType {
  return typeof value === 'string' && (EMAIL_INVITATION_TYPES as readonly string[]).includes(value);
}

export function normalizeSystemCapabilities(capabilities: readonly SystemCapability[]) {
  return [...new Set(capabilities)];
}
