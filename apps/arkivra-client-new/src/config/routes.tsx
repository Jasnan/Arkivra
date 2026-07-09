import { lazy } from 'react';
import { Navigate } from 'react-router-dom';

// Lazy load components for better performance
const Landing = lazy(() => import('@/app/landing/page'));
const Vaults = lazy(() => import('@/app/vaults/page'));
const VaultRouteShell = lazy(() => import('@/app/vaults/vault-route-shell'));
const VaultWorkspace = lazy(() => import('@/app/vaults/vault-workspace-page'));
const DocumentView = lazy(() => import('@/app/vaults/document-view-page'));
const VaultManagement = lazy(() => import('@/app/vaults/vault-management-page'));
const Trash = lazy(() => import('@/app/vaults/trash-page'));
const Search = lazy(() => import('@/app/search/page'));
const Chat = lazy(() => import('@/app/chat/page'));
const Tags = lazy(() => import('@/app/tags/page'));
const AdminUsers = lazy(() => import('@/app/admin/users/page'));
const AdminAuditLog = lazy(() => import('@/app/admin/audit-log/page'));
const AdminBackups = lazy(() => import('@/app/admin/backups/page'));
const AdminOfficeConverter = lazy(() => import('@/app/admin/office-converter/page'));

// Auth pages
const SignIn = lazy(() => import('@/app/auth/sign-in/page'));
const SignUp = lazy(() => import('@/app/auth/sign-up/page'));
const AcceptInvite = lazy(() => import('@/app/auth/accept-invite/page'));
const EmailVerification = lazy(() => import('@/app/auth/verify-email/page'));
const RequestPasswordReset = lazy(() => import('@/app/auth/request-password-reset/page'));

const NotFound = lazy(() => import('@/app/errors/not-found/page'));

// Settings pages
const AccountSettings = lazy(() => import('@/app/settings/account/page'));
const SecuritySettings = lazy(() => import('@/app/settings/security/page'));
const PreferencesSettings = lazy(() => import('@/app/settings/preferences/page'));
const AboutSettings = lazy(() => import('@/app/settings/about/page'));
const AdminAiSettings = lazy(() => import('@/app/admin/ai-settings/page'));

export interface RouteConfig {
  path?: string;
  index?: boolean;
  element: React.ReactNode;
  children?: RouteConfig[];
  public?: boolean;
  allowAuthenticated?: boolean;
  breadcrumb?: BreadcrumbConfig;
}

export interface BreadcrumbContext {
  documentName?: string;
  vaultId?: string;
  vaultName?: string;
}

export interface BreadcrumbEntryConfig {
  label: string | ((context: BreadcrumbContext) => string);
  to?: string | ((context: BreadcrumbContext) => string | undefined);
}

export interface BreadcrumbConfig extends BreadcrumbEntryConfig {
  parents?: BreadcrumbEntryConfig[];
}

