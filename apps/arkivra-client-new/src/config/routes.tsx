import { lazy } from 'react'
import { Navigate } from 'react-router-dom'

// Lazy load components for better performance
const Landing = lazy(() => import('@/app/landing/page'))
const Vaults = lazy(() => import('@/app/vaults/page'))
const VaultRouteShell = lazy(() => import('@/app/vaults/vault-route-shell'))
const VaultWorkspace = lazy(() => import('@/app/vaults/vault-workspace-page'))
const DocumentView = lazy(() => import('@/app/vaults/document-view-page'))
const VaultManagement = lazy(() => import('@/app/vaults/vault-management-page'))
const Trash = lazy(() => import('@/app/vaults/trash-page'))
const Search = lazy(() => import('@/app/search/page'))
const Tags = lazy(() => import('@/app/tags/page'))
const Chat = lazy(() => import('@/app/chat/page'))
const AdminUsers = lazy(() => import('@/app/admin/users/page'))
const AdminAuditLog = lazy(() => import('@/app/admin/audit-log/page'))
const AdminBackups = lazy(() => import('@/app/admin/backups/page'))
const AdminOfficeConverter = lazy(() => import('@/app/admin/office-converter/page'))

// Auth pages
const SignIn = lazy(() => import('@/app/auth/sign-in/page'))
const SignUp = lazy(() => import('@/app/auth/sign-up/page'))
const EmailVerification = lazy(() => import('@/app/auth/verify-email/page'))
const RequestPasswordReset = lazy(() => import('@/app/auth/request-password-reset/page'))

const NotFound = lazy(() => import('@/app/errors/not-found/page'))

// Settings pages
const AccountSettings = lazy(() => import('@/app/settings/account/page'))
const SecuritySettings = lazy(() => import('@/app/settings/security/page'))
const AppearanceSettings = lazy(() => import('@/app/settings/appearance/page'))
const AboutSettings = lazy(() => import('@/app/settings/about/page'))
const AdminAiSettings = lazy(() => import('@/app/admin/ai-settings/page'))

export interface RouteConfig {
  path?: string
  index?: boolean
  element: React.ReactNode
  children?: RouteConfig[]
  public?: boolean
  allowAuthenticated?: boolean
}

export const routes: RouteConfig[] = [
  // Default route - redirect to vaults
  // Use relative path "vaults" instead of "/vaults" for basename compatibility
  {
    path: "/",
    element: <Navigate to="vaults" replace />
  },

  // Auth Routes
  {
    path: "/login",
    element: <SignIn />,
    public: true,
  },
  {
    path: "/register",
    element: <SignUp />,
    public: true,
  },
  {
    path: "/verify-email",
    element: <EmailVerification />,
    public: true,
    allowAuthenticated: true,
  },
  {
    path: "/request-password-reset",
    element: <RequestPasswordReset />,
    public: true,
  },

  // Landing Page
  {
    path: "/landing",
    element: <Landing />
  },

  // Application Routes
  {
    path: "/vaults",
    element: <Vaults />
  },
  {
    path: "/vaults/:vaultId",
      element: <VaultRouteShell />,
    children: [
      {
        index: true,
        element: <VaultWorkspace />,
      },
      {
        path: ":documentId",
        element: <DocumentView />,
      },
    ],
  },
  {
    path: "/vaults/:vaultId/members",
    element: <VaultManagement section="members" />,
  },
  {
    path: "/vaults/:vaultId/settings",
    element: <VaultManagement section="settings" />,
  },
  {
    path: "/vaults/:vaultId/activity",
    element: <VaultManagement section="activity" />,
  },
  {
    path: "/trash",
    element: <Trash />
  },
  {
    path: "/trash/:documentId",
    element: <DocumentView />
  },
  {
    path: "/search",
    element: <Search />
  },
  {
    path: "/tags",
    element: <Tags />
  },
  {
    path: "/chat",
    element: <Chat />
  },
  {
    path: "/chat/:conversationId",
    element: <Chat />
  },

  // Settings Routes
  {
    path: "/settings/account",
    element: <AccountSettings />
  },
  {
    path: "/settings/security",
    element: <SecuritySettings />
  },
  {
    path: "/settings/appearance",
    element: <AppearanceSettings />
  },
  {
    path: "/settings/about",
    element: <AboutSettings />
  },
  {
    path: "/admin/ai-settings",
    element: <AdminAiSettings />
  },
  {
    path: "/admin/users",
    element: <AdminUsers />
  },
  {
    path: "/admin/backups",
    element: <AdminBackups />
  },
  {
    path: "/admin/office-converter",
    element: <AdminOfficeConverter />
  },
  {
    path: "/admin/audit-log",
    element: <AdminAuditLog />
  },

  // Catch-all route for 404
  {
    path: "*",
    element: <NotFound />
  }
]
