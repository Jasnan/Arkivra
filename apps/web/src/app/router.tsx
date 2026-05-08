/* eslint-disable react-refresh/only-export-components */
import { Navigate, Route, Routes } from 'react-router-dom';
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
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>} />
      <Route path="/request-password-reset" element={<PublicOnlyRoute><RequestPasswordResetPage /></PublicOnlyRoute>} />
      <Route path="/reset-password" element={<PublicOnlyRoute><ResetPasswordPage /></PublicOnlyRoute>} />
      <Route path="/two-factor/verify" element={<PublicOnlyRoute><TwoFactorVerifyPage /></PublicOnlyRoute>} />

      <Route path="/" element={<ProtectedRoute><AppShell><Routes>
        <Route index element={<Navigate to="/vaults" replace />} />
        <Route path="two-factor/setup" element={<TwoFactorSetupPage />} />
        <Route path="vaults" element={<VaultsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="vaults/new" element={<Navigate to="/vaults" replace />} />
        <Route path="vaults/:vaultId/settings" element={<VaultSettingsPage />} />
        <Route path="documents" element={<AllDocumentsPage />} />
        <Route path="documents/:vaultId/:documentId" element={<DocumentDetailPage />} />
        <Route path="documents/trash" element={<DocumentTrashPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="vaults/:vaultId/documents" element={<DocumentsPage />} />
        <Route path="vaults/:vaultId/chat" element={<ChatPage />} />
        <Route path="vaults/:vaultId/documents/trash" element={<DocumentTrashPage />} />
        <Route path="vaults/:vaultId/documents/:documentId" element={<DocumentDetailPage />} />
        <Route path="vaults/:vaultId/documents/:documentId/chat" element={<DocumentDetailPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="vaults/:vaultId/tags" element={<TagsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/vaults" replace />} />
      </Routes></AppShell></ProtectedRoute>} />
    </Routes>
  );
}
