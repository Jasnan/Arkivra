export interface MeResponse {
  userId: string;
  sessionId: string;
  systemRole: 'admin' | 'member' | null;
  systemCapabilities: SystemCapability[];
  isAdmin: boolean;
  canCreateVault: boolean;
  authMethods: {
    hasPassword: boolean;
    oauthProviders: string[];
    primaryOAuthProvider: string | null;
  };
  twoFactor?: {
    authenticatorLinkedAt: string | null;
    backupCodeCount: number | null;
    backupCodesUpdatedAt: string | null;
  };
}

export type SystemCapability = 'system.create_vaults';
