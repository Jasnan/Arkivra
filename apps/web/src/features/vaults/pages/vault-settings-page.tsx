import { Navigate, useParams } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';

export function VaultSettingsPage() {
  const params = useParams({ strict: false }) as { vaultId?: string };
  const vaultId = params.vaultId ?? '';

  if (!vaultId) {
    return null;
  }

  return <Navigate to={ROUTES.vaultRoot(vaultId)} search={{ tab: 'settings' }} replace />;
}
