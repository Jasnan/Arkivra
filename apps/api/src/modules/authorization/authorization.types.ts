export const GLOBAL_ROLES = ['global_admin'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

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

export type VaultMemberPermission = (typeof VAULT_MEMBER_PERMISSIONS)[number];

export const DEFAULT_MEMBER_PERMISSIONS: readonly VaultMemberPermission[] = [
  'documents.read',
  'documents.create',
  'documents.update',
  'documents.delete',
  'documents.download',
  'tags.manage',
];

export function isVaultMemberPermission(value: unknown): value is VaultMemberPermission {
  return (
    typeof value === 'string' && (VAULT_MEMBER_PERMISSIONS as readonly string[]).includes(value)
  );
}

export function normalizeVaultMemberPermissions(permissions: readonly VaultMemberPermission[]) {
  return [...new Set(permissions)];
}
