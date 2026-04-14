import { fetchJson } from '@/lib/api';
import type { AdminUser, AdminVault, BackupListItem } from './admin.types';

export async function listAdminUsers() {
  return fetchJson<{ users: AdminUser[] }>('/api/admin/users');
}

export async function updateAdminUser({
  userId,
  disabled,
}: {
  userId: string;
  disabled: boolean;
}) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ disabled }),
  });
}

export async function grantGlobalAdmin({ userId }: { userId: string }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/global-admin`, {
    method: 'POST',
  });
}

export async function revokeGlobalAdmin({ userId }: { userId: string }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/global-admin`, {
    method: 'DELETE',
  });
}

export async function listAdminVaults() {
  return fetchJson<{ vaults: AdminVault[] }>('/api/admin/vaults');
}

export async function listBackups() {
  return fetchJson<{ backups: BackupListItem[] }>('/api/admin/backups');
}

export async function createBackup() {
  return fetchJson<{ jobId: string }>('/api/admin/backups', {
    method: 'POST',
  });
}

export async function restoreBackup({ backupId }: { backupId: string }) {
  return fetchJson<{ jobId: string }>('/api/admin/backups/restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ backupId }),
  });
}

export function getBackupDownloadUrl({ backupId }: { backupId: string }) {
  return `/api/admin/backups/${backupId}/download`;
}
