import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { Flex } from '@chakra-ui/react';
import { Navigate, useLocation } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { authClient } from '@/lib/auth-client';
import { AppShell } from '@/components/layout/app-shell';

function AuthLoadingState() {
  return (
    <Flex minH="100vh" align="center" justify="center" bg="bg.muted" fontSize="sm" color="fg.muted">
      Checking session...
    </Flex>
  );
}

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();

  useEffect(() => {
    console.log('[ProtectedRoute] render', { pathname: location.pathname, hasSession: !!session, isPending });
  });

  if (isPending) return <AuthLoadingState />;
  if (!session) return <Navigate to={ROUTES.login} replace />;

  return <>{children}</>;
}

export function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();

  useEffect(() => {
    console.log('[ProtectedLayout] render', { pathname: location.pathname, hasSession: !!session, isPending });
  });

  if (isPending) return <AuthLoadingState />;
  if (!session) return <Navigate to={ROUTES.login} replace />;

  return <AppShell />;
}

export function PublicOnlyRoute({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <AuthLoadingState />;
  if (session) return <Navigate to={ROUTES.root} replace />;

  return <>{children}</>;
}
