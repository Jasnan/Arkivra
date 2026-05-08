import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute, PublicOnlyRoute } from '@/features/auth/auth-guards';
import { LoginPage } from '@/features/auth/pages/login-page';
import { RegisterPage } from '@/features/auth/pages/register-page';
import { RequestPasswordResetPage } from '@/features/auth/pages/request-password-reset-page';
import { ResetPasswordPage } from '@/features/auth/pages/reset-password-page';
import { TwoFactorSetupPage } from '@/features/auth/pages/two-factor-setup-page';
import { TwoFactorVerifyPage } from '@/features/auth/pages/two-factor-verify-page';
import { AllDocumentsPage } from '@/features/documents/pages/all-documents-page';
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

export function createAppRouter() {
  return (
    <Routes>
      {/* ── Public-only routes (no AppShell, no session required) ── */}
      <Route
        path={ROUTES.login}
        element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>}
      />
      <Route
        path={ROUTES.register}
        element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>}
      />
      <Route
        path={ROUTES.requestPasswordReset}
        element={<PublicOnlyRoute><RequestPasswordResetPage /></PublicOnlyRoute>}
      />
      <Route
        path={ROUTES.resetPassword}
        element={<PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>}
      />
      <Route
        path={ROUTES.twoFactorVerify}
        element={<PublicOnlyRoute><TwoFactorVerifyPage /></PublicOnlyRoute>}
      />

      {/* ── Protected routes (require session, wrapped in AppShell) ── */}
      <Route
        path="/*"
        element={<ProtectedRoute><AppShell><Outlet /></AppShell></ProtectedRoute>}
      >
        {/* Root */}
        <Route index element={<Navigate to={ROUTES.vaults} replace />} />

        {/* Auth (protected) */}
        <Route path="two-factor/setup" element={<TwoFactorSetupPage />} />

        {/* Vaults */}
        <Route path="vaults" element={<VaultsPage />} />
        <Route path="vaults/new" element={<Navigate to={ROUTES.vaults} replace />} />
        <Route path="vaults/:vaultId/settings" element={<VaultSettingsPage />} />
        <Route path="vaults/:vaultId/documents" element={<DocumentsPage />} />
        <Route path="vaults/:vaultId/documents/trash" element={<DocumentTrashPage />} />
        <Route path="vaults/:vaultId/documents/:documentId/chat" element={<DocumentDetailPage />} />
        <Route path="vaults/:vaultId/documents/:documentId" element={<DocumentDetailPage />} />
        <Route path="vaults/:vaultId/chat" element={<ChatPage />} />
        <Route path="vaults/:vaultId/tags" element={<TagsPage />} />

        {/* Documents */}
        <Route path="documents" element={<AllDocumentsPage />} />
        <Route path="documents/trash" element={<DocumentTrashPage />} />
        <Route path="documents/:vaultId/:documentId" element={<DocumentDetailPage />} />

        {/* Chat (global) */}
        <Route path="chat" element={<ChatPage />} />

        {/* Tags (global) */}
        <Route path="tags" element={<TagsPage />} />

        {/* Transfers */}
        <Route path="transfers" element={<TransfersPage />} />

        {/* Search */}
        <Route path="search" element={<SearchPage />} />

        {/* Settings */}
        <Route path="settings" element={<SettingsPage />} />

        {/* Admin */}
        <Route path="admin" element={<AdminPage />} />

        {/* About */}
        <Route path="about" element={<AboutPage />} />

        {/* Catch-all fallback */}
        <Route path="*" element={<Navigate to={ROUTES.vaults} replace />} />
      </Route>
    </Routes>
  );
}
