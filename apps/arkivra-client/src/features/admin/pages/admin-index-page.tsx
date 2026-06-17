import { Navigate } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';

export function AdminIndexPage() {
  return <Navigate to={ROUTES.adminOverview} />;
}
