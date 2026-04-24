import { fetchJson } from '@/lib/api';
import type {
  AdminAiAvailability,
  AdminAiModel,
  AdminAiSettings,
  AdminUser,
  AdminVault,
  BackupListItem,
} from './admin.types';

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

export async function grantVaultCreator({ userId }: { userId: string }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/vault-creator`, {
    method: 'POST',
  });
}

export async function revokeVaultCreator({ userId }: { userId: string }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/vault-creator`, {
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

export async function getAdminAiSettings() {
  return fetchJson<{ settings: AdminAiSettings }>('/api/admin/ai/settings');
}

export async function updateAdminAiSettings(settings: AdminAiSettings) {
  return fetchJson<{ settings: AdminAiSettings }>('/api/admin/ai/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function listOllamaModels({ host }: { host: string }) {
  return fetchJson<{ models: AdminAiModel[] }>('/api/admin/ai/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host }),
  });
}

export async function checkOllamaModelAvailability({
  host,
  model,
}: {
  host: string;
  model: string;
}) {
  return fetchJson<{ availability: AdminAiAvailability }>('/api/admin/ai/availability', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host, model }),
  });
}
