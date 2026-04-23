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
  globalRoles: string[];
  isGlobalAdmin: boolean;
  canCreateVault: boolean;
}

export interface AdminVault {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
}

export interface AdminAiSettings {
  enabled: boolean;
  ollamaHost: string;
  model: string;
  minTokenLength: number;
  maxCandidates: number;
  batchSize: number;
  logRequests: boolean;
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