export const routes: RouteConfig[] = [
  // Default route - redirect to vaults
  // Use relative path "vaults" instead of "/vaults" for basename compatibility
  {
    path: '/',
    element: <Navigate to="vaults" replace />,
  },

  // Auth Routes
  {
    path: '/login',
    element: <SignIn />,
    public: true,
  },
  {
    path: '/register',
    element: <SignUp />,
    public: true,
  },
  {
    path: '/accept-invite',
    element: <AcceptInvite />,
    public: true,
    allowAuthenticated: true,
  },
  {
    path: '/verify-email',
    element: <EmailVerification />,
    public: true,
    allowAuthenticated: true,
  },
  {
    path: '/request-password-reset',
    element: <RequestPasswordReset />,
    public: true,
  },

  // Landing Page
  {
    path: '/landing',
    element: <Landing />,
    breadcrumb: { label: 'Landing' },
  },

  // Application Routes
  {
    path: '/vaults',
    element: <Vaults />,
    breadcrumb: { label: 'Vaults' },
  },
  {
    path: '/vaults/:vaultId',
    element: <VaultRouteShell />,
    breadcrumb: {
      parents: [{ label: 'Vaults', to: '/vaults' }],
      label: ({ vaultName }) => vaultName ?? 'Vault',
      to: ({ vaultId }) => vaultId ? `/vaults/${vaultId}` : undefined,
    },
    children: [
      {
        index: true,
        element: <VaultWorkspace />,
      },
      {
        path: ':documentId',
        element: <DocumentView />,
        breadcrumb: {
          label: ({ documentName }) => documentName ?? 'Document',
        },
      },
    ],
  },
  {
    path: '/vaults/:vaultId/settings',
    element: <VaultManagement section="settings" />,
    breadcrumb: {
      parents: [
        { label: 'Vaults', to: '/vaults' },
        { label: ({ vaultName }) => vaultName ?? 'Vault', to: ({ vaultId }) => vaultId ? `/vaults/${vaultId}` : undefined },
      ],
      label: 'Settings',
    },
  },
  {
    path: '/vaults/:vaultId/activity',
    element: <VaultManagement section="activity" />,
    breadcrumb: {
      parents: [
        { label: 'Vaults', to: '/vaults' },
        { label: ({ vaultName }) => vaultName ?? 'Vault', to: ({ vaultId }) => vaultId ? `/vaults/${vaultId}` : undefined },
      ],
      label: 'Activity',
    },
  },
  {
    path: '/trash',
    element: <Trash />,
    breadcrumb: { label: 'Trash' },
  },
  {
    path: '/trash/:documentId',
    element: <DocumentView />,
    breadcrumb: {
      parents: [{ label: 'Trash', to: '/trash' }],
      label: ({ documentName }) => documentName ?? 'Document',
    },
  },
  {
    path: '/search',
    element: <Search />,
    breadcrumb: { label: 'Search' },
  },
  {
    path: '/chat',
    element: <Chat />,
    breadcrumb: { label: 'Chat' },
  },
  {
    path: '/chat/:chatId',
    element: <Chat />,
    breadcrumb: {
      parents: [{ label: 'Chat', to: '/chat' }],
      label: 'Conversation',
    },
  },
  {
    path: '/tags',
    element: <Tags />,
    breadcrumb: { label: 'Tags' },
  },

  // Settings Routes
  {
    path: '/settings/account',
    element: <AccountSettings />,
    breadcrumb: {
      parents: [{ label: 'Settings', to: '/settings/account' }],
      label: 'Profile',
    },
  },
  {
    path: '/settings/security',
    element: <SecuritySettings />,
    breadcrumb: {
      parents: [{ label: 'Settings', to: '/settings/account' }],
      label: 'Security',
    },
  },
  {
    path: '/settings/preferences',
    element: <PreferencesSettings />,
    breadcrumb: {
      parents: [{ label: 'Settings', to: '/settings/account' }],
      label: 'Preferences',
    },
  },
  {
    path: '/settings/appearance',
    element: <Navigate to="/settings/preferences" replace />,
    breadcrumb: {
      parents: [{ label: 'Settings', to: '/settings/account' }],
      label: 'Preferences',
    },
  },
  {
    path: '/settings/about',
    element: <AboutSettings />,
    breadcrumb: {
      parents: [{ label: 'Settings', to: '/settings/account' }],
      label: 'About',
    },
  },
  {
    path: '/admin/ai-settings',
    element: <AdminAiSettings />,
    breadcrumb: {
      parents: [{ label: 'Admin', to: '/admin/ai-settings' }],
      label: 'AI Settings',
    },
  },
  {
    path: '/admin/users',
    element: <AdminUsers />,
    breadcrumb: {
      parents: [{ label: 'Admin', to: '/admin/ai-settings' }],
      label: 'Users',
    },
  },
  {
    path: '/admin/backups',
    element: <AdminBackups />,
    breadcrumb: {
      parents: [{ label: 'Admin', to: '/admin/ai-settings' }],
      label: 'Backups',
    },
  },
  {
    path: '/admin/office-converter',
    element: <AdminOfficeConverter />,
    breadcrumb: {
      parents: [{ label: 'Admin', to: '/admin/ai-settings' }],
      label: 'Office Converter',
    },
  },
  {
    path: '/admin/audit-log',
    element: <AdminAuditLog />,
    breadcrumb: {
      parents: [{ label: 'Admin', to: '/admin/ai-settings' }],
      label: 'Audit Log',
    },
  },

  // Catch-all route for 404
  {
    path: '*',
    element: <NotFound />,
  },
];
