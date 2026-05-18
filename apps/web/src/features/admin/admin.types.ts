export interface BackupListItem {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  systemRole: 'root' | 'member';
  systemCapabilities: SystemCapability[];
  isRoot: boolean;
  canCreateVault: boolean;
  authMethods?: {
    hasPassword: boolean;
    oauthProviders: string[];
    primaryOAuthProvider: string | null;
  };
}

export type SystemCapability = 'system.create_vaults';

export type PermissionRequestType =
  | 'vault.create'
  | 'vault.delete'
  | 'vault.owner_promote'
  | 'vault.ai_escalation';

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

export interface EmailInvitation {
  id: string;
  type: 'root_account' | 'vault_member';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  email: string;
  invitedBy: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  vaultId: string | null;
  vaultMemberId: string | null;
  vaultRole: 'owner' | 'editor' | 'viewer' | null;
  aiAccessLevel: 'none' | 'document_chat' | 'full';
  systemRole: 'root' | 'member' | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AdminVault {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  memberCount: number;
}

export interface AdminAiSettings {
  ollamaHost: string;
  model: string;
}

export interface AdminAiModel {
  name: string;
  size: number | null;
  modifiedAt: string | null;
}

export interface AdminAiAvailability {
  host: string;
  model: string;
  reachable: boolean;
  modelAvailable: boolean;
  models: AdminAiModel[];
  error: string | null;
}
