import type { AdminUser } from '@/features/admin/admin.types';

export function formatCount(value: number | undefined, singular: string, plural = `${singular}s`) {
  const safeValue = value ?? 0;
  return `${safeValue} ${safeValue === 1 ? singular : plural}`;
}

export function getUserRoleLabel(user: AdminUser) {
  return user.isAdmin ? 'Admin' : 'Member';
}
