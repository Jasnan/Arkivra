import type { Database } from '../database/database.js';
import type { VaultRole } from './vaults.types.js';
import type { VaultMemberPermission } from '../authorization/authorization.types.js';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  VAULT_MEMBER_PERMISSIONS,
  normalizeVaultMemberPermissions,
} from '../authorization/authorization.types.js';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  documentsTable,
  userGlobalRolesTable,
  usersTable,
  vaultMemberPermissionsTable,
  vaultMembersTable,
  vaultsTable,
} from '../database/schema/index.js';

const ALL_VAULT_MEMBER_PERMISSIONS = [...VAULT_MEMBER_PERMISSIONS];

function getOwnerFallbackPermissions() {
  return [...ALL_VAULT_MEMBER_PERMISSIONS];
}

async function loadPermissionsByMemberId({ db, memberIds }: { db: Database; memberIds: string[] }) {
  if (memberIds.length === 0) {
    return new Map<string, VaultMemberPermission[]>();
  }

  const rows = await db
    .select({
      vaultMemberId: vaultMemberPermissionsTable.vaultMemberId,
      permission: vaultMemberPermissionsTable.permission,
    })
    .from(vaultMemberPermissionsTable)
    .where(inArray(vaultMemberPermissionsTable.vaultMemberId, memberIds));

  const permissionsByMemberId = new Map<string, VaultMemberPermission[]>();

  for (const row of rows) {
    const current = permissionsByMemberId.get(row.vaultMemberId) ?? [];
    current.push(row.permission as VaultMemberPermission);
    permissionsByMemberId.set(row.vaultMemberId, current);
  }

  return permissionsByMemberId;
}

