import { lazy } from 'react'
import { Navigate } from 'react-router-dom'

// Lazy load components for better performance
const Landing = lazy(() => import('@/app/landing/page'))
const Dashboard = lazy(() => import('@/app/dashboard/page'))
const Dashboard2 = lazy(() => import('@/app/dashboard-2/page'))
const Vaults = lazy(() => import('@/app/vaults/page'))
const VaultWorkspace = lazy(() => import('@/app/vaults/vault-workspace-page'))
const DocumentView = lazy(() => import('@/app/vaults/document-view-page'))
const Search = lazy(() => import('@/app/search/page'))
const Tags = lazy(() => import('@/app/tags/page'))
const Tasks = lazy(() => import('@/app/tasks/page'))
const Chat = lazy(() => import('@/app/chat/page'))
const Calendar = lazy(() => import('@/app/calendar/page'))
const Users = lazy(() => import('@/app/users/page'))

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

export interface RouteConfig {
  path: string
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
    element: <VaultWorkspace />
  },
  {
    path: "/vaults/:vaultId/:documentId",
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
    path: "/tasks",
    element: <Tasks />
  },
  {
    path: "/chat",
    element: <Chat />
  },
  {
    path: "/calendar",
    element: <Calendar />
  },

  // Content Pages
  {
    path: "/users",
    element: <Users />
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

  // Catch-all route for 404
  {
    path: "*",
    element: <NotFound />
  }
]
