import type { Database } from '../database/database.js';
import type { VaultRole } from './vaults.types.js';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { usersTable, vaultMembersTable, vaultsTable } from '../database/schema/index.js';

export function createVaultsServices({ db }: { db: Database }) {
  async function listUserVaults({ userId }: { userId: string }) {
    return db
      .select({
        id: vaultsTable.id,
        name: vaultsTable.name,
        createdAt: vaultsTable.createdAt,
        updatedAt: vaultsTable.updatedAt,
        role: vaultMembersTable.role,
      })
      .from(vaultMembersTable)
      .innerJoin(vaultsTable, eq(vaultMembersTable.vaultId, vaultsTable.id))
      .where(
        and(
          eq(vaultMembersTable.userId, userId),
          isNull(vaultsTable.deletedAt),
        ),
      )
      .orderBy(desc(vaultsTable.createdAt));
  }

  async function createVault({ userId, name }: { userId: string; name: string }) {
    return db.transaction(async (tx) => {
      const [vault] = await tx
        .insert(vaultsTable)
        .values({ name })
        .returning();

      if (vault === undefined) {
        throw new Error('Failed to create vault');
      }

      await tx
        .insert(vaultMembersTable)
        .values({
          vaultId: vault.id,
          userId,
          role: 'owner',
        });

      return {
        ...vault,
        role: 'owner' as const,
      };
    });
  }

  async function getVaultForUser({ vaultId, userId }: { vaultId: string; userId: string }) {
    const [vault] = await db
      .select({
        id: vaultsTable.id,
        name: vaultsTable.name,
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

    return vault ?? null;
  }

  async function updateVaultName({ vaultId, name }: { vaultId: string; name: string }) {
    const [vault] = await db
      .update(vaultsTable)
      .set({
        name,
        updatedAt: new Date(),
      })
      .where(and(eq(vaultsTable.id, vaultId), isNull(vaultsTable.deletedAt)))
      .returning({
        id: vaultsTable.id,
        name: vaultsTable.name,
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
    return db
      .select({
        userId: vaultMembersTable.userId,
        role: vaultMembersTable.role,
        email: usersTable.email,
        name: usersTable.name,
      })
      .from(vaultMembersTable)
      .innerJoin(usersTable, eq(vaultMembersTable.userId, usersTable.id))
      .where(eq(vaultMembersTable.vaultId, vaultId));
  }

  async function upsertMember({
    vaultId,
    userId,
    role,
  }: {
    vaultId: string;
    userId: string;
    role: VaultRole;
  }) {
    const [member] = await db
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
        userId: vaultMembersTable.userId,
        role: vaultMembersTable.role,
      });

    return member;
  }

  async function getMember({ vaultId, userId }: { vaultId: string; userId: string }) {
    const [member] = await db
      .select({
        userId: vaultMembersTable.userId,
        role: vaultMembersTable.role,
      })
      .from(vaultMembersTable)
      .where(
        and(
          eq(vaultMembersTable.vaultId, vaultId),
          eq(vaultMembersTable.userId, userId),
        ),
      )
      .limit(1);

    return member ?? null;
  }

  async function removeMember({ vaultId, userId }: { vaultId: string; userId: string }) {
    const [member] = await db
      .delete(vaultMembersTable)
      .where(
        and(
          eq(vaultMembersTable.vaultId, vaultId),
          eq(vaultMembersTable.userId, userId),
        ),
      )
      .returning({
        userId: vaultMembersTable.userId,
      });

    return member ?? null;
  }

  return {
    createVault,
    getMember,
    getVaultForUser,
    listMembers,
    listUserVaults,
    removeMember,
    softDeleteVault,
    updateVaultName,
    upsertMember,
  };
}

export type VaultsServices = ReturnType<typeof createVaultsServices>;
