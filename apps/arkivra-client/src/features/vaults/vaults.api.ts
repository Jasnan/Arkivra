import { fetchJson } from '@/lib/api';
import type {
  AiAccessLevel,
  EmailInvitation,
  PermissionRequest,
  VaultDetail,
  VaultMember,
  VaultPendingInvitation,
  VaultRole,
  VaultSummary,
} from './vaults.types';

interface VaultsListResponse {
  vaults: VaultSummary[];
}

interface VaultDetailResponse {
  vault: VaultDetail;
}

interface PermissionRequestResponse {
  request: PermissionRequest;
}

interface VaultMembersResponse {
  members: VaultMember[];
}

interface VaultPendingInvitationsResponse {
  invitations: VaultPendingInvitation[];
}

export async function listVaults() {
  return fetchJson<VaultsListResponse>('/api/vaults');
}

export async function createVault({ name, description }: { name: string; description: string | null }) {
  return fetchJson<VaultDetailResponse | PermissionRequestResponse>('/api/vaults', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function getVault({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultDetailResponse>(`/api/vaults/${vaultId}`);
}

export async function renameVault({
  vaultId,
  name,
  description,
}: {
  vaultId: string;
  name: string;
  description: string | null;
}) {
  return fetchJson<VaultDetailResponse>(`/api/vaults/${vaultId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteVault({ vaultId }: { vaultId: string }) {
  return fetchJson<void | PermissionRequestResponse>(`/api/vaults/${vaultId}`, {
    method: 'DELETE',
  });
}

export async function listVaultMembers({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultMembersResponse>(`/api/vaults/${vaultId}/members`);
}

export async function listVaultPendingInvitations({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultPendingInvitationsResponse>(`/api/vaults/${vaultId}/invitations`);
}

export async function addVaultMember(
  {
    vaultId,
    userId,
    role,
    aiAccessLevel,
  }: {
    vaultId: string;
    userId: string;
    role: VaultRole;
    aiAccessLevel: AiAccessLevel;
  },
) {
  return fetchJson<{ member: VaultMember } | PermissionRequestResponse>(`/api/vaults/${vaultId}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, role, aiAccessLevel }),
  });
}

export async function updateVaultMember(
  {
    vaultId,
    memberUserId,
    role,
    aiAccessLevel,
  }: {
    vaultId: string;
    memberUserId: string;
    role: VaultRole;
    aiAccessLevel: AiAccessLevel;
  },
) {
  return fetchJson<{ member: VaultMember } | PermissionRequestResponse>(`/api/vaults/${vaultId}/members/${memberUserId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, aiAccessLevel }),
  });
}

export async function removeVaultMember({ vaultId, memberUserId }: { vaultId: string; memberUserId: string }) {
  await fetchJson<void>(`/api/vaults/${vaultId}/members/${memberUserId}`, {
    method: 'DELETE',
  });
}

export async function joinVaultAsAdmin({
  vaultId,
  role,
  aiAccessLevel,
}: {
  vaultId: string;
  role: VaultRole;
  aiAccessLevel: AiAccessLevel;
}) {
  return fetchJson<{ member: VaultMember }>(`/api/vaults/${vaultId}/membership/self`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, aiAccessLevel }),
  });
}

export async function leaveVaultAsAdmin({ vaultId }: { vaultId: string }) {
  await fetchJson<void>(`/api/vaults/${vaultId}/membership/self`, {
    method: 'DELETE',
  });
}

export async function transferVaultOwnership({ vaultId, userId }: { vaultId: string; userId: string }) {
  return fetchJson<{ member: VaultMember } | PermissionRequestResponse>(`/api/vaults/${vaultId}/ownership`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

export async function createVaultEmailInvitation({
  vaultId,
  email,
  role,
  aiAccessLevel,
  expiresAt,
}: {
  vaultId: string;
  email: string;
  role: VaultRole;
  aiAccessLevel: AiAccessLevel;
  expiresAt?: string | null;
}) {
  return fetchJson<{ invitation: EmailInvitation } | PermissionRequestResponse>(`/api/vaults/${vaultId}/email-invitations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      role,
      aiAccessLevel,
      expiresAt: expiresAt ?? null,
    }),
  });
}
