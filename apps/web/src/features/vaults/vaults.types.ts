export const VAULT_ROLES = ['owner', 'editor', 'viewer'] as const;
export type VaultRole = (typeof VAULT_ROLES)[number];

export const AI_ACCESS_LEVELS = ['none', 'document_chat', 'full'] as const;
export type AiAccessLevel = (typeof AI_ACCESS_LEVELS)[number];

export const PERMISSION_REQUEST_TYPES = [
  'vault.create',
  'vault.delete',
  'vault.owner_promote',
  'vault.ai_escalation',
  'vault.email_invitation',
] as const;
export type PermissionRequestType = (typeof PERMISSION_REQUEST_TYPES)[number];

export type PermissionRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface PermissionRequest {
  id: string;
  type: PermissionRequestType;
  status: PermissionRequestStatus;
  requestedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  vaultId: string | null;
  targetUserId: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type EmailInvitationType = 'admin_account' | 'vault_member';
export type EmailInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface EmailInvitation {
  id: string;
  type: EmailInvitationType;
  status: EmailInvitationStatus;
  email: string;
  invitedBy: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  vaultId: string | null;
  vaultMemberId: string | null;
  vaultRole: VaultRole | null;
  aiAccessLevel: AiAccessLevel;
  systemRole: 'admin' | 'member' | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface VaultSummary {
  id: string;
  name: string;
  description: string | null;
  fileCount: number;
  totalSize: number;
  createdAt: string;
  updatedAt?: string;
  role: VaultRole | null;
  aiAccessLevel: AiAccessLevel;
  isAdmin: boolean;
  isMember: boolean;
  accessMode: 'member' | 'admin';
}

export interface VaultDetail {
  id: string;
  name: string;
  description: string | null;
  fileCount?: number;
  totalSize?: number;
  createdAt?: string;
  role: VaultRole | null;
  aiAccessLevel: AiAccessLevel;
  isAdmin: boolean;
  isMember: boolean;
  accessMode: 'member' | 'admin';
}

export interface VaultMember {
  userId: string;
  role: VaultRole;
  email: string;
  name: string | null;
  aiAccessLevel: AiAccessLevel;
}

export interface VaultPendingInvitation {
  id: string;
  source: 'email_invitation' | 'permission_request';
  status: 'pending' | 'approval_pending';
  email: string;
  role: VaultRole;
  aiAccessLevel: AiAccessLevel;
  requestedBy: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
