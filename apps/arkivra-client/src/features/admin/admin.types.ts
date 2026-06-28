export interface BackupListItem {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  format: 'legacy_tar_gz' | 'encrypted_multipart';
  partCount: number;
  restorable: boolean;
  corruptReason: string | null;
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
  systemRole: 'admin' | 'member';
  systemCapabilities: SystemCapability[];
  isAdmin: boolean;
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
  | 'vault.ai_access_grant'
  | 'vault.external_invite';

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
  type: 'admin_account' | 'vault_member';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  email: string;
  invitedBy: string | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  vaultId: string | null;
  vaultMemberId: string | null;
  vaultRole: 'owner' | 'editor' | 'viewer' | null;
  aiAccessLevel: 'none' | 'full';
  systemRole: 'admin' | 'member' | null;
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

export type AdminAiProviderKind = 'ollama' | 'gemini';
export type AdminAiModelCapability = 'chat' | 'vision' | 'embedding';

export interface AdminAiProviderModelOption {
  provider: AdminAiProviderKind;
  model: string;
  label?: string;
  capabilities: AdminAiModelCapability[];
  embeddingDimensions?: number;
}

export interface AdminAiProviderSettings {
  provider: AdminAiProviderKind;
  baseUrl: string;
  apiKeySecretRef: string | null;
  model: string;
}

export interface AdminAiEmbeddingProviderSettings {
  provider: AdminAiProviderKind | null;
  baseUrl: string;
  apiKeySecretRef: string | null;
  model: string | null;
  dimensions: number | null;
}

export interface AdminAiChatProviderSettings extends AdminAiProviderSettings {
  allowedModels?: string[];
}

export interface AdminAiSettings {
  aiFeaturesEnabled: boolean;
  chat: AdminAiChatProviderSettings;
  translation: AdminAiProviderSettings;
  embedding: AdminAiEmbeddingProviderSettings;
  providers?: {
    gemini?: {
      baseUrl: string;
      apiKeySecretRef: string | null;
      configured?: boolean;
    };
  };
  ollamaHost: string;
  model: string;
}

export interface AdminAiChatSettings {
  provider: 'ollama' | 'openrouter' | 'gemini' | 'custom';
  baseUrl: string | null;
  model: string;
  allowedModels: string[];
}

export interface AdminAiModel {
  name: string;
  size: number | null;
  modifiedAt: string | null;
  capabilities: string[];
  description?: string | null;
  displayName?: string | null;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number | null;
  outputTokenLimit?: number | null;
  version?: string | null;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  providerMetadata?: Record<string, unknown>;
  source?: 'live';
  available?: boolean;
  availabilityReason?: string | null;
  embeddingDimensions?: number;
}

export interface AdminAiAvailability {
  host: string;
  model: string;
  reachable: boolean;
  modelAvailable: boolean;
  models: AdminAiModel[];
  responseTimeMs: number | null;
  error: string | null;
}

export interface AdminEmbeddingIndexSummary {
  id: string;
  providerConfigId: string;
  provider: 'ollama' | 'openrouter' | 'gemini' | 'voyage' | 'custom';
  model: string;
  dimensions: number;
  distanceMetric: string;
  status: 'building' | 'ready' | 'active' | 'failed' | 'retiring' | 'retired';
  isActive: boolean;
  expectedChunkCount: number;
  embeddedChunkCount: number;
  failedChunkCount: number;
  failureMessage: string | null;
  buildStartedAt: string | null;
  buildCompletedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documentStatuses: {
    pending: number;
    indexing: number;
    ready: number;
    failed: number;
    stale: number;
    skipped: number;
  };
}

export interface AdminAiStatus {
  aiFeaturesEnabled: boolean;
  chat: AdminAiChatSettings;
  embedding: {
    activeIndex: AdminEmbeddingIndexSummary | null;
    candidateIndexes: AdminEmbeddingIndexSummary[];
    recentIndexes: AdminEmbeddingIndexSummary[];
    chunkCoverage: {
      indexedChunkCount: number;
      totalChunkCount: number;
    };
    semanticSearchAvailable: boolean;
  };
}

export interface AdminOfficeConverterStatus {
  supported: boolean;
  enabled: boolean;
  settingSource: 'stored' | 'environment_default';
  configured: boolean;
  healthy: boolean;
  provider: string | null;
  url: string | null;
  lastHealthCheck: string | null;
  error: string | null;
  supportedFormats: string[];
}
