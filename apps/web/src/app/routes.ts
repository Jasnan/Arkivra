export const ROUTES = {
  // Auth (public-only)
  login: '/login',
  register: '/register',
  requestPasswordReset: '/request-password-reset',
  resetPassword: '/reset-password',
  twoFactorVerify: '/two-factor/verify',
  twoFactorSetup: '/two-factor/setup',

  // Vaults
  vaults: '/vaults',
  vaultSettings: (vaultId: string) => `/vaults/${vaultId}/settings` as const,
  vaultDocuments: (vaultId: string) => `/vaults/${vaultId}/documents` as const,
  vaultChat: (vaultId: string) => `/vaults/${vaultId}/chat` as const,
  vaultTags: (vaultId: string) => `/vaults/${vaultId}/tags` as const,
  vaultTrash: (vaultId: string) => `/vaults/${vaultId}/documents/trash` as const,
  vaultDocument: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/documents/${documentId}` as const,
  vaultDocumentChat: (vaultId: string, documentId: string) =>
    `/vaults/${vaultId}/documents/${documentId}/chat` as const,

  // Documents (global)
  documents: '/documents',
  documentDetail: (vaultId: string, documentId: string) =>
    `/documents/${vaultId}/${documentId}` as const,
  documentsTrash: '/documents/trash',

  // Transfers
  transfers: '/transfers',
  transfersWithLock: (vaultId: string) =>
    `/transfers?vaultId=${vaultId}&locked=true` as const,

  // Tags (global)
  tags: '/tags',

  // Search
  search: '/search',

  // Chat (global)
  chat: '/chat',

  // Settings
  settings: '/settings',

  // Admin
  admin: '/admin',

  // About
  about: '/about',

  // Root
  root: '/',
} as const;