export function createVaultsServices({ db }: { db: Database }) {
  async function listUserVaults({ userId }: { userId: string }) {
    const vaults = await db
      .select({
        id: vaultsTable.id,
        name: vaultsTable.name,
        description: vaultsTable.description,
        createdAt: vaultsTable.createdAt,
        updatedAt: vaultsTable.updatedAt,
        deletedAt: vaultsTable.deletedAt,
        role: vaultMembersTable.role,
        memberId: vaultMembersTable.id,
      })
      .from(vaultMembersTable)
      .innerJoin(vaultsTable, eq(vaultMembersTable.vaultId, vaultsTable.id))
      .where(and(eq(vaultMembersTable.userId, userId), isNull(vaultsTable.deletedAt)))
      .orderBy(desc(vaultsTable.createdAt));

    const permissionsByMemberId = await loadPermissionsByMemberId({
      db,
      memberIds: vaults.map((vault) => vault.memberId),
    });
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
      role: vault.role,
      permissions:
        vault.role === 'owner'
          ? getOwnerFallbackPermissions()
          : (permissionsByMemberId.get(vault.memberId) ?? []),
      isGlobalAdmin: false,
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
      const [vault] = await tx.insert(vaultsTable).values({ name, description }).returning();

      if (vault === undefined) {
        throw new Error('Failed to create vault');
      }

      await tx.insert(vaultMembersTable).values({
        vaultId: vault.id,
        userId,
        role: 'owner',
      });

      return {
        ...vault,
        deletedAt: null,
        fileCount: 0,
        totalSize: 0,
        role: 'owner' as const,
        permissions: getOwnerFallbackPermissions(),
        isGlobalAdmin: false,
      };
    });
  }

  async function getVaultForUser({ vaultId, userId }: { vaultId: string; userId: string }) {
    const [globalAdminRole] = await db
      .select({ role: userGlobalRolesTable.role })
      .from(userGlobalRolesTable)
      .where(
        and(eq(userGlobalRolesTable.userId, userId), eq(userGlobalRolesTable.role, 'global_admin')),
      )
      .limit(1);

    const isGlobalAdmin = globalAdminRole !== undefined;

    const [member] = await db
      .select({
        memberId: vaultMembersTable.id,
        id: vaultsTable.id,
        name: vaultsTable.name,
        description: vaultsTable.description,
        createdAt: vaultsTable.createdAt,
        updatedAt: vaultsTable.updatedAt,
        deletedAt: vaultsTable.deletedAt,
        role: vaultMembersTable.role,
      })
      .from(vaultMembersTable)
      .innerJoin(vaultsTable, eq(vaultMembersTable.vaultId, vaultsTable.id))
      .where(
        and(
          eq(vaultMembersTable.userId, userId),
          eq(vaultMembersTable.vaultId, vaultId),
          isNull(vaultsTable.deletedAt),
        ),
      )
      .limit(1);

    if (member !== undefined) {
      const permissionsByMemberId = await loadPermissionsByMemberId({
        db,
        memberIds: [member.memberId],
      });

      return {
        id: member.id,
        name: member.name,
        description: member.description,
        fileCount: 0,
        totalSize: 0,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        deletedAt: member.deletedAt,
        role: member.role,
        permissions:
          isGlobalAdmin || member.role === 'owner'
            ? getOwnerFallbackPermissions()
            : (permissionsByMemberId.get(member.memberId) ?? []),
        isGlobalAdmin,
      };
    }

    if (!isGlobalAdmin) {
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

    if (vault === undefined) {
      return null;
    }

    return {
      ...vault,
      fileCount: 0,
      totalSize: 0,
      role: null,
      permissions: getOwnerFallbackPermissions(),
      isGlobalAdmin: true,
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
        updatedAt: new Date(),
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

  async function softDeleteVault({ vaultId, deletedBy }: { vaultId: string; deletedBy: string }) {
    const [vault] = await db
      .update(vaultsTable)
      .set({
        deletedAt: new Date(),
        deletedBy,
        updatedAt: new Date(),
      })
      .where(and(eq(vaultsTable.id, vaultId), isNull(vaultsTable.deletedAt)))
      .returning({ id: vaultsTable.id });

    return vault ?? null;
  }

  async function listMembers({ vaultId }: { vaultId: string }) {
    const members = await db
      .select({
        memberId: vaultMembersTable.id,
        userId: vaultMembersTable.userId,
        role: vaultMembersTable.role,
        email: usersTable.email,
        name: usersTable.name,
      })
      .from(vaultMembersTable)
      .innerJoin(usersTable, eq(vaultMembersTable.userId, usersTable.id))
      .where(eq(vaultMembersTable.vaultId, vaultId));

    const permissionsByMemberId = await loadPermissionsByMemberId({
      db,
      memberIds: members.map((member) => member.memberId),
    });

    return members.map((member) => ({
      userId: member.userId,
      role: member.role,
      email: member.email,
      name: member.name,
      permissions:
        member.role === 'owner'
          ? getOwnerFallbackPermissions()
          : (permissionsByMemberId.get(member.memberId) ?? []),
    }));
  }

  async function upsertMember({
    vaultId,
    userId,
    role,
    permissions,
  }: {
    vaultId: string;
    userId: string;
    role: VaultRole;
    permissions?: readonly VaultMemberPermission[];
  }) {
    return db.transaction(async (tx) => {
      const normalizedPermissions =
        role === 'owner'
          ? []
          : normalizeVaultMemberPermissions(
              (permissions ?? DEFAULT_MEMBER_PERMISSIONS) as VaultMemberPermission[],
            );

      if (role === 'owner') {
        const existingOwners = await tx
          .select({
            id: vaultMembersTable.id,
            userId: vaultMembersTable.userId,
          })
          .from(vaultMembersTable)
          .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.role, 'owner')));

        for (const owner of existingOwners) {
          if (owner.userId === userId) {
            continue;
          }

          await tx
            .update(vaultMembersTable)
            .set({
              role: 'member',
              updatedAt: new Date(),
            })
            .where(eq(vaultMembersTable.id, owner.id));

          await tx
            .delete(vaultMemberPermissionsTable)
            .where(eq(vaultMemberPermissionsTable.vaultMemberId, owner.id));

          if (DEFAULT_MEMBER_PERMISSIONS.length > 0) {
            await tx.insert(vaultMemberPermissionsTable).values(
              DEFAULT_MEMBER_PERMISSIONS.map((permission) => ({
                vaultMemberId: owner.id,
                permission,
              })),
            );
          }
        }
      }

      const [member] = await tx
        .insert(vaultMembersTable)
        .values({ vaultId, userId, role })
        .onConflictDoUpdate({
          target: [vaultMembersTable.vaultId, vaultMembersTable.userId],
          set: {
            role,
            updatedAt: new Date(),
          },
        })
        .returning({
          memberId: vaultMembersTable.id,
          userId: vaultMembersTable.userId,
          role: vaultMembersTable.role,
        });

      if (member === undefined) {
        throw new Error('Failed to upsert vault member');
      }

      await tx
        .delete(vaultMemberPermissionsTable)
        .where(eq(vaultMemberPermissionsTable.vaultMemberId, member.memberId));

      if (normalizedPermissions.length > 0) {
        await tx.insert(vaultMemberPermissionsTable).values(
          normalizedPermissions.map((permission) => ({
            vaultMemberId: member.memberId,
            permission,
          })),
        );
      }

      return {
        userId: member.userId,
        role: member.role,
        permissions:
          member.role === 'owner' ? getOwnerFallbackPermissions() : normalizedPermissions,
      };
    });
  }

  async function getMember({ vaultId, userId }: { vaultId: string; userId: string }) {
    const [member] = await db
      .select({
        memberId: vaultMembersTable.id,
        userId: vaultMembersTable.userId,
        role: vaultMembersTable.role,
      })
      .from(vaultMembersTable)
      .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, userId)))
      .limit(1);

    if (member === undefined) {
      return null;
    }

    const permissionsByMemberId = await loadPermissionsByMemberId({
      db,
      memberIds: [member.memberId],
    });

    return {
      userId: member.userId,
      role: member.role,
      permissions:
        member.role === 'owner'
          ? getOwnerFallbackPermissions()
          : (permissionsByMemberId.get(member.memberId) ?? []),
    };
  }

  async function removeMember({ vaultId, userId }: { vaultId: string; userId: string }) {
    const [member] = await db
      .delete(vaultMembersTable)
      .where(and(eq(vaultMembersTable.vaultId, vaultId), eq(vaultMembersTable.userId, userId)))
      .returning({
        userId: vaultMembersTable.userId,
      });

    return member ?? null;
  }

  async function listAllVaults() {
    return db
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
      .orderBy(desc(vaultsTable.createdAt));
  }

  return {
    createVault,
    getMember,
    getVaultForUser,
    listAllVaults,
    listMembers,
    listUserVaults,
    removeMember,
    softDeleteVault,
    updateVaultIdentity,
    upsertMember,
  };
}

export type VaultsServices = ReturnType<typeof createVaultsServices>;
