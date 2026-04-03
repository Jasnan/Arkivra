export const VAULT_ROLES = ['owner', 'admin', 'member'] as const;

export type VaultRole = (typeof VAULT_ROLES)[number];
