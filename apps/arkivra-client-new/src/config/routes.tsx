import { lazy } from 'react'
import { Navigate } from 'react-router-dom'

// Lazy load components for better performance
const Landing = lazy(() => import('@/app/landing/page'))
const Dashboard = lazy(() => import('@/app/dashboard/page'))
const Dashboard2 = lazy(() => import('@/app/dashboard-2/page'))
const Vaults = lazy(() => import('@/app/vaults/page'))
const VaultRouteShell = lazy(() => import('@/app/vaults/vault-route-shell'))
const VaultWorkspace = lazy(() => import('@/app/vaults/vault-workspace-page'))
const DocumentView = lazy(() => import('@/app/vaults/document-view-page'))
const Trash = lazy(() => import('@/app/vaults/trash-page'))
const Search = lazy(() => import('@/app/search/page'))
const Tags = lazy(() => import('@/app/tags/page'))
const Chat = lazy(() => import('@/app/chat/page'))
const AdminUsers = lazy(() => import('@/app/admin/users/page'))
const AdminAuditLog = lazy(() => import('@/app/admin/audit-log/page'))
const AdminBackups = lazy(() => import('@/app/admin/backups/page'))

// Auth pages
const SignIn = lazy(() => import('@/app/auth/sign-in/page'))
const SignUp = lazy(() => import('@/app/auth/sign-up/page'))
const EmailVerification = lazy(() => import('@/app/auth/verify-email/page'))
const RequestPasswordReset = lazy(() => import('@/app/auth/request-password-reset/page'))

// Error pages
const Unauthorized = lazy(() => import('@/app/errors/unauthorized/page'))
const Forbidden = lazy(() => import('@/app/errors/forbidden/page'))
const NotFound = lazy(() => import('@/app/errors/not-found/page'))
const InternalServerError = lazy(() => import('@/app/errors/internal-server-error/page'))
const UnderMaintenance = lazy(() => import('@/app/errors/under-maintenance/page'))

// Settings pages
const UserSettings = lazy(() => import('@/app/settings/user/page'))
const AccountSettings = lazy(() => import('@/app/settings/account/page'))
const AppearanceSettings = lazy(() => import('@/app/settings/appearance/page'))
const NotificationSettings = lazy(() => import('@/app/settings/notifications/page'))
const ConnectionSettings = lazy(() => import('@/app/settings/connections/page'))
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
  // Default route - redirect to dashboard
  // Use relative path "dashboard" instead of "/dashboard" for basename compatibility
  {
    path: "/",
    element: <Navigate to="dashboard" replace />
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

  // Dashboard Routes
  {
    path: "/dashboard",
    element: <Dashboard />
  },
  {
    path: "/dashboard-2",
    element: <Dashboard2 />
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

  // Error Pages
  {
    path: "/errors/unauthorized",
    element: <Unauthorized />
  },
  {
    path: "/errors/forbidden",
    element: <Forbidden />
  },
  {
    path: "/errors/not-found",
    element: <NotFound />
  },
  {
    path: "/errors/internal-server-error",
    element: <InternalServerError />
  },
  {
    path: "/errors/under-maintenance",
    element: <UnderMaintenance />
  },

  // Settings Routes
  {
    path: "/settings/user",
    element: <UserSettings />
  },
  {
    path: "/settings/account",
    element: <AccountSettings />
  },
  {
    path: "/settings/appearance",
    element: <AppearanceSettings />
  },
  {
    path: "/settings/notifications",
    element: <NotificationSettings />
  },
  {
    path: "/settings/connections",
    element: <ConnectionSettings />
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
    path: "/admin/audit-log",
    element: <AdminAuditLog />
  },

  // Catch-all route for 404
  {
    path: "*",
    element: <NotFound />
  }
]
