/* eslint-disable react-refresh/only-export-components */
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute, PublicOnlyRoute } from '@/features/auth/auth-guards';
import { LoginPage } from '@/features/auth/pages/login-page';
import { RegisterPage } from '@/features/auth/pages/register-page';
import { RequestPasswordResetPage } from '@/features/auth/pages/request-password-reset-page';
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page';
import { TwoFactorSetupPage } from '@/features/auth/pages/two-factor-setup-page';
import { TwoFactorVerifyPage } from '@/features/auth/pages/two-factor-verify-page';
import { AllDocumentsPage } from '@/features/documents/pages/all-documents-page';
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

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function createAppRouter() {
  return createBrowserRouter([
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
    {
      path: '/',
      element: <ProtectedRoute><RootLayout /></ProtectedRoute>,
      children: [
        {
          index: true,
          element: <Navigate to="/vaults" replace />,
        },
        {
          path: 'two-factor/setup',
          element: <TwoFactorSetupPage />,
        },
        {
          path: 'vaults',
          element: <VaultsPage />,
        },
        {
          path: 'vaults/new',
          element: <Navigate to="/vaults" replace />,
        },
        {
          path: 'vaults/:vaultId/settings',
          element: <VaultSettingsPage />,
        },
        {
          path: 'documents',
          element: <AllDocumentsPage />,
        },
        {
          path: 'documents/trash',
          element: <DocumentTrashPage />,
        },
        {
          path: 'transfers',
          element: <TransfersPage />,
        },
        {
          path: 'vaults/:vaultId/documents',
          element: <DocumentsPage />,
        },
        {
          path: 'vaults/:vaultId/documents/trash',
          element: <DocumentTrashPage />,
        },
        {
          path: 'vaults/:vaultId/documents/:documentId',
          element: <DocumentDetailPage />,
        },
        {
          path: 'vaults/:vaultId/tags',
          element: <TagsPage />,
        },
        {
          path: 'search',
          element: <Navigate to="/documents" replace />,
        },
        {
          path: 'settings',
          element: <SettingsPage />,
        },
        {
          path: 'admin',
          element: <AdminPage />,
        },
        {
          path: 'about',
          element: <AboutPage />,
        },
        {
          path: '*',
          element: <Navigate to="/vaults" replace />,
        },
      ],
    },
  ]);
}
