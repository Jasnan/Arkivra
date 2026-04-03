import type { VaultMemberPermission } from '../authorization/authorization.types.js';

export const VAULT_ROLES = ['owner', 'member'] as const;

export type VaultRole = (typeof VAULT_ROLES)[number];

export type VaultAccess = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  role: VaultRole | null;
  permissions: VaultMemberPermission[];
  isGlobalAdmin: boolean;
};
