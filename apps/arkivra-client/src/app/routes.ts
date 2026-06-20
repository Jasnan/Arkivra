export const ROUTES = {
  // Auth (public-only)
  login: '/login',
  register: '/register',
  requestPasswordReset: '/request-password-reset',
  resetPassword: '/reset-password',
  emailVerification: '/verify-email',
  twoFactorVerify: '/two-factor/verify',
  restore: '/restore',

  // Vaults
  vaults: '/vaults',
  vaultRoot: (vaultId: string) => `/vaults/${vaultId}` as const,
  vaultMembers: (vaultId: string) => `/vaults/${vaultId}/members` as const,
  vaultActivity: (vaultId: string) => `/vaults/${vaultId}/activity` as const,
  vaultSettings: (vaultId: string) => `/vaults/${vaultId}/settings` as const,
  vaultChat: (vaultId: string) => `/vaults/${vaultId}/chat` as const,
  vaultChatConversation: (vaultId: string, conversationId: string) => `/vaults/${vaultId}/chat/${conversationId}` as const,
  vaultDocument: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/${documentId}` as const,
  vaultDocumentExtractedText: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/${documentId}/extracted-text` as const,
  vaultDocumentMetadata: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/${documentId}/metadata` as const,
  vaultDocumentActivity: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/${documentId}/activity` as const,
  vaultDocumentChat: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/${documentId}/chat` as const,

  // Chat
  chat: '/chat',
  chatConversation: (conversationId: string) => `/chat/${conversationId}` as const,
  chatWithVault: (vaultId: string) => `/chat?vaultId=${vaultId}` as const,
  chatWithDocument: (vaultId: string, documentId: string, documentName?: string) =>
    `/chat?vaultId=${vaultId}&documentId=${documentId}${documentName ? `&documentName=${encodeURIComponent(documentName)}` : ''}` as const,

  // Trash (global, cross-vault)
  trash: '/trash',
  trashDocument: (documentId: string) => `/trash/${documentId}` as const,

  // Tags (global, cross-vault)
  tags: '/tags',

  // Search
  search: '/search',

  // Transfers
  transfers: '/transfers',
  transfersWithLock: (vaultId: string, folderId?: string | null) =>
    `/transfers?vaultId=${vaultId}&locked=true${folderId ? `&folderId=${folderId}` : ''}` as const,

  // Settings
  settings: '/settings',
  settingsAccount: '/settings/account',
  settingsSecurity: '/settings/security',
  twoFactorSetup: '/settings/security/two-factor/setup',
  twoFactorManage: '/settings/security/two-factor/manage',
  settingsPreferences: '/settings/preferences',
  settingsAbout: '/settings/about',

  // Admin
  admin: '/admin',
  adminOverview: '/admin/overview',
  adminUsers: '/admin/users',
  adminUserAccess: (userId: string) => `/admin/users/${userId}/access` as const,
  adminAuditLog: '/admin/audit-log',
  adminBackups: '/admin/backups',
  adminAiSettings: '/admin/ai-settings',

  // Root
  root: '/',
} as const;
