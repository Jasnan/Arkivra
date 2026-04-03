import type { Database } from '../database/database.js';
import type { GlobalRole } from './authorization.types.js';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { userGlobalRolesTable, usersTable } from '../database/schema/index.js';

export function createAuthorizationServices({ db }: { db: Database }) {
  async function ensureBootstrapGlobalAdmin({ userId }: { userId: string }) {
    const [existingAdmin] = await db
      .select({ userId: userGlobalRolesTable.userId })
      .from(userGlobalRolesTable)
      .where(eq(userGlobalRolesTable.role, 'global_admin'))
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
      .insert(userGlobalRolesTable)
      .values({ userId, role: 'global_admin' })
      .onConflictDoNothing();

    return true;
  }

  async function listGlobalRolesForUser({ userId }: { userId: string }) {
    const rows = await db
      .select({ role: userGlobalRolesTable.role })
      .from(userGlobalRolesTable)
      .where(eq(userGlobalRolesTable.userId, userId));

    return rows.map((row) => row.role as GlobalRole);
  }

  async function getUserAuthorizationState({ userId }: { userId: string }) {
    const [user] = await db
      .select({
        id: usersTable.id,
        disabledAt: usersTable.disabledAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (user === undefined) {
      return null;
    }

    const globalRoles = await listGlobalRolesForUser({ userId });

    return {
      userId: user.id,
      disabledAt: user.disabledAt,
      globalRoles,
      isGlobalAdmin: globalRoles.includes('global_admin'),
    };
  }

  async function countActiveGlobalAdmins() {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userGlobalRolesTable)
      .innerJoin(usersTable, eq(userGlobalRolesTable.userId, usersTable.id))
      .where(and(eq(userGlobalRolesTable.role, 'global_admin'), isNull(usersTable.disabledAt)));

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
        disabledAt: usersTable.disabledAt,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .orderBy(asc(usersTable.createdAt));

    const roles =
      users.length === 0
        ? []
        : await db
            .select({
              userId: userGlobalRolesTable.userId,
              role: userGlobalRolesTable.role,
            })
            .from(userGlobalRolesTable)
            .where(
              inArray(
                userGlobalRolesTable.userId,
                users.map((user) => user.id),
              ),
            );

    const rolesByUserId = new Map<string, GlobalRole[]>();

    for (const role of roles) {
      const current = rolesByUserId.get(role.userId) ?? [];
      current.push(role.role as GlobalRole);
      rolesByUserId.set(role.userId, current);
    }

    return users.map((user) => ({
      ...user,
      globalRoles: rolesByUserId.get(user.id) ?? [],
      isGlobalAdmin: (rolesByUserId.get(user.id) ?? []).includes('global_admin'),
    }));
  }

  async function getUserWithRoles({ userId }: { userId: string }) {
    const users = await listUsers();
    return users.find((user) => user.id === userId) ?? null;
  }

  async function setUserDisabled({ userId, disabled }: { userId: string; disabled: boolean }) {
    const user = await getUserWithRoles({ userId });

    if (user === null) {
      return null;
    }

    if (disabled && user.isGlobalAdmin && user.disabledAt === null) {
      const activeGlobalAdminCount = await countActiveGlobalAdmins();

      if (activeGlobalAdminCount <= 1) {
        throw new Error('authorization.last_global_admin');
      }
    }

    await db
      .update(usersTable)
      .set({
        disabledAt: disabled ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    return getUserWithRoles({ userId });
  }

  async function grantGlobalAdmin({ userId }: { userId: string }) {
    const user = await getUserWithRoles({ userId });

    if (user === null) {
      return null;
    }

    await db
      .insert(userGlobalRolesTable)
      .values({ userId, role: 'global_admin' })
      .onConflictDoNothing();

    return getUserWithRoles({ userId });
  }

  async function revokeGlobalAdmin({ userId }: { userId: string }) {
    const user = await getUserWithRoles({ userId });

    if (user === null) {
      return null;
    }

    if (user.isGlobalAdmin && user.disabledAt === null) {
      const activeGlobalAdminCount = await countActiveGlobalAdmins();

      if (activeGlobalAdminCount <= 1) {
        throw new Error('authorization.last_global_admin');
      }
    }

    await db
      .delete(userGlobalRolesTable)
      .where(
        and(eq(userGlobalRolesTable.userId, userId), eq(userGlobalRolesTable.role, 'global_admin')),
      );

    return getUserWithRoles({ userId });
  }

  return {
    countActiveGlobalAdmins,
    ensureBootstrapGlobalAdmin,
    getUserAuthorizationState,
    getUserWithRoles,
    grantGlobalAdmin,
    listGlobalRolesForUser,
    listUsers,
    revokeGlobalAdmin,
    setUserDisabled,
  };
}

export type AuthorizationServices = ReturnType<typeof createAuthorizationServices>;
