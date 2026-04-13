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
import { DashboardPage } from '@/features/dashboard/dashboard-page';

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
          element: <DashboardPage />,
        },
        {
          path: 'two-factor/setup',
          element: <TwoFactorSetupPage />,
        },
        {
          path: '*',
          element: <Navigate to="/" replace />,
        },
      ],
    },
  ]);
}
