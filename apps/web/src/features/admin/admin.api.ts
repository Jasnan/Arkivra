import { fetchJson } from '@/lib/api';
import type {
  AdminAiAvailability,
  AdminAiModel,
  AdminAiSettings,
  AdminUser,
  AdminVault,
  BackupListItem,
  EmailInvitation,
  PermissionRequest,
  PermissionRequestStatus,
  SystemCapability,
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

export async function grantAdmin({ userId }: { userId: string }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/admin`, {
    method: 'POST',
  });
}

export async function revokeAdmin({ userId }: { userId: string }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/admin`, {
    method: 'DELETE',
  });
}

export async function grantSystemCapability({ userId, capability }: { userId: string; capability: SystemCapability }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/system-capabilities/${capability}`, {
    method: 'POST',
  });
}

export async function revokeSystemCapability({ userId, capability }: { userId: string; capability: SystemCapability }) {
  return fetchJson<{ user: AdminUser }>(`/api/admin/users/${userId}/system-capabilities/${capability}`, {
    method: 'DELETE',
  });
}

export async function listPermissionRequests({
  status = 'pending',
}: {
  status?: PermissionRequestStatus;
} = {}) {
  return fetchJson<{ requests: PermissionRequest[] }>(`/api/admin/permission-requests?status=${status}`);
}

export async function approvePermissionRequest({ requestId }: { requestId: string }) {
  return fetchJson<{ request: PermissionRequest }>(`/api/admin/permission-requests/${requestId}/approve`, {
    method: 'POST',
  });
}

export async function rejectPermissionRequest({
  requestId,
  reason,
}: {
  requestId: string;
  reason?: string | null;
}) {
  return fetchJson<{ request: PermissionRequest }>(`/api/admin/permission-requests/${requestId}/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: reason ?? null }),
  });
}

export async function createAdminEmailInvitation({
  email,
  systemRole = 'admin',
  systemCapabilities = [],
  vaultMemberships = [],
  expiresAt,
}: {
  email: string;
  systemRole?: 'admin' | 'member';
  systemCapabilities?: SystemCapability[];
  vaultMemberships?: Array<{
    vaultId: string;
    role: 'owner' | 'editor' | 'viewer';
    aiAccessLevel: 'none' | 'document_chat' | 'full';
  }>;
  expiresAt?: string | null;
}) {
  return fetchJson<{ invitation: EmailInvitation }>('/api/admin/email-invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'admin_account',
      email,
      systemRole,
      systemCapabilities,
      vaultMemberships,
      expiresAt: expiresAt ?? null,
    }),
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
