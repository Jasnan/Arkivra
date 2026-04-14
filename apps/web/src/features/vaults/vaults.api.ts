import { fetchJson } from '@/lib/api';
import type { VaultDetail, VaultMember, VaultMemberPermission, VaultSummary } from './vaults.types';

interface VaultsListResponse {
  vaults: VaultSummary[];
}

interface VaultDetailResponse {
  vault: VaultDetail;
}

interface VaultMembersResponse {
  members: VaultMember[];
}

export async function listVaults() {
  return fetchJson<VaultsListResponse>('/api/vaults');
}

export async function createVault({ name }: { name: string }) {
  return fetchJson<VaultDetailResponse>('/api/vaults', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function getVault({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultDetailResponse>(`/api/vaults/${vaultId}`);
}

export async function renameVault({ vaultId, name }: { vaultId: string; name: string }) {
  return fetchJson<VaultDetailResponse>(`/api/vaults/${vaultId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function deleteVault({ vaultId }: { vaultId: string }) {
  await fetchJson<void>(`/api/vaults/${vaultId}`, {
    method: 'DELETE',
  });
}

export async function listVaultMembers({ vaultId }: { vaultId: string }) {
  return fetchJson<VaultMembersResponse>(`/api/vaults/${vaultId}/members`);
}

export async function addVaultMember(
  {
    vaultId,
    userId,
    role,
    permissions,
  }: {
    vaultId: string;
    userId: string;
    role: 'owner' | 'member';
    permissions: VaultMemberPermission[];
  },
) {
  return fetchJson<{ member: VaultMember }>(`/api/vaults/${vaultId}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, role, permissions }),
  });
}

export async function updateVaultMember(
  {
    vaultId,
    memberUserId,
    role,
    permissions,
  }: {
    vaultId: string;
    memberUserId: string;
    role: 'owner' | 'member';
    permissions: VaultMemberPermission[];
  },
) {
  return fetchJson<{ member: VaultMember }>(`/api/vaults/${vaultId}/members/${memberUserId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, permissions }),
  });
}

export async function removeVaultMember({ vaultId, memberUserId }: { vaultId: string; memberUserId: string }) {
  await fetchJson<void>(`/api/vaults/${vaultId}/members/${memberUserId}`, {
    method: 'DELETE',
  });
}

export async function transferVaultOwnership({ vaultId, userId }: { vaultId: string; userId: string }) {
  return fetchJson<{ member: VaultMember }>(`/api/vaults/${vaultId}/ownership`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}
