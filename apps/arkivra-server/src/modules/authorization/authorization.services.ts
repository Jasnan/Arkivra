import type { Database } from '../database/database.js';
import type {
  EmailInvitationType,
  SystemCapability,
  SystemRole,
  VaultAuthorizationState,
  VaultRole,
} from './authorization.types.js';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  authAccountsTable,
  emailInvitationsTable,
  systemCapabilitiesTable,
  usersTable,
  vaultMembersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createPermissionRequestServices } from './authorization.permission-requests.js';
import {
  canVaultRoleRead,
  CREATE_VAULTS_CAPABILITY,
  getInvitationSystemCapabilities,
  isAdminRole,
  normalizeEmail,
  USE_AI_CAPABILITY,
} from './authorization.rules.js';

export function createAuthorizationServices({ db }: { db: Database }) {
  async function ensureBootstrapAdmin({ userId }: { userId: string }) {
    const [existingAdmin] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.systemRole, 'admin'), isNull(usersTable.disabledAt)))
      .limit(1);

    if (existingAdmin !== undefined) {
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
      .set({ systemRole: 'admin', updatedAt: sql`now()` })
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

  async function hasAnyUsers() {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    return (row?.count ?? 0) > 0;
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
    const isAdmin = isAdminRole(user.systemRole as SystemRole);
    const canCreateVault = isAdmin || systemCapabilities.includes(CREATE_VAULTS_CAPABILITY);
    const canUseAI = isAdmin || systemCapabilities.includes(USE_AI_CAPABILITY);

    return {
      userId: user.id,
      disabledAt: user.disabledAt,
      systemRole: user.systemRole as SystemRole,
      systemCapabilities,
      isAdmin,
      canCreateVault,
      canUseAI,
    };
  }

  async function countActiveAdmins() {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.systemRole, 'admin'), isNull(usersTable.disabledAt)));

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
      const isAdmin = isAdminRole(systemRole);
      const canCreateVault = isAdmin || systemCapabilities.includes(CREATE_VAULTS_CAPABILITY);
      const canUseAI = isAdmin || systemCapabilities.includes(USE_AI_CAPABILITY);

      return {
        ...user,
        systemRole,
        systemCapabilities,
        isAdmin,
        canCreateVault,
        canUseAI,
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

    if (disabled && user.isAdmin && user.disabledAt === null) {
      const activeAdminCount = await countActiveAdmins();

      if (activeAdminCount <= 1) {
        throw new Error('authorization.last_admin');
      }
    }

    await db
      .update(usersTable)
      .set({
        disabledAt: disabled ? sql`now()` : null,
        updatedAt: sql`now()`,
      })
      .where(eq(usersTable.id, userId));

    return getUserWithAuthorization({ userId });
  }

  async function grantAdmin({ userId }: { userId: string }) {
    const user = await getUserWithAuthorization({ userId });

    if (user === null) {
      return null;
    }

    await db
      .update(usersTable)
      .set({ systemRole: 'admin', updatedAt: sql`now()` })
      .where(eq(usersTable.id, userId));

    return getUserWithAuthorization({ userId });
  }

  async function revokeAdmin({ userId }: { userId: string }) {
    const user = await getUserWithAuthorization({ userId });

    if (user === null) {
      return null;
    }

    if (user.isAdmin && user.disabledAt === null) {
      const activeAdminCount = await countActiveAdmins();

      if (activeAdminCount <= 1) {
        throw new Error('authorization.last_admin');
      }
    }

    await db
      .update(usersTable)
      .set({ systemRole: 'member', updatedAt: sql`now()` })
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

  const permissionRequestServices = createPermissionRequestServices({ db });

  async function createEmailInvitation({
    type,
    email,
    invitedBy,
    vaultId = null,
    vaultRole = null,
    systemRole = null,
    expiresAt = null,
    payload = {},
  }: {
    type: EmailInvitationType;
    email: string;
    invitedBy?: string | null;
    vaultId?: string | null;
    vaultRole?: VaultRole | null;
    systemRole?: SystemRole | null;
    expiresAt?: Date | null;
    payload?: Record<string, unknown>;
  }) {
    const [invitation] = await db
      .insert(emailInvitationsTable)
      .values({
        type,
        email: normalizeEmail(email),
        invitedBy: invitedBy ?? null,
        vaultId,
        vaultRole,
        systemRole,
        expiresAt,
        payload,
      })
      .returning();

    if (invitation === undefined) {
      throw new Error('authorization.email_invitation_failed');
    }

    return invitation;
  }

  async function getPendingEmailInvitation({ invitationId, email }: { invitationId?: string; email: string }) {
    const normalizedEmail = normalizeEmail(email);
    await db
      .update(emailInvitationsTable)
      .set({ status: 'expired', updatedAt: sql`now()` })
      .where(and(
        ...(invitationId ? [eq(emailInvitationsTable.id, invitationId)] : []),
        eq(emailInvitationsTable.email, normalizedEmail),
        eq(emailInvitationsTable.status, 'pending'),
        sql`${emailInvitationsTable.expiresAt} IS NOT NULL`,
        sql`${emailInvitationsTable.expiresAt} <= now()`,
      ));

    const [invitation] = await db
      .select()
      .from(emailInvitationsTable)
      .where(and(
        ...(invitationId ? [eq(emailInvitationsTable.id, invitationId)] : []),
        eq(emailInvitationsTable.email, normalizedEmail),
        eq(emailInvitationsTable.status, 'pending'),
      ))
      .orderBy(desc(emailInvitationsTable.createdAt))
      .limit(1);

    if (invitation === undefined) {
      return null;
    }

    return invitation;
  }

  async function acceptEmailInvitation({
    invitationId,
    email,
    userId,
  }: {
    invitationId?: string;
    email: string;
    userId: string;
  }) {
    const invitation = await getPendingEmailInvitation({ invitationId, email });

    if (invitation === null) {
      return null;
    }

    return db.transaction(async (tx) => {
      let vaultMemberId: string | null = null;

      if (invitation.type === 'platform_account' && invitation.systemRole === 'admin') {
        await tx
          .update(usersTable)
          .set({ systemRole: 'admin', updatedAt: sql`now()` })
          .where(eq(usersTable.id, userId));
      }

      const systemCapabilities = getInvitationSystemCapabilities(invitation.payload);
      if (systemCapabilities.length > 0) {
        await tx
          .insert(systemCapabilitiesTable)
          .values(systemCapabilities.map(capability => ({
            userId,
            capability,
            createdBy: invitation.invitedBy,
          })))
          .onConflictDoNothing();
      }

      if (invitation.type === 'vault_member' && invitation.vaultId !== null && invitation.vaultRole !== null) {
        const [member] = await tx
          .insert(vaultMembersTable)
          .values({
            vaultId: invitation.vaultId,
            userId,
            role: invitation.vaultRole,
          })
          .onConflictDoUpdate({
            target: [vaultMembersTable.vaultId, vaultMembersTable.userId],
            set: {
              role: invitation.vaultRole,
              updatedAt: sql`now()`,
            },
          })
          .returning({ id: vaultMembersTable.id });

        vaultMemberId = member?.id ?? null;
      }

      const [accepted] = await tx
        .update(emailInvitationsTable)
        .set({
          status: 'accepted',
          acceptedBy: userId,
          acceptedAt: sql`now()`,
          vaultMemberId,
          updatedAt: sql`now()`,
        })
        .where(eq(emailInvitationsTable.id, invitation.id))
        .returning();

      return accepted ?? null;
    });
  }

  async function acceptEmailInvitationForRegisteredUser({
    invitationId,
    email,
  }: {
    invitationId?: string;
    email: string;
  }) {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizeEmail(email)))
      .limit(1);

    if (user === undefined) {
      return null;
    }

    return acceptEmailInvitation({ invitationId, email, userId: user.id });
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

    if (!userState.isAdmin && role === null) {
      return null;
    }

    return {
      userId,
      vaultId,
      isAdmin: userState.isAdmin,
      role,
      isMember: role !== null,
    };
  }

  function canReadVault(state: VaultAuthorizationState | null) {
    return state !== null && canVaultRoleRead(state.role);
  }

  async function canCreateVault({ userId }: { userId: string }) {
    const state = await getUserAuthorizationState({ userId });
    return state?.disabledAt === null && state.canCreateVault;
  }

  async function canUseAI({ userId }: { userId: string }) {
    const state = await getUserAuthorizationState({ userId });
    return state?.disabledAt === null && state.canUseAI;
  }

  return {
    canCreateVault,
    canUseAI,
    canReadVault,
    countActiveAdmins,
    acceptEmailInvitation,
    acceptEmailInvitationForRegisteredUser,
    createEmailInvitation,
    ensureBootstrapAdmin,
    getPendingEmailInvitation,
    getUserAuthorizationState,
    getUserWithAuthorization,
    getVaultAuthorizationState,
    grantAdmin,
    grantSystemCapability,
    hasAnyUsers,
    listSystemCapabilitiesForUser,
    listUsers,
    revokeAdmin,
    revokeSystemCapability,
    setUserDisabled,
    ...permissionRequestServices,
  };
}

export type AuthorizationServices = ReturnType<typeof createAuthorizationServices>;
