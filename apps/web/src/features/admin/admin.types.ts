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
