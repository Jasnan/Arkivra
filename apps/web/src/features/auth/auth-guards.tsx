import type { PropsWithChildren } from 'react';
import { Flex } from '@chakra-ui/react';
import { Navigate } from 'react-router-dom';
import { authClient } from '@/lib/auth-client';

function AuthLoadingState() {
  return (
    <Flex minH="100vh" align="center" justify="center" bg="bg.muted" fontSize="sm" color="fg.muted">
      Checking session...
    </Flex>
  );
}

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <AuthLoadingState />;
  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <AuthLoadingState />;
  if (session) return <Navigate to="/" replace />;

  return <>{children}</>;
}
