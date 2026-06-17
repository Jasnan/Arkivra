import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import {
  documentsTable,
  emailInvitationsTable,
  permissionRequestsTable,
  vaultFoldersTable,
  vaultMembersTable,
  vaultsTable,
} from '../database/schema/index.js';
import type { PermissionRequestType } from './authorization.types.js';
import { normalizeEmail } from './authorization.rules.js';

export function createPermissionRequestServices({ db }: { db: Database }) {
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

  async function listPermissionRequests({
    status = 'pending',
  }: {
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  }) {
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
        const description =
          typeof request.payload.description === 'string' ? request.payload.description.trim() : null;

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
          .where(
            and(eq(documentsTable.vaultId, request.vaultId), eq(documentsTable.isDeleted, false)),
          );

        if ((documentRow?.count ?? 0) > 0) {
          throw new Error('authorization.vault_not_empty');
        }

        const [folderRow] = await tx
          .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
          .from(vaultFoldersTable)
          .where(
            and(
              eq(vaultFoldersTable.vaultId, request.vaultId),
              eq(vaultFoldersTable.isDeleted, false),
            ),
          );

        if ((folderRow?.count ?? 0) > 0) {
          throw new Error('authorization.vault_not_empty');
        }

        const [deletedVault] = await tx
          .update(vaultsTable)
          .set({ deletedAt: new Date(), deletedBy: reviewedBy, updatedAt: new Date() })
          .where(
            and(
              eq(vaultsTable.id, request.vaultId),
              isNull(vaultsTable.deletedAt),
              sql`not exists (select 1 from ${documentsTable} where ${documentsTable.vaultId} = ${request.vaultId} and ${documentsTable.isDeleted} = false)`,
              sql`not exists (select 1 from ${vaultFoldersTable} where ${vaultFoldersTable.vaultId} = ${request.vaultId} and ${vaultFoldersTable.isDeleted} = false)`,
            ),
          )
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
      } else if (request.type === 'vault.ai_access_grant') {
        if (request.vaultId === null || request.targetUserId === null) {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const aiAccessLevel = request.payload.aiAccessLevel ?? 'full';
        if (aiAccessLevel !== 'full') {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const [member] = await tx
          .update(vaultMembersTable)
          .set({ aiAccessLevel, updatedAt: new Date() })
          .where(
            and(
              eq(vaultMembersTable.vaultId, request.vaultId),
              eq(vaultMembersTable.userId, request.targetUserId),
            ),
          )
          .returning({ userId: vaultMembersTable.userId });

        if (member === undefined) {
          throw new Error('authorization.permission_request_apply_failed');
        }

        result.vaultId = request.vaultId;
        result.userId = request.targetUserId;
        result.aiAccessLevel = aiAccessLevel;
      } else if (request.type === 'vault.external_invite') {
        if (request.vaultId === null) {
          throw new Error('authorization.invalid_permission_request_payload');
        }

        const email = typeof request.payload.email === 'string' ? normalizeEmail(request.payload.email) : '';
        const role = request.payload.role;
        const aiAccessLevel = request.payload.aiAccessLevel ?? 'none';
        const expiresAt =
          typeof request.payload.expiresAt === 'string'
            ? new Date(request.payload.expiresAt)
            : null;

        if (
          email.length === 0 ||
          (role !== 'owner' && role !== 'editor' && role !== 'viewer') ||
          (aiAccessLevel !== 'none' && aiAccessLevel !== 'full') ||
          (expiresAt !== null && Number.isNaN(expiresAt.getTime()))
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

  return {
    approvePermissionRequest,
    createPermissionRequest,
    getPermissionRequest,
    listPermissionRequests,
    rejectPermissionRequest,
  };
}
