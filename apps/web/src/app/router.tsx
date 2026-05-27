/* eslint-disable react-refresh/only-export-components */
import {
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
} from '@tanstack/react-router'
import { AuthLayout, AuthLoadingState } from '@/features/auth/auth-layout'
import { EmailVerificationPage } from '@/features/auth/pages/email-verification-page'
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
import { AdminIndexPage } from '@/features/admin/pages/admin-index-page'
import {
  AdminAiSettingsPage,
  AdminAuditLogPage,
  AdminBackupsPage,
  AdminOverviewPage,
  AdminUserAccessPage,
  AdminUsersPage,
} from '@/features/admin/pages/admin-page'
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

function VaultChatRedirect() {
  const { vaultId } = useParams({ strict: false }) as { vaultId?: string };
  return vaultId ? <Navigate to={ROUTES.chat} search={{ vaultId }} replace /> : <Navigate to={ROUTES.chat} replace />;
}

function DocumentChatRedirect() {
  const { vaultId, documentId } = useParams({ strict: false }) as { vaultId?: string; documentId?: string };
  return vaultId && documentId
    ? <Navigate to={ROUTES.chat} search={{ vaultId, documentId }} replace />
    : <Navigate to={ROUTES.chat} replace />;
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

const emailVerificationRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/verify-email',
  validateSearch: (search: Record<string, unknown>) => search as Record<string, string>,
  component: EmailVerificationPage,
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
  component: VaultChatRedirect,
})

const documentRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/vaults/$vaultId/$documentId',
  component: DocumentDetailPage,
})

const documentChatRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/vaults/$vaultId/$documentId/chat',
  component: DocumentChatRedirect,
})

const chatRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/chat',
  validateSearch: (search: Record<string, unknown>) => search as Record<string, string>,
  component: ChatPage,
})

const chatConversationRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/chat/$conversationId',
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
  component: Outlet,
})

const settingsSecurityIndexRoute = createRoute({
  getParentRoute: () => settingsSecurityRoute,
  path: '/',
  component: SecuritySettingsPage,
})

const twoFactorSetupRoute = createRoute({
  getParentRoute: () => settingsSecurityRoute,
  path: 'two-factor/setup',
  component: TwoFactorSetupPage,
})

const twoFactorManageRoute = createRoute({
  getParentRoute: () => settingsSecurityRoute,
  path: 'two-factor/manage',
  component: TwoFactorManagementPage,
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
  component: AdminIndexPage,
})

const adminOverviewRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/admin/overview',
  component: AdminOverviewPage,
})

const adminUsersRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/admin/users',
  component: AdminUsersPage,
})

const adminUserAccessRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/admin/users/$userId/access',
  component: AdminUserAccessPage,
})

const adminBackupsRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/admin/backups',
  component: AdminBackupsPage,
})

const adminAuditLogRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/admin/audit-log',
  component: AdminAuditLogPage,
})

const legacyAdminVaultRedirectRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/admin/vaults',
  component: () => <Navigate to={ROUTES.adminOverview} />,
})

const adminAiSettingsRoute = createRoute({
  getParentRoute: () => protectedLayoutRoute,
  path: '/admin/ai-settings',
  component: AdminAiSettingsPage,
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
    emailVerificationRoute,
    twoFactorVerifyRoute,
  ]),
  protectedLayoutRoute.addChildren([
    indexRoute,
    vaultsRoute,
    vaultRoute,
    vaultSettingsRoute,
    vaultChatRoute,
    documentRoute,
    documentChatRoute,
    chatRoute,
    chatConversationRoute,
    trashRoute,
    trashDocumentRoute,
    tagsRoute,
    searchRoute,
    transfersRoute,
    settingsRoute,
    settingsAccountRoute,
    settingsSecurityRoute.addChildren([
      settingsSecurityIndexRoute,
      twoFactorSetupRoute,
      twoFactorManageRoute,
    ]),
    settingsPreferencesRoute,
    settingsAboutRoute,
    adminRoute,
    adminOverviewRoute,
    adminUsersRoute,
    adminUserAccessRoute,
    adminAuditLogRoute,
    adminBackupsRoute,
    legacyAdminVaultRedirectRoute,
    adminAiSettingsRoute,
    catchAllRoute,
  ]),
])

export const appRouter = createRouter({
  routeTree,
  defaultPreload: 'intent',
})
