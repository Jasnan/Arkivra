import {
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { Flex } from '@chakra-ui/react'
import { AuthLayout } from '@/features/auth/auth-layout'
import { LoginPage } from '@/features/auth/pages/login-page'
import { RegisterPage } from '@/features/auth/pages/register-page'
import { RequestPasswordResetPage } from '@/features/auth/pages/request-password-reset-page'
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page'
import { TwoFactorSetupPage } from '@/features/auth/pages/two-factor-setup-page'
import { TwoFactorVerifyPage } from '@/features/auth/pages/two-factor-verify-page'
import { ChatPage } from '@/features/chat/pages/chat-page'
import { DocumentDetailPage } from '@/features/documents/pages/document-detail-page'
import { DocumentsPage } from '@/features/documents/pages/documents-page'
import { DocumentTrashPage } from '@/features/documents/pages/document-trash-page'
import { AdminPage } from '@/features/admin/pages/admin-page'
import { AboutSettingsPage } from '@/features/settings/pages/about-settings-page'
import { PreferencesSettingsPage } from '@/features/settings/pages/preferences-settings-page'
import { SecuritySettingsPage } from '@/features/settings/pages/security-settings-page'
import { SettingsIndexPage } from '@/features/settings/pages/settings-index-page'
import { SettingsPage } from '@/features/settings/pages/settings-page'
import { TwoFactorManagementPage } from '@/features/settings/pages/two-factor-management-page'
import { TagsPage } from '@/features/tags/pages/tags-page'
import { TransfersPage } from '@/features/uploads/pages/transfers-page'
import { VaultSettingsPage } from '@/features/vaults/pages/vault-settings-page'
import { VaultsPage } from '@/features/vaults/pages/vaults-page'
import { SearchPage } from '@/features/search/pages/search-page'
import { AppShell } from '@/components/layout/app-shell'
import { ROUTES } from '@/app/routes'
import { authClient } from '@/lib/auth-client'

function AuthLoadingState() {
  return (
    <Flex minH="100vh" align="center" justify="center" bg="bg.muted" fontSize="sm" color="fg.muted">
      Checking session...
    </Flex>
  )
}

function PublicAuthLayout() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return <AuthLoadingState />
  if (session) return <Navigate to={ROUTES.root} />

  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  )
}

function ProtectedAppShell() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return <AuthLoadingState />
  if (!session) return <Navigate to={ROUTES.login} />

  return <AppShell />
}

const rootRoute = createRootRoute()

const publicLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'public',
  component: PublicAuthLayout,
})

const loginRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/login',
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/register',
  component: RegisterPage,
})

const requestPasswordResetRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/request-password-reset',
  component: RequestPasswordResetPage,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
})

const twoFactorVerifyRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/two-factor/verify',
  component: TwoFactorVerifyPage,
})

const protectedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  component: ProtectedAppShell,
})

const indexRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/',
  component: () => <Navigate to={ROUTES.vaults} />,
})

const twoFactorSetupRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/two-factor/setup',
  component: TwoFactorSetupPage,
})

const twoFactorManageRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/two-factor/manage',
  component: TwoFactorManagementPage,
})

const vaultsRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/vaults',
  component: VaultsPage,
})

const vaultRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/vaults/$vaultId',
  component: DocumentsPage,
})

const vaultSettingsRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/vaults/$vaultId/settings',
  component: VaultSettingsPage,
})

const vaultChatRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/vaults/$vaultId/chat',
  component: ChatPage,
})

const documentRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/vaults/$vaultId/$documentId',
  component: DocumentDetailPage,
})

const documentChatRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/vaults/$vaultId/$documentId/chat',
  component: DocumentDetailPage,
})

const chatRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/chat',
  component: ChatPage,
})

const trashRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/trash',
  validateSearch: (search: Record<string, unknown>) => search as Record<string, string>,
  component: DocumentTrashPage,
})

const trashDocumentRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/trash/$documentId',
  component: DocumentDetailPage,
})

const tagsRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/tags',
  component: TagsPage,
})

const searchRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/search',
  validateSearch: (search: Record<string, unknown>) => search as Record<string, string>,
  component: SearchPage,
})

const transfersRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/transfers',
  validateSearch: (search: Record<string, unknown>) => search as Record<string, string>,
  component: TransfersPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/settings',
  component: SettingsIndexPage,
})

const settingsAccountRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/settings/account',
  component: SettingsPage,
})

const settingsSecurityRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/settings/security',
  component: SecuritySettingsPage,
})

const settingsPreferencesRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/settings/preferences',
  component: PreferencesSettingsPage,
})

const settingsAboutRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/settings/about',
  component: AboutSettingsPage,
})

const adminRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/admin',
  component: AdminPage,
})

const catchAllRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '$',
  component: () => <Navigate to={ROUTES.vaults} />,
})

const routeTree = rootRoute.addChildren([
  publicLayoutRoute.addChildren([
    loginRoute,
    registerRoute,
    requestPasswordResetRoute,
    resetPasswordRoute,
    twoFactorVerifyRoute,
  ]),
  protectedLayoutRoute.addChildren([
    indexRoute,
    twoFactorSetupRoute,
    twoFactorManageRoute,
    vaultsRoute,
    vaultRoute,
    vaultSettingsRoute,
    vaultChatRoute,
    documentRoute,
    documentChatRoute,
    chatRoute,
    trashRoute,
    trashDocumentRoute,
    tagsRoute,
    searchRoute,
    transfersRoute,
    settingsRoute,
    settingsAccountRoute,
    settingsSecurityRoute,
    settingsPreferencesRoute,
    settingsAboutRoute,
    adminRoute,
    catchAllRoute,
  ]),
])

export const appRouter = createRouter({
  routeTree,
  defaultPreload: 'intent',
})
