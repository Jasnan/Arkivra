import { Navigate } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';

export function SettingsIndexPage() {
  return <Navigate to={ROUTES.settingsAccount} />;
}
