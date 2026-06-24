import type { Database } from '../database/database.js';
import type { AiAccessLevel, VaultAccess, VaultRole } from './vaults.types.js';
import type { PermissionRequestType } from '../authorization/authorization.types.js';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  documentsTable,
  emailInvitationsTable,
  permissionRequestsTable,
  usersTable,
  vaultFoldersTable,
  vaultMembersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { createAuthorizationServices } from '../authorization/authorization.services.js';

export function createVaultsServices({ db }: { db: Database }) {
  const authorizationServices = createAuthorizationServices({ db });

  async function listUserVaults({ userId }: { userId: string }) {
    const userState = await authorizationServices.getUserAuthorizationState({ userId });

    if (userState === null || userState.disabledAt !== null) {
      return [];
    }

    const vaults = userState.isAdmin
      ? await db
          .select({
            id: vaultsTable.id,
            name: vaultsTable.name,
            description: vaultsTable.description,
            createdAt: vaultsTable.createdAt,
            updatedAt: vaultsTable.updatedAt,
            deletedAt: vaultsTable.deletedAt,
            role: vaultMembersTable.role,
            aiAccessLevel: vaultMembersTable.aiAccessLevel,
          })
          .from(vaultsTable)
          .leftJoin(
            vaultMembersTable,
            and(eq(vaultMembersTable.vaultId, vaultsTable.id), eq(vaultMembersTable.userId, userId)),
          )
          .where(isNull(vaultsTable.deletedAt))
          .orderBy(desc(vaultsTable.createdAt))
      : await db
          .select({
            id: vaultsTable.id,
            name: vaultsTable.name,
            description: vaultsTable.description,
            createdAt: vaultsTable.createdAt,
            updatedAt: vaultsTable.updatedAt,
            deletedAt: vaultsTable.deletedAt,
            role: vaultMembersTable.role,
            aiAccessLevel: vaultMembersTable.aiAccessLevel,
          })
          .from(vaultMembersTable)
          .innerJoin(vaultsTable, eq(vaultMembersTable.vaultId, vaultsTable.id))
          .where(and(eq(vaultMembersTable.userId, userId), isNull(vaultsTable.deletedAt)))
          .orderBy(desc(vaultsTable.createdAt));

    const fileStatsRows = vaults.length === 0
      ? []
      : await db
          .select({
            vaultId: documentsTable.vaultId,
            fileCount: sql<number>`count(*)`.mapWith(Number),
            totalSize: sql<number>`coalesce(sum(${documentsTable.originalSize}), 0)`.mapWith(Number),
          })
          .from(documentsTable)
          .where(
            and(
              inArray(documentsTable.vaultId, vaults.map(vault => vault.id)),
              eq(documentsTable.isDeleted, false),
            ),
          )
          .groupBy(documentsTable.vaultId);

    const statsByVaultId = new Map(
      fileStatsRows.map(row => [row.vaultId, { fileCount: row.fileCount, totalSize: row.totalSize }]),
    );

    return vaults.map((vault) => ({
      id: vault.id,
      name: vault.name,
      description: vault.description,
      fileCount: statsByVaultId.get(vault.id)?.fileCount ?? 0,
      totalSize: statsByVaultId.get(vault.id)?.totalSize ?? 0,
      createdAt: vault.createdAt,
      updatedAt: vault.updatedAt,
      deletedAt: vault.deletedAt,
      role: vault.role as VaultRole | null,
      aiAccessLevel: (vault.aiAccessLevel ?? 'none') as AiAccessLevel,
      isAdmin: userState.isAdmin,
      isMember: vault.role !== null,
      accessMode: vault.role !== null ? 'member' as const : 'admin' as const,
    }));
  }

  async function createVault({
    userId,
    name,
    description,
  }: {
    userId: string;
    name: string;
    description: string | null;
  }) {
    return db.transaction(async (tx) => {
      const [vault] = await tx
        .insert(vaultsTable)
        .values({ name, description, createdBy: userId })
        .returning();

      if (vault === undefined) {
        throw new Error('Failed to create vault');
      }

      const userState = await authorizationServices.getUserAuthorizationState({ userId });
      const aiAccessLevel = userState?.isAdmin ? 'full' : 'none';

      await tx.insert(vaultMembersTable).values({
        vaultId: vault.id,
        userId,
        role: 'owner',
        aiAccessLevel,
      });

      return {
        ...vault,
        deletedAt: null,
        fileCount: 0,
        totalSize: 0,
        role: 'owner' as const,
        aiAccessLevel,
        isAdmin: userState?.isAdmin ?? false,
        isMember: true,
        accessMode: 'member' as const,
      };
    });
  }

  async function getVaultForUser({ vaultId, userId }: { vaultId: string; userId: string }): Promise<VaultAccess | null> {
    const authorizationState = await authorizationServices.getVaultAuthorizationState({
      vaultId,
      userId,
    });

    if (!authorizationServices.canAccessVault(authorizationState)) {
      return null;
    }

    const [vault] = await db
      .select({
        id: vaultsTable.id,
        name: vaultsTable.name,
        description: vaultsTable.description,
        createdAt: vaultsTable.createdAt,
        updatedAt: vaultsTable.updatedAt,
        deletedAt: vaultsTable.deletedAt,
      })
      .from(vaultsTable)
      .where(and(eq(vaultsTable.id, vaultId), isNull(vaultsTable.deletedAt)))
      .limit(1);

    if (vault === undefined || authorizationState === null) {
      return null;
    }

    return {
      ...vault,
      fileCount: 0,
      totalSize: 0,
      role: authorizationState.role,
      aiAccessLevel: authorizationState.aiAccessLevel,
      isAdmin: authorizationState.isAdmin,
      isMember: authorizationState.isMember,
      accessMode: authorizationState.accessMode,
    };
  }

  async function updateVaultIdentity({
    vaultId,
    name,
    description,
  }: {
    vaultId: string;
    name: string;
    description: string | null;
  }) {
    const [vault] = await db
      .update(vaultsTable)
      .set({
        name,
        description,
        updatedAt: sql`now()`,
      })
      .where(and(eq(vaultsTable.id, vaultId), isNull(vaultsTable.deletedAt)))
      .returning({
        id: vaultsTable.id,
        name: vaultsTable.name,
        description: vaultsTable.description,
        createdAt: vaultsTable.createdAt,
        updatedAt: vaultsTable.updatedAt,
      });

    return vault ?? null;
  }

  async function countVaultContents({ vaultId }: { vaultId: string }) {
    const [documentRow] = await db
      .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(documentsTable)
      .where(and(eq(documentsTable.vaultId, vaultId), eq(documentsTable.isDeleted, false)));

    const [folderRow] = await db
      .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(vaultFoldersTable)
      .where(and(eq(vaultFoldersTable.vaultId, vaultId), eq(vaultFoldersTable.isDeleted, false)));

    const documentCount = documentRow?.count ?? 0;
    const folderCount = folderRow?.count ?? 0;

    return {
      documentCount,
      folderCount,
      totalCount: documentCount + folderCount,
    };
  }

  async function softDeleteVault({ vaultId, deletedBy }: { vaultId: string; deletedBy: string }) {
    const [vault] = await db
      .update(vaultsTable)
      .set({
        deletedAt: sql`now()`,
        deletedBy,
        updatedAt: sql`now()`,
      })
      .where(and(
        eq(vaultsTable.id, vaultId),
        isNull(vaultsTable.deletedAt),
        sql`not exists (select 1 from ${documentsTable} where ${documentsTable.vaultId} = ${vaultId} and ${documentsTable.isDeleted} = false)`,
        sql`not exists (select 1 from ${vaultFoldersTable} where ${vaultFoldersTable.vaultId} = ${vaultId} and ${vaultFoldersTable.isDeleted} = false)`,
      ))
      .returning({ id: vaultsTable.id });

    return vault ?? null;
  }

  async function listMembers({ vaultId }: { vaultId: string }) {
    const members = await db
      .select({
        userId: vaultMembersTable.userId,
        role: vaultMembersTable.role,
        aiAccessLevel: vaultMembersTable.aiAccessLevel,
        email: usersTable.email,
        name: usersTable.name,
      })
      .from(vaultMembersTable)
      .innerJoin(usersTable, eq(vaultMembersTable.userId, usersTable.id))
      .where(eq(vaultMembersTable.vaultId, vaultId));

    return members.map((member) => ({
      userId: member.userId,
      role: member.role as VaultRole,
      aiAccessLevel: member.aiAccessLevel as AiAccessLevel,
      email: member.email,
      name: member.name,
    }));
  }

  async function listPendingInvitations({ vaultId }: { vaultId: string }) {
    const invitationRows = await db
      .select({
        id: emailInvitationsTable.id,
        email: emailInvitationsTable.email,
        invitedBy: emailInvitationsTable.invitedBy,
        role: emailInvitationsTable.vaultRole,
        aiAccessLevel: emailInvitationsTable.aiAccessLevel,
        expiresAt: emailInvitationsTable.expiresAt,
        createdAt: emailInvitationsTable.createdAt,
        updatedAt: emailInvitationsTable.updatedAt,
      })
      .from(emailInvitationsTable)
      .where(and(
        eq(emailInvitationsTable.vaultId, vaultId),
        eq(emailInvitationsTable.type, 'vault_member'),
        eq(emailInvitationsTable.status, 'pending'),
      ));

    const requestRows = await db
      .select({
        id: permissionRequestsTable.id,
        type: permissionRequestsTable.type,
        requestedBy: permissionRequestsTable.requestedBy,
        targetUserId: permissionRequestsTable.targetUserId,
        payload: permissionRequestsTable.payload,
        createdAt: permissionRequestsTable.createdAt,
        updatedAt: permissionRequestsTable.updatedAt,
      })
      .from(permissionRequestsTable)
      .where(and(
        eq(permissionRequestsTable.vaultId, vaultId),
        inArray(permissionRequestsTable.type, ['vault.external_invite', 'vault.owner_promote', 'vault.ai_access_grant']),
        eq(permissionRequestsTable.status, 'pending'),
      ));

    const targetUserIds = requestRows
      .map(row => row.targetUserId)
      .filter((userId): userId is string => userId !== null);
    const targetUsers = targetUserIds.length === 0
      ? []
      : await db
          .select({
            id: usersTable.id,
            email: usersTable.email,
            name: usersTable.name,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, targetUserIds));
    const targetUsersById = new Map(targetUsers.map(user => [user.id, user]));

    return [
      ...invitationRows
        .filter(row => row.role !== null)
        .map(row => ({
          id: row.id,
          source: 'email_invitation' as const,
          status: 'pending' as const,
          email: row.email,
          role: row.role as VaultRole,
          aiAccessLevel: row.aiAccessLevel as AiAccessLevel,
          requestedBy: row.invitedBy,
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      ...requestRows
        .map((row) => {
          const requestType = row.type;
          const targetUserId = row.targetUserId;
          const targetUser = targetUserId === null ? null : targetUsersById.get(targetUserId) ?? null;
          const email = typeof row.payload.email === 'string'
            ? row.payload.email
            : targetUser?.email ?? null;
          const role = row.payload.role ?? (requestType === 'vault.owner_promote' ? 'owner' : null);
          const aiAccessLevel = row.payload.aiAccessLevel ?? (requestType === 'vault.ai_access_grant' ? 'full' : 'none');
          const expiresAt = typeof row.payload.expiresAt === 'string' ? new Date(row.payload.expiresAt) : null;

          if (
            email === null
            || (role !== 'owner' && role !== 'editor' && role !== 'viewer')
            || (aiAccessLevel !== 'none' && aiAccessLevel !== 'full')
          ) {
            return null;
          }

          return {
            id: row.id,
            source: 'permission_request' as const,
            status: 'approval_pending' as const,
            email,
            name: targetUser?.name ?? null,
            targetUserId,
            requestType,
            role,
            aiAccessLevel,
            requestedBy: row.requestedBy,
            expiresAt: expiresAt !== null && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        })
        .filter(row => row !== null),
    ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async function countOwners({
    vaultId,
    excludeUserId,
  }: {
    vaultId: string;
    excludeUserId?: string;
  }) {
    const rows = await db
      .select({ userId: vaultMembersTable.userId })
      .from(vaultMembersTable)
      .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.role, 'owner')));

    return excludeUserId === undefined
      ? rows.length
      : rows.filter(row => row.userId !== excludeUserId).length;
  }

  async function upsertMember({
    vaultId,
    userId,
    role,
    aiAccessLevel = 'none',
  }: {
    vaultId: string;
    userId: string;
    role: VaultRole;
    aiAccessLevel?: AiAccessLevel;
  }) {
    const existingMember = await getMember({ vaultId, userId });

    if (existingMember?.role === 'owner' && role !== 'owner') {
      const ownerCount = await countOwners({ vaultId });

      if (ownerCount <= 1) {
        throw new Error('authorization.last_vault_owner');
      }
    }

    const [member] = await db
      .insert(vaultMembersTable)
      .values({ vaultId, userId, role, aiAccessLevel })
      .onConflictDoUpdate({
        target: [vaultMembersTable.vaultId, vaultMembersTable.userId],
        set: {
          role,
          aiAccessLevel,
          updatedAt: sql`now()`,
        },
      })
      .returning({
        userId: vaultMembersTable.userId,
        role: vaultMembersTable.role,
        aiAccessLevel: vaultMembersTable.aiAccessLevel,
      });

    if (member === undefined) {
      throw new Error('Failed to upsert vault member');
    }

    return {
      userId: member.userId,
      role: member.role as VaultRole,
      aiAccessLevel: member.aiAccessLevel as AiAccessLevel,
    };
  }

  async function getMember({ vaultId, userId }: { vaultId: string; userId: string }) {
    const [member] = await db
      .select({
        userId: vaultMembersTable.userId,
        role: vaultMembersTable.role,
        aiAccessLevel: vaultMembersTable.aiAccessLevel,
      })
      .from(vaultMembersTable)
      .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, userId)))
      .limit(1);

    if (member === undefined) {
      return null;
    }

    return {
      userId: member.userId,
      role: member.role as VaultRole,
      aiAccessLevel: member.aiAccessLevel as AiAccessLevel,
    };
  }

  async function getUserByEmail({ email }: { email: string }) {
    const [user] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email.trim().toLowerCase()))
      .limit(1);

    return user ?? null;
  }

  async function removeMember({ vaultId, userId }: { vaultId: string; userId: string }) {
    const member = await getMember({ vaultId, userId });

    if (member?.role === 'owner') {
      const remainingOwnerCount = await countOwners({ vaultId, excludeUserId: userId });

      if (remainingOwnerCount < 1) {
        throw new Error('authorization.last_vault_owner');
      }
    }

    const [deletedMember] = await db
      .delete(vaultMembersTable)
      .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, userId)))
      .returning({
        userId: vaultMembersTable.userId,
      });

    return deletedMember ?? null;
  }

  async function listAllVaults() {
    const rows = await db
      .select({
        id: vaultsTable.id,
        name: vaultsTable.name,
        createdAt: vaultsTable.createdAt,
        updatedAt: vaultsTable.updatedAt,
        ownerUserId: vaultMembersTable.userId,
        ownerEmail: usersTable.email,
        ownerName: usersTable.name,
      })
      .from(vaultsTable)
      .leftJoin(
        vaultMembersTable,
        and(eq(vaultMembersTable.vaultId, vaultsTable.id), eq(vaultMembersTable.role, 'owner')),
      )
      .leftJoin(usersTable, eq(vaultMembersTable.userId, usersTable.id))
      .where(isNull(vaultsTable.deletedAt))
      .orderBy(desc(vaultsTable.createdAt), asc(vaultMembersTable.createdAt));

    const vaultsById = new Map<string, typeof rows[number]>();

    for (const row of rows) {
      const existing = vaultsById.get(row.id);

      if (existing === undefined || (existing.ownerUserId === null && row.ownerUserId !== null)) {
        vaultsById.set(row.id, row);
      }
    }

    const vaults = Array.from(vaultsById.values());
    const memberCountRows = vaults.length === 0
      ? []
      : await db
          .select({
            vaultId: vaultMembersTable.vaultId,
            memberCount: sql<number>`count(*)::int`.mapWith(Number),
          })
          .from(vaultMembersTable)
          .where(inArray(vaultMembersTable.vaultId, vaults.map(vault => vault.id)))
          .groupBy(vaultMembersTable.vaultId);
    const memberCountsByVaultId = new Map(memberCountRows.map(row => [row.vaultId, row.memberCount]));

    return vaults.map(vault => ({
      ...vault,
      memberCount: memberCountsByVaultId.get(vault.id) ?? 0,
    }));
  }

  async function createPermissionRequest({
    type,
    requestedBy,
    vaultId,
    targetUserId,
    payload,
  }: {
    type: PermissionRequestType;
    requestedBy: string;
    vaultId?: string | null;
    targetUserId?: string | null;
    payload?: Record<string, unknown>;
  }) {
    return authorizationServices.createPermissionRequest({
      type,
      requestedBy,
      vaultId,
      targetUserId,
      payload,
    });
  }

  async function createEmailInvitation({
    email,
    invitedBy,
    vaultId,
    role,
    aiAccessLevel,
    expiresAt = null,
  }: {
    email: string;
    invitedBy: string;
    vaultId: string;
    role: VaultRole;
    aiAccessLevel: AiAccessLevel;
    expiresAt?: Date | null;
  }) {
    return authorizationServices.createEmailInvitation({
      type: 'vault_member',
      email,
      invitedBy,
      vaultId,
      vaultRole: role,
      aiAccessLevel,
      systemRole: 'member',
      expiresAt,
      payload: {
        systemCapabilities: [],
        vaultMemberships: [],
      },
    });
  }

  return {
    countVaultContents,
    createEmailInvitation,
    createVault,
    createPermissionRequest,
    getMember,
    getUserByEmail,
    getVaultForUser,
    listAllVaults,
    listMembers,
    listPendingInvitations,
    listUserVaults,
    removeMember,
    softDeleteVault,
    updateVaultIdentity,
    upsertMember,
  };
}

export type VaultsServices = ReturnType<typeof createVaultsServices>;
