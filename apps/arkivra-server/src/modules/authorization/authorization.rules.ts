import type {
  AiAccessLevel,
  SystemCapability,
  SystemRole,
  VaultRole,
} from './authorization.types.js';

export const CREATE_VAULTS_CAPABILITY = 'system.create_vaults' satisfies SystemCapability;

export function isAdminRole(role: SystemRole) {
  return role === 'admin';
}

export function canVaultRoleRead(role: VaultRole | null) {
  return role === 'owner' || role === 'editor' || role === 'viewer';
}

export function canVaultRoleMutateDocuments(role: VaultRole | null) {
  return role === 'owner' || role === 'editor';
}

export function canVaultRoleManageMembers(role: VaultRole | null) {
  return role === 'owner';
}

export function canUseDocumentChatLevel(aiAccessLevel: AiAccessLevel) {
  return aiAccessLevel === 'full';
}

export function canUseSemanticRetrievalLevel(aiAccessLevel: AiAccessLevel) {
  return aiAccessLevel === 'full';
}

export function getAiAccessRank(aiAccessLevel: AiAccessLevel) {
  switch (aiAccessLevel) {
    case 'full':
      return 1;
    case 'none':
      return 0;
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getInvitationSystemCapabilities(payload: Record<string, unknown>) {
  const value = payload.systemCapabilities;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (capability): capability is SystemCapability => capability === CREATE_VAULTS_CAPABILITY,
  );
}

export function getInvitationVaultMemberships(payload: Record<string, unknown>) {
  const value = payload.vaultMemberships;
  if (!Array.isArray(value)) {
    return [] as Array<{ vaultId: string; role: VaultRole; aiAccessLevel: AiAccessLevel }>;
  }

  return value.flatMap(
    (item): Array<{ vaultId: string; role: VaultRole; aiAccessLevel: AiAccessLevel }> => {
      if (item === null || typeof item !== 'object') {
        return [];
      }

      const candidate = item as { vaultId?: unknown; role?: unknown; aiAccessLevel?: unknown };
      if (
        typeof candidate.vaultId !== 'string' ||
        (candidate.role !== 'owner' &&
          candidate.role !== 'editor' &&
          candidate.role !== 'viewer') ||
        (candidate.aiAccessLevel !== 'none' && candidate.aiAccessLevel !== 'full')
      ) {
        return [];
      }

      return [
        {
          vaultId: candidate.vaultId,
          role: candidate.role,
          aiAccessLevel: candidate.aiAccessLevel,
        },
      ];
    },
  );
}
