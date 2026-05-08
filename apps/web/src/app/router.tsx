import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedLayout, PublicOnlyRoute } from '@/features/auth/auth-guards';
import { LoginPage } from '@/features/auth/pages/login-page';
import { RegisterPage } from '@/features/auth/pages/register-page';
import { RequestPasswordResetPage } from '@/features/auth/pages/request-password-reset-page';
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page';
import { TwoFactorSetupPage } from '@/features/auth/pages/two-factor-setup-page';
import { TwoFactorVerifyPage } from '@/features/auth/pages/two-factor-verify-page';
import { ChatPage } from '@/features/chat/pages/chat-page';
import { DocumentDetailPage } from '@/features/documents/pages/document-detail-page';
import { DocumentsPage } from '@/features/documents/pages/documents-page';
import { DocumentTrashPage } from '@/features/documents/pages/document-trash-page';
import { AdminPage } from '@/features/admin/pages/admin-page';
import { AboutPage } from '@/features/about/pages/about-page';
import { SettingsPage } from '@/features/settings/pages/settings-page';
import { TagsPage } from '@/features/tags/pages/tags-page';
import { TransfersPage } from '@/features/uploads/pages/transfers-page';
import { VaultSettingsPage } from '@/features/vaults/pages/vault-settings-page';
import { VaultsPage } from '@/features/vaults/pages/vaults-page';
import { SearchPage } from '@/features/search/pages/search-page';

export const appRouter = createBrowserRouter([
  // ── Public-only routes ──
  {
    path: '/login',
    element: <PublicOnlyRoute><LoginPage /></PublicOnlyRoute>,
  },
  {
    path: '/register',
    element: <PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>,
  },
  {
    path: '/request-password-reset',
    element: <PublicOnlyRoute><RequestPasswordResetPage /></PublicOnlyRoute>,
  },
  {
    path: '/reset-password',
    element: <PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>,
  },
  {
    path: '/two-factor/verify',
    element: <PublicOnlyRoute><TwoFactorVerifyPage /></PublicOnlyRoute>,
  },

  // ── Protected routes (require session, wrapped in AppShell) ──
  {
    element: <ProtectedLayout />,
    children: [
      // Root
      { index: true, element: <Navigate to="/vaults" replace /> },

      // Auth (protected)
      { path: 'two-factor/setup', element: <TwoFactorSetupPage /> },

      // Vaults
      {
        path: 'vaults',
        children: [
          { index: true, element: <VaultsPage /> },
          { path: 'new', element: <Navigate to="/vaults" replace /> },
          {
            path: ':vaultId',
            children: [
              { index: true, element: <DocumentsPage /> },
              { path: 'settings', element: <VaultSettingsPage /> },
              { path: 'trash', element: <DocumentTrashPage /> },
              { path: 'chat', element: <ChatPage /> },
              { path: 'tags', element: <TagsPage /> },
              {
                path: ':documentId',
                children: [
                  { index: true, element: <DocumentDetailPage /> },
                  { path: 'chat', element: <DocumentDetailPage /> },
                ],
              },
            ],
          },
        ],
      },

      // Chat (global)
      { path: 'chat', element: <ChatPage /> },

      // Trash (global)
      { path: 'trash', element: <DocumentTrashPage /> },

      // Tags (global)
      { path: 'tags', element: <TagsPage /> },

      // Search
      { path: 'search', element: <SearchPage /> },

      // Transfers
      { path: 'transfers', element: <TransfersPage /> },

      // Settings
      { path: 'settings', element: <SettingsPage /> },

      // Admin
      { path: 'admin', element: <AdminPage /> },

      // About
      { path: 'about', element: <AboutPage /> },

      // Catch-all
      { path: '*', element: <Navigate to="/vaults" replace /> },
    ],
  },
]);

appRouter.subscribe((state) => {
  console.log('[Router Subscribe]', {
    pathname: state.location.pathname,
    navigationState: state.navigation.state,
    matches: state.matches.map((m) => m.route.path || '(index)'),
  });
});
