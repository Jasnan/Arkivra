export const ROUTES = {
  // Auth (public-only)
  login: '/login',
  register: '/register',
  requestPasswordReset: '/request-password-reset',
  resetPassword: '/reset-password',
  twoFactorVerify: '/two-factor/verify',
  twoFactorSetup: '/two-factor/setup',
  twoFactorManage: '/two-factor/manage',

  // Vaults
  vaults: '/vaults',
  vaultRoot: (vaultId: string) => `/vaults/${vaultId}` as const,
  vaultChat: (vaultId: string) => `/vaults/${vaultId}/chat` as const,
  vaultTags: (_vaultId: string) => '/tags' as const,
  vaultTrash: (_vaultId: string) => '/trash' as const,
  vaultSettings: (vaultId: string) => `/vaults/${vaultId}/settings` as const,
  vaultDocument: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/${documentId}` as const,
  vaultDocumentChat: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/${documentId}/chat` as const,

  // Chat (global, cross-vault)
  chat: '/chat',

  // Trash (global, cross-vault)
  trash: '/trash',

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

  // Admin
  admin: '/admin',

  // About
  about: '/about',

  // Root
  root: '/',
} as const;
