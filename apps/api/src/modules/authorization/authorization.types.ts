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

export function normalizeSystemCapabilities(capabilities: readonly SystemCapability[]) {
  return [...new Set(capabilities)];
}

/**
 * Deprecated compatibility for routes that Phase 2 will rename to semantic authorization middleware.
 * These values are no longer persisted and must not be used for new authorization decisions.
 */
export const VAULT_MEMBER_PERMISSIONS = [
  'documents.read',
  'documents.create',
  'documents.update',
  'documents.delete',
  'documents.download',
  'tags.manage',
  'members.invite',
  'members.manage',
] as const;

/** @deprecated Use VaultRole and semantic authorization helpers instead. */
export type VaultMemberPermission = (typeof VAULT_MEMBER_PERMISSIONS)[number];

/** @deprecated Default editor/viewer roles instead of permission arrays. */
export const DEFAULT_MEMBER_PERMISSIONS: readonly VaultMemberPermission[] = [
  'documents.read',
  'documents.create',
  'documents.update',
  'documents.delete',
  'documents.download',
  'tags.manage',
];

/** @deprecated Only used by legacy route payload parsing until Phase 2. */
export function isVaultMemberPermission(value: unknown): value is VaultMemberPermission {
  return (
    typeof value === 'string' && (VAULT_MEMBER_PERMISSIONS as readonly string[]).includes(value)
  );
}

/** @deprecated Only used by legacy route payload parsing until Phase 2. */
export function normalizeVaultMemberPermissions(permissions: readonly VaultMemberPermission[]) {
  return [...new Set(permissions)];
}
