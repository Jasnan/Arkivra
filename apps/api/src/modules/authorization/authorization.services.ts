import type { Database } from '../database/database.js';
import type {
  AiAccessLevel,
  SystemCapability,
  SystemRole,
  VaultAuthorizationState,
  VaultRole,
} from './authorization.types.js';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  authAccountsTable,
  systemCapabilitiesTable,
  usersTable,
  vaultMembersTable,
  vaultsTable,
} from '../database/schema/index.js';

const CREATE_VAULTS_CAPABILITY = 'system.create_vaults' satisfies SystemCapability;

function isRootRole(role: SystemRole) {
  return role === 'root';
}

function canVaultRoleRead(role: VaultRole | null) {
  return role === 'owner' || role === 'editor' || role === 'viewer';
}

function canVaultRoleMutateDocuments(role: VaultRole | null) {
  return role === 'owner' || role === 'editor';
}

function canVaultRoleManageMembers(role: VaultRole | null) {
  return role === 'owner';
}

function canUseDocumentChatLevel(aiAccessLevel: AiAccessLevel) {
  return aiAccessLevel === 'document_chat' || aiAccessLevel === 'full';
}

function canUseSemanticRetrievalLevel(aiAccessLevel: AiAccessLevel) {
  return aiAccessLevel === 'full';
}

