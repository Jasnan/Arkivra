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

export interface VaultSummary {
  id: string;
  name: string;
  role: 'owner' | 'member' | null;
}

export interface VaultDetail {
  id: string;
  name: string;
  role: 'owner' | 'member' | null;
  permissions: VaultMemberPermission[];
  isGlobalAdmin: boolean;
}

export interface VaultMember {
  userId: string;
  role: 'owner' | 'member';
  email: string;
  name: string | null;
  permissions: VaultMemberPermission[];
}
