import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';
import { authClient } from '@/lib/auth-client';

function AuthLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Checking session...
    </div>
  );
}

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <AuthLoadingState />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <AuthLoadingState />;
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