export function createAuthorizationServices({ db }: { db: Database }) {
  async function ensureBootstrapRoot({ userId }: { userId: string }) {
    const [existingRoot] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.systemRole, 'root'), isNull(usersTable.disabledAt)))
      .limit(1);

    if (existingRoot !== undefined) {
      return false;
    }

    const [oldestUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .orderBy(asc(usersTable.createdAt))
      .limit(1);

    if (oldestUser?.id !== userId) {
      return false;
    }

    await db
      .update(usersTable)
      .set({ systemRole: 'root', updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    return true;
  }

  async function listSystemCapabilitiesForUser({ userId }: { userId: string }) {
    const rows = await db
      .select({ capability: systemCapabilitiesTable.capability })
      .from(systemCapabilitiesTable)
      .where(eq(systemCapabilitiesTable.userId, userId));

    return rows.map(row => row.capability as SystemCapability);
  }

  async function getUserAuthorizationState({ userId }: { userId: string }) {
    const [user] = await db
      .select({
        id: usersTable.id,
        disabledAt: usersTable.disabledAt,
        systemRole: usersTable.systemRole,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (user === undefined) {
      return null;
    }

    const systemCapabilities = await listSystemCapabilitiesForUser({ userId });
    const isRoot = isRootRole(user.systemRole as SystemRole);
    const canCreateVault = isRoot || systemCapabilities.includes(CREATE_VAULTS_CAPABILITY);

    return {
      userId: user.id,
      disabledAt: user.disabledAt,
      systemRole: user.systemRole as SystemRole,
      systemCapabilities,
      isRoot,
      canCreateVault,
      // Deprecated response compatibility until UI/API terminology is fully renamed.
      globalRoles: [
        ...(isRoot ? ['global_admin' as const] : []),
        ...(systemCapabilities.includes(CREATE_VAULTS_CAPABILITY)
          ? ['vault_creator' as const]
          : []),
      ],
      isGlobalAdmin: isRoot,
    };
  }

  async function countActiveRoots() {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.systemRole, 'root'), isNull(usersTable.disabledAt)));

    return row?.count ?? 0;
  }

  async function listUsers() {
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        emailVerified: usersTable.emailVerified,
        twoFactorEnabled: usersTable.twoFactorEnabled,
        systemRole: usersTable.systemRole,
        disabledAt: usersTable.disabledAt,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .orderBy(asc(usersTable.createdAt));

    const capabilities =
      users.length === 0
        ? []
        : await db
            .select({
              userId: systemCapabilitiesTable.userId,
              capability: systemCapabilitiesTable.capability,
            })
            .from(systemCapabilitiesTable)
            .where(
              inArray(
                systemCapabilitiesTable.userId,
                users.map(user => user.id),
              ),
            );

    const capabilitiesByUserId = new Map<string, SystemCapability[]>();

    for (const capability of capabilities) {
      const current = capabilitiesByUserId.get(capability.userId) ?? [];
      current.push(capability.capability as SystemCapability);
      capabilitiesByUserId.set(capability.userId, current);
    }

    const accounts =
      users.length === 0
        ? []
        : await db
            .select({
              userId: authAccountsTable.userId,
              providerId: authAccountsTable.providerId,
              password: authAccountsTable.password,
            })
            .from(authAccountsTable)
            .where(
              inArray(
                authAccountsTable.userId,
                users.map(user => user.id),
              ),
            );

    const accountsByUserId = new Map<string, typeof accounts>();

    for (const account of accounts) {
      const current = accountsByUserId.get(account.userId) ?? [];
      current.push(account);
      accountsByUserId.set(account.userId, current);
    }

    return users.map((user) => {
      const systemRole = user.systemRole as SystemRole;
      const systemCapabilities = capabilitiesByUserId.get(user.id) ?? [];
      const isRoot = isRootRole(systemRole);
      const canCreateVault = isRoot || systemCapabilities.includes(CREATE_VAULTS_CAPABILITY);

      return {
        ...user,
        systemRole,
        systemCapabilities,
        isRoot,
        canCreateVault,
        // Deprecated response compatibility until UI/API terminology is fully renamed.
        globalRoles: [
          ...(isRoot ? ['global_admin' as const] : []),
          ...(systemCapabilities.includes(CREATE_VAULTS_CAPABILITY)
            ? ['vault_creator' as const]
            : []),
        ],
        isGlobalAdmin: isRoot,
        authMethods: {
          hasPassword: (accountsByUserId.get(user.id) ?? []).some(account => account.providerId === 'credential' && account.password),
          oauthProviders: (accountsByUserId.get(user.id) ?? [])
            .filter(account => account.providerId !== 'credential')
            .map(account => account.providerId),
          primaryOAuthProvider: (accountsByUserId.get(user.id) ?? []).find(account => account.providerId !== 'credential')?.providerId ?? null,
        },
      };
    });
  }

  async function getUserWithAuthorization({ userId }: { userId: string }) {
    const users = await listUsers();
    return users.find(user => user.id === userId) ?? null;
  }

  async function setUserDisabled({ userId, disabled }: { userId: string; disabled: boolean }) {
    const user = await getUserWithAuthorization({ userId });

    if (user === null) {
      return null;
    }

    if (disabled && user.isRoot && user.disabledAt === null) {
      const activeRootCount = await countActiveRoots();

      if (activeRootCount <= 1) {
        throw new Error('authorization.last_root');
      }
    }

    await db
      .update(usersTable)
      .set({
        disabledAt: disabled ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return getUserWithAuthorization({ userId });
  }

  async function grantRoot({ userId }: { userId: string }) {
    const user = await getUserWithAuthorization({ userId });

    if (user === null) {
      return null;
    }

    await db
      .update(usersTable)
      .set({ systemRole: 'root', updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    return getUserWithAuthorization({ userId });
  }

  async function revokeRoot({ userId }: { userId: string }) {
    const user = await getUserWithAuthorization({ userId });

    if (user === null) {
      return null;
    }

    if (user.isRoot && user.disabledAt === null) {
      const activeRootCount = await countActiveRoots();

      if (activeRootCount <= 1) {
        throw new Error('authorization.last_root');
      }
    }

    await db
      .update(usersTable)
      .set({ systemRole: 'member', updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    return getUserWithAuthorization({ userId });
  }

  async function grantSystemCapability({
    userId,
    capability,
    createdBy,
  }: {
    userId: string;
    capability: SystemCapability;
    createdBy?: string | null;
  }) {
    const user = await getUserWithAuthorization({ userId });

    if (user === null) {
      return null;
    }

    await db
      .insert(systemCapabilitiesTable)
      .values({ userId, capability, createdBy: createdBy ?? null })
      .onConflictDoNothing();

    return getUserWithAuthorization({ userId });
  }

  async function revokeSystemCapability({
    userId,
    capability,
  }: {
    userId: string;
    capability: SystemCapability;
  }) {
    const user = await getUserWithAuthorization({ userId });

    if (user === null) {
      return null;
    }

    await db
      .delete(systemCapabilitiesTable)
      .where(
        and(
          eq(systemCapabilitiesTable.userId, userId),
          eq(systemCapabilitiesTable.capability, capability),
        ),
      );

    return getUserWithAuthorization({ userId });
  }

  async function getVaultAuthorizationState({
    vaultId,
    userId,
  }: {
    vaultId: string;
    userId: string;
  }): Promise<VaultAuthorizationState | null> {
    const userState = await getUserAuthorizationState({ userId });

    if (userState === null || userState.disabledAt !== null) {
      return null;
    }

    const [member] = await db
      .select({
        vaultId: vaultsTable.id,
        role: vaultMembersTable.role,
        aiAccessLevel: vaultMembersTable.aiAccessLevel,
      })
      .from(vaultsTable)
      .leftJoin(
        vaultMembersTable,
        and(eq(vaultMembersTable.vaultId, vaultsTable.id), eq(vaultMembersTable.userId, userId)),
      )
      .where(and(eq(vaultsTable.id, vaultId), isNull(vaultsTable.deletedAt)))
      .limit(1);

    if (member === undefined) {
      return null;
    }

    const role = member.role as VaultRole | null;
    const aiAccessLevel = (member.aiAccessLevel ?? 'none') as AiAccessLevel;

    if (!userState.isRoot && role === null) {
      return null;
    }

    return {
      userId,
      vaultId,
      isRoot: userState.isRoot,
      role,
      aiAccessLevel,
    };
  }

  function canAccessVault(state: VaultAuthorizationState | null) {
    return state !== null && (state.isRoot || canVaultRoleRead(state.role));
  }

  function canReadVault(state: VaultAuthorizationState | null) {
    return canAccessVault(state);
  }

  function canManageVault(state: VaultAuthorizationState | null) {
    return state !== null && (state.isRoot || state.role === 'owner');
  }

  function canManageVaultMembers(state: VaultAuthorizationState | null) {
    return state !== null && (state.isRoot || canVaultRoleManageMembers(state.role));
  }

  function canMutateVaultDocuments(state: VaultAuthorizationState | null) {
    return state !== null && (state.isRoot || canVaultRoleMutateDocuments(state.role));
  }

  async function canCreateVault({ userId }: { userId: string }) {
    const state = await getUserAuthorizationState({ userId });
    return state?.disabledAt === null && state.canCreateVault;
  }

  function canUseDocumentChat(state: VaultAuthorizationState | null) {
    return state !== null && canUseDocumentChatLevel(state.aiAccessLevel);
  }

  async function getReadableVaultIdsForUser({ userId }: { userId: string }) {
    const state = await getUserAuthorizationState({ userId });

    if (state === null || state.disabledAt !== null) {
      return [];
    }

    if (state.isRoot) {
      const rows = await db
        .select({ id: vaultsTable.id })
        .from(vaultsTable)
        .where(isNull(vaultsTable.deletedAt));

      return rows.map(row => row.id);
    }

    const rows = await db
      .select({ id: vaultMembersTable.vaultId })
      .from(vaultMembersTable)
      .innerJoin(vaultsTable, eq(vaultMembersTable.vaultId, vaultsTable.id))
      .where(and(eq(vaultMembersTable.userId, userId), isNull(vaultsTable.deletedAt)));

    return rows.map(row => row.id);
  }

  async function getAiAuthorizedVaultIdsForUser({ userId }: { userId: string }) {
    const state = await getUserAuthorizationState({ userId });

    if (state === null || state.disabledAt !== null) {
      return [];
    }

    const rows = await db
      .select({ id: vaultMembersTable.vaultId })
      .from(vaultMembersTable)
      .innerJoin(vaultsTable, eq(vaultMembersTable.vaultId, vaultsTable.id))
      .where(
        and(
          eq(vaultMembersTable.userId, userId),
          eq(vaultMembersTable.aiAccessLevel, 'full'),
          isNull(vaultsTable.deletedAt),
        ),
      );

    return rows.map(row => row.id);
  }

  async function canUseGlobalChat({ userId }: { userId: string }) {
    const vaultIds = await getAiAuthorizedVaultIdsForUser({ userId });
    return vaultIds.length > 0;
  }

  function canUseSemanticRetrieval(state: VaultAuthorizationState | null) {
    return state !== null && canUseSemanticRetrievalLevel(state.aiAccessLevel);
  }

  async function grantGlobalAdmin({ userId }: { userId: string }) {
    return grantRoot({ userId });
  }

  async function revokeGlobalAdmin({ userId }: { userId: string }) {
    try {
      return await revokeRoot({ userId });
    } catch (error) {
      if (error instanceof Error && error.message === 'authorization.last_root') {
        throw new Error('authorization.last_global_admin');
      }

      throw error;
    }
  }

  async function grantVaultCreator({ userId }: { userId: string }) {
    return grantSystemCapability({ userId, capability: CREATE_VAULTS_CAPABILITY });
  }

  async function revokeVaultCreator({ userId }: { userId: string }) {
    return revokeSystemCapability({ userId, capability: CREATE_VAULTS_CAPABILITY });
  }

  return {
    canAccessVault,
    canCreateVault,
    canManageVault,
    canManageVaultMembers,
    canMutateVaultDocuments,
    canReadVault,
    canUseDocumentChat,
    canUseGlobalChat,
    canUseSemanticRetrieval,
    countActiveGlobalAdmins: countActiveRoots,
    countActiveRoots,
    ensureBootstrapGlobalAdmin: ensureBootstrapRoot,
    ensureBootstrapRoot,
    getAiAuthorizedVaultIdsForUser,
    getReadableVaultIdsForUser,
    getUserAuthorizationState,
    getUserWithAuthorization,
    getUserWithRoles: getUserWithAuthorization,
    getVaultAuthorizationState,
    grantGlobalAdmin,
    grantRoot,
    grantSystemCapability,
    grantVaultCreator,
    listGlobalRolesForUser: listSystemCapabilitiesForUser,
    listSystemCapabilitiesForUser,
    listUsers,
    revokeGlobalAdmin,
    revokeRoot,
    revokeSystemCapability,
    revokeVaultCreator,
    setUserDisabled,
  };
}

export type AuthorizationServices = ReturnType<typeof createAuthorizationServices>;
