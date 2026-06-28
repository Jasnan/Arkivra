import { fetchJson } from '@/lib/api';
import type {
  AdminAiAvailability,
  AdminAiModel,
  AdminAiSettings,
  AdminAiStatus,
  AdminOfficeConverterStatus,
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
    aiAccessLevel: 'none' | 'full';
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

export function getBackupPartDownloadUrl({
  backupId,
  partFileName,
}: {
  backupId: string;
  partFileName: string;
}) {
  return `/api/admin/backups/${backupId}/parts/${partFileName}/download`;
}

export interface BackupArchiveManifest {
  id: string;
  archive: {
    parts: Array<{ fileName: string; index: number; size: number; sha256: string }>;
  };
}

export async function importBackupManifest({ manifest }: { manifest: BackupArchiveManifest }) {
  return fetchJson<{ backupId: string; partCount: number }>('/api/admin/backups/imports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ manifest }),
  });
}

export async function uploadBackupPart({
  backupId,
  file,
}: {
  backupId: string;
  file: File;
}) {
  return fetchJson<{ uploaded: true }>(
    `/api/admin/backups/imports/${backupId}/parts/${encodeURIComponent(file.name)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
    },
  );
}

export async function getBootstrapRestoreStatus() {
  return fetchJson<{
    available: boolean;
    reason: string | null;
    archiveEncryptionConfigured: boolean;
  }>('/api/restore/bootstrap/status');
}

export async function importBootstrapBackupManifest({
  manifest,
  token,
}: {
  manifest: BackupArchiveManifest;
  token: string;
}) {
  return fetchJson<{ backupId: string; partCount: number }>('/api/restore/bootstrap/imports', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-arkivra-restore-token': token,
    },
    body: JSON.stringify({ manifest }),
  });
}

export async function uploadBootstrapBackupPart({
  backupId,
  file,
  token,
}: {
  backupId: string;
  file: File;
  token: string;
}) {
  return fetchJson<{ uploaded: true }>(
    `/api/restore/bootstrap/imports/${backupId}/parts/${encodeURIComponent(file.name)}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/octet-stream',
        'x-arkivra-restore-token': token,
      },
      body: file,
    },
  );
}

export async function restoreBootstrapBackup({
  backupId,
  token,
}: {
  backupId: string;
  token: string;
}) {
  return fetchJson<{ jobId: string }>('/api/restore/bootstrap/restore', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-arkivra-restore-token': token,
    },
    body: JSON.stringify({ backupId }),
  });
}

export async function getAdminOfficeConverterStatus() {
  return fetchJson<{ officeConverter: AdminOfficeConverterStatus }>(
    '/api/admin/maintenance/office-converter/status',
  );
}

export async function scheduleMissingOfficePreviews() {
  return fetchJson<{ job: { type: 'generate-office-preview-pdfs'; status: 'queued' } }>(
    '/api/admin/maintenance/office-preview-pdfs',
    {
      method: 'POST',
    },
  );
}

export async function getAdminAiSettings() {
  return fetchJson<{ settings: AdminAiSettings }>('/api/admin/ai/settings');
}

export async function getAdminAiStatus() {
  return fetchJson<{ status: AdminAiStatus }>('/api/admin/ai/status');
}

export async function listAdminAiProviderModels({
  host,
  provider,
  includeEmbeddingModels,
  apiKeySecretRef,
}: {
  host: string;
  provider?: AdminAiSettings['chat']['provider'];
  includeEmbeddingModels?: boolean;
  apiKeySecretRef?: string | null;
}) {
  return fetchJson<{ models: AdminAiModel[] }>('/api/admin/ai/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host, provider, includeEmbeddingModels, apiKeySecretRef }),
  });
}

export async function updateAdminAiSettings(settings: AdminAiSettings) {
  return fetchJson<{ settings: AdminAiSettings }>('/api/admin/ai/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function checkAiModelAvailability({
  host,
  model,
  provider,
  apiKeySecretRef,
}: {
  host: string;
  model: string;
  provider?: AdminAiSettings['chat']['provider'];
  apiKeySecretRef?: string | null;
}) {
  return fetchJson<{ availability: AdminAiAvailability }>('/api/admin/ai/availability', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host, model, provider, apiKeySecretRef }),
  });
}
