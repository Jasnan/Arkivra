import type { Database } from '../database/database.js';
import type {
  AiAccessLevel,
  EmailInvitationType,
  PermissionRequestType,
  SystemCapability,
  SystemRole,
  VaultAuthorizationState,
  VaultRole,
} from './authorization.types.js';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  authAccountsTable,
  documentsTable,
  emailInvitationsTable,
  permissionRequestsTable,
  systemCapabilitiesTable,
  usersTable,
  vaultFoldersTable,
  vaultMembersTable,
  vaultsTable,
} from '../database/schema/index.js';

const CREATE_VAULTS_CAPABILITY = 'system.create_vaults' satisfies SystemCapability;

function isAdminRole(role: SystemRole) {
  return role === 'admin';
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

function getAiAccessRank(aiAccessLevel: AiAccessLevel) {
  switch (aiAccessLevel) {
    case 'full':
      return 2;
    case 'document_chat':
      return 1;
    case 'none':
      return 0;
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getInvitationSystemCapabilities(payload: Record<string, unknown>) {
  const value = payload.systemCapabilities;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((capability): capability is SystemCapability => capability === CREATE_VAULTS_CAPABILITY);
}

function getInvitationVaultMemberships(payload: Record<string, unknown>) {
  const value = payload.vaultMemberships;
  if (!Array.isArray(value)) {
    return [] as Array<{ vaultId: string; role: VaultRole; aiAccessLevel: AiAccessLevel }>;
  }

  return value.flatMap((item): Array<{ vaultId: string; role: VaultRole; aiAccessLevel: AiAccessLevel }> => {
    if (item === null || typeof item !== 'object') {
      return [];
    }

    const candidate = item as { vaultId?: unknown; role?: unknown; aiAccessLevel?: unknown };
    if (
      typeof candidate.vaultId !== 'string'
      || (candidate.role !== 'owner' && candidate.role !== 'editor' && candidate.role !== 'viewer')
      || (
        candidate.aiAccessLevel !== 'none'
        && candidate.aiAccessLevel !== 'document_chat'
        && candidate.aiAccessLevel !== 'full'
      )
    ) {
      return [];
    }

    return [{
      vaultId: candidate.vaultId,
      role: candidate.role,
      aiAccessLevel: candidate.aiAccessLevel,
    }];
  });
}

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
      .set({ systemRole: 'admin', updatedAt: new Date() })
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

    return {
      userId: user.id,
      disabledAt: user.disabledAt,
      systemRole: user.systemRole as SystemRole,
      systemCapabilities,
      isAdmin,
      canCreateVault,
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

      return {
        ...user,
        systemRole,
        systemCapabilities,
        isAdmin,
        canCreateVault,
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
        disabledAt: disabled ? new Date() : null,
        updatedAt: new Date(),
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
      .set({ systemRole: 'admin', updatedAt: new Date() })
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

  async function createPermissionRequest({
    type,
    requestedBy,
    vaultId = null,
    targetUserId = null,
    payload = {},
  }: {
    type: PermissionRequestType;
    requestedBy: string;
    vaultId?: string | null;
    targetUserId?: string | null;
    payload?: Record<string, unknown>;
  }) {
    const [request] = await db
      .insert(permissionRequestsTable)
      .values({ type, requestedBy, vaultId, targetUserId, payload })
      .returning();

    if (request === undefined) {
      throw new Error('authorization.permission_request_failed');
    }

    return request;
  }

  async function listPermissionRequests({ status = 'pending' }: { status?: 'pending' | 'approved' | 'rejected' | 'cancelled' }) {
    return db
      .select()
      .from(permissionRequestsTable)
      .where(eq(permissionRequestsTable.status, status))
      .orderBy(desc(permissionRequestsTable.createdAt));
  }

  async function getPermissionRequest({ requestId }: { requestId: string }) {
    const [request] = await db
      .select()
      .from(permissionRequestsTable)
      .where(eq(permissionRequestsTable.id, requestId))
      .limit(1);

    return request ?? null;
  }

  async function approvePermissionRequest({
    requestId,
    reviewedBy,
  }: {
    requestId: string;
    reviewedBy: string;
  }) {
    return db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(permissionRequestsTable)
        .where(eq(permissionRequestsTable.id, requestId))
        .limit(1);

      if (request === undefined) {
        return null;
      }

      if (request.status !== 'pending') {
        throw new Error('authorization.permission_request_not_pending');
      }

      const result: Record<string, unknown> = {};

      if (request.type === 'vault.create') {
        const name = typeof request.payload.name === 'string' ? request.payload.name.trim() : '';
        const description = typeof request.payload.description === 'string'
          ? request.payload.description.trim()
          : null;

        if (name.length === 0) {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const [vault] = await tx
          .insert(vaultsTable)
          .values({
            name,
            description: description && description.length > 0 ? description : null,
            createdBy: request.requestedBy,
          })
          .returning({ id: vaultsTable.id });

        if (vault === undefined) {
          throw new Error('authorization.permission_request_apply_failed');
        }

        await tx.insert(vaultMembersTable).values({
          vaultId: vault.id,
          userId: request.requestedBy,
          role: 'owner',
          aiAccessLevel: 'none',
        });

        result.vaultId = vault.id;
      } else if (request.type === 'vault.delete') {
        if (request.vaultId === null) {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const [documentRow] = await tx
          .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(documentsTable)
          .where(and(eq(documentsTable.vaultId, request.vaultId), eq(documentsTable.isDeleted, false)));

        if ((documentRow?.count ?? 0) > 0) {
          throw new Error('authorization.vault_not_empty');
        }

        const [folderRow] = await tx
          .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(vaultFoldersTable)
          .where(and(eq(vaultFoldersTable.vaultId, request.vaultId), eq(vaultFoldersTable.isDeleted, false)));

        if ((folderRow?.count ?? 0) > 0) {
          throw new Error('authorization.vault_not_empty');
        }

        const [deletedVault] = await tx
          .update(vaultsTable)
          .set({ deletedAt: new Date(), deletedBy: reviewedBy, updatedAt: new Date() })
          .where(and(
            eq(vaultsTable.id, request.vaultId),
            isNull(vaultsTable.deletedAt),
            sql`not exists (select 1 from ${documentsTable} where ${documentsTable.vaultId} = ${request.vaultId} and ${documentsTable.isDeleted} = false)`,
            sql`not exists (select 1 from ${vaultFoldersTable} where ${vaultFoldersTable.vaultId} = ${request.vaultId} and ${vaultFoldersTable.isDeleted} = false)`,
          ))
          .returning({ id: vaultsTable.id });

        if (deletedVault === undefined) {
          throw new Error('authorization.vault_not_empty');
        }

        result.vaultId = request.vaultId;
      } else if (request.type === 'vault.owner_promote') {
        if (request.vaultId === null || request.targetUserId === null) {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        await tx
          .insert(vaultMembersTable)
          .values({
            vaultId: request.vaultId,
            userId: request.targetUserId,
            role: 'owner',
            aiAccessLevel: 'none',
          })
          .onConflictDoUpdate({
            target: [vaultMembersTable.vaultId, vaultMembersTable.userId],
            set: { role: 'owner', updatedAt: new Date() },
          });
        result.vaultId = request.vaultId;
        result.userId = request.targetUserId;
      } else if (request.type === 'vault.ai_escalation') {
        if (request.vaultId === null || request.targetUserId === null) {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const aiAccessLevel = request.payload.aiAccessLevel;
        if (aiAccessLevel !== 'document_chat' && aiAccessLevel !== 'full') {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const [member] = await tx
          .update(vaultMembersTable)
          .set({ aiAccessLevel, updatedAt: new Date() })
          .where(and(
            eq(vaultMembersTable.vaultId, request.vaultId),
            eq(vaultMembersTable.userId, request.targetUserId),
          ))
          .returning({ userId: vaultMembersTable.userId });

        if (member === undefined) {
          throw new Error('authorization.permission_request_apply_failed');
        }

        result.vaultId = request.vaultId;
        result.userId = request.targetUserId;
        result.aiAccessLevel = aiAccessLevel;
      } else if (request.type === 'vault.email_invitation') {
        if (request.vaultId === null) {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const email = typeof request.payload.email === 'string' ? normalizeEmail(request.payload.email) : '';
        const role = request.payload.role;
        const aiAccessLevel = request.payload.aiAccessLevel ?? 'none';
        const expiresAt = typeof request.payload.expiresAt === 'string'
          ? new Date(request.payload.expiresAt)
          : null;

        if (
          email.length === 0
          || (role !== 'owner' && role !== 'editor' && role !== 'viewer')
          || (aiAccessLevel !== 'none' && aiAccessLevel !== 'document_chat' && aiAccessLevel !== 'full')
          || (expiresAt !== null && Number.isNaN(expiresAt.getTime()))
        ) {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const [invitation] = await tx
          .insert(emailInvitationsTable)
          .values({
            type: 'vault_member',
            email,
            invitedBy: request.requestedBy,
            vaultId: request.vaultId,
            vaultRole: role,
            aiAccessLevel,
            systemRole: 'member',
            expiresAt,
            payload: {
              systemCapabilities: [],
              vaultMemberships: [],
              permissionRequestId: request.id,
            },
          })
          .returning({ id: emailInvitationsTable.id });

        if (invitation === undefined) {
          throw new Error('authorization.email_invitation_failed');
        }

        result.vaultId = request.vaultId;
        result.invitationId = invitation.id;
        result.email = email;
        result.role = role;
        result.aiAccessLevel = aiAccessLevel;
      }

      const [updatedRequest] = await tx
        .update(permissionRequestsTable)
        .set({
          status: 'approved',
          reviewedBy,
          reviewedAt: new Date(),
          result,
          updatedAt: new Date(),
        })
        .where(eq(permissionRequestsTable.id, requestId))
        .returning();

      return updatedRequest ?? null;
    });
  }

  async function rejectPermissionRequest({
    requestId,
    reviewedBy,
    reason,
  }: {
    requestId: string;
    reviewedBy: string;
    reason?: string | null;
  }) {
    const [request] = await db
      .update(permissionRequestsTable)
      .set({
        status: 'rejected',
        reviewedBy,
        reviewedAt: new Date(),
        result: reason ? { reason } : {},
        updatedAt: new Date(),
      })
      .where(and(eq(permissionRequestsTable.id, requestId), eq(permissionRequestsTable.status, 'pending')))
      .returning();

    return request ?? null;
  }

  async function createEmailInvitation({
    type,
    email,
    invitedBy,
    vaultId = null,
    vaultRole = null,
    aiAccessLevel = 'none',
    systemRole = null,
    expiresAt = null,
    payload = {},
  }: {
    type: EmailInvitationType;
    email: string;
    invitedBy?: string | null;
    vaultId?: string | null;
    vaultRole?: VaultRole | null;
    aiAccessLevel?: AiAccessLevel;
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
        aiAccessLevel,
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

    if (invitation.expiresAt !== null && invitation.expiresAt <= new Date()) {
      await db
        .update(emailInvitationsTable)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(emailInvitationsTable.id, invitation.id));
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

      const invitationSystemRole = invitation.systemRole ?? (invitation.type === 'admin_account' ? 'admin' : null);
      if (invitationSystemRole === 'admin') {
        await tx
          .update(usersTable)
          .set({ systemRole: 'admin', updatedAt: new Date() })
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
            aiAccessLevel: invitation.aiAccessLevel as AiAccessLevel,
          })
          .onConflictDoUpdate({
            target: [vaultMembersTable.vaultId, vaultMembersTable.userId],
            set: {
              role: invitation.vaultRole,
              aiAccessLevel: invitation.aiAccessLevel as AiAccessLevel,
              updatedAt: new Date(),
            },
          })
          .returning({ id: vaultMembersTable.id });

        vaultMemberId = member?.id ?? null;
      }

      const vaultMemberships = getInvitationVaultMemberships(invitation.payload);
      for (const membership of vaultMemberships) {
        const [member] = await tx
          .insert(vaultMembersTable)
          .values({
            vaultId: membership.vaultId,
            userId,
            role: membership.role,
            aiAccessLevel: membership.aiAccessLevel,
          })
          .onConflictDoUpdate({
            target: [vaultMembersTable.vaultId, vaultMembersTable.userId],
            set: {
              role: membership.role,
              aiAccessLevel: membership.aiAccessLevel,
              updatedAt: new Date(),
            },
          })
          .returning({ id: vaultMembersTable.id });

        vaultMemberId ??= member?.id ?? null;
      }

      const [accepted] = await tx
        .update(emailInvitationsTable)
        .set({
          status: 'accepted',
          acceptedBy: userId,
          acceptedAt: new Date(),
          vaultMemberId,
          updatedAt: new Date(),
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

    if (!userState.isAdmin && role === null) {
      return null;
    }

    return {
      userId,
      vaultId,
      isAdmin: userState.isAdmin,
      role,
      aiAccessLevel,
      isMember: role !== null,
      accessMode: role !== null ? 'member' : 'admin',
    };
  }

  function canAdministrativelyViewVault(state: VaultAuthorizationState | null) {
    return state !== null && (state.isAdmin || canVaultRoleRead(state.role));
  }

  function canParticipateInVault(state: VaultAuthorizationState | null) {
    return state !== null && state.role !== null;
  }

  function canAccessVault(state: VaultAuthorizationState | null) {
    return canAdministrativelyViewVault(state);
  }

  function canReadVault(state: VaultAuthorizationState | null) {
    return state !== null && canVaultRoleRead(state.role);
  }

  function canManageVault(state: VaultAuthorizationState | null) {
    return state !== null && state.role === 'owner';
  }

  function canManageVaultMembers(state: VaultAuthorizationState | null) {
    return state !== null && canVaultRoleManageMembers(state.role);
  }

  function canMutateVaultDocuments(state: VaultAuthorizationState | null) {
    return state !== null && canVaultRoleMutateDocuments(state.role);
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

  return {
    canAdministrativelyViewVault,
    canAccessVault,
    canCreateVault,
    canManageVault,
    canManageVaultMembers,
    canMutateVaultDocuments,
    canParticipateInVault,
    canReadVault,
    canUseDocumentChat,
    canUseGlobalChat,
    canUseSemanticRetrieval,
    countActiveAdmins,
    acceptEmailInvitation,
    acceptEmailInvitationForRegisteredUser,
    approvePermissionRequest,
    createEmailInvitation,
    createPermissionRequest,
    ensureBootstrapAdmin,
    getAiAuthorizedVaultIdsForUser,
    getAiAccessRank,
    getPendingEmailInvitation,
    getPermissionRequest,
    getReadableVaultIdsForUser,
    getUserAuthorizationState,
    getUserWithAuthorization,
    getVaultAuthorizationState,
    grantAdmin,
    grantSystemCapability,
    hasAnyUsers,
    listPermissionRequests,
    listSystemCapabilitiesForUser,
    listUsers,
    rejectPermissionRequest,
    revokeAdmin,
    revokeSystemCapability,
    setUserDisabled,
  };
}

export type AuthorizationServices = ReturnType<typeof createAuthorizationServices>;
