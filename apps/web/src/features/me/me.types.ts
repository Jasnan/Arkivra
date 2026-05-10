export interface MeResponse {
  userId: string;
  sessionId: string;
  isGlobalAdmin: boolean;
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
