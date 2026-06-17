import type { Context } from 'hono';
import type { createActivityServices } from '../activity/activity.services.js';
import { ACTIVITY_EVENT_TYPES } from '../activity/activity.types.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { getAuditActorFromContext, getAuditRequestContext } from '../audit/audit.http.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import type { ServerContext } from '../server/server.types.js';
import { getMemberUpdateAuditEventType } from './vaults.route-helpers.js';
import type { AiAccessLevel, VaultRole } from './vaults.types.js';

type VaultMemberRouteContext = Context<ServerContext>;
type AuditServices = ReturnType<typeof createAuditServices>;
type ActivityServices = ReturnType<typeof createActivityServices>;

function userTarget(memberUserId: string, displayName?: string) {
  return displayName === undefined
    ? { type: 'user' as const, id: memberUserId }
    : { type: 'user' as const, id: memberUserId, displayName };
}

export async function emitVaultOwnerPromotionRequested({
  context,
  auditServices,
  vaultId,
  memberUserId,
  requestId,
  displayName,
}: {
  context: VaultMemberRouteContext;
  auditServices?: AuditServices;
  vaultId: string;
  memberUserId: string;
  requestId: string;
  displayName?: string;
}) {
  await auditServices?.emitAuditEvent({
    eventType: AUDIT_EVENT_TYPES.vaultOwnerPromotionRequested,
    eventCategory: 'permission',
    severity: 'notice',
    outcome: 'success',
    actor: getAuditActorFromContext(context),
    vaultId,
    target: userTarget(memberUserId, displayName),
    source: 'web',
    requestContext: getAuditRequestContext(context),
    metadata: { request_id: requestId, request_type: 'vault.owner_promote', member_user_id: memberUserId },
  });
}

export async function emitVaultAiAccessRequested({
  context,
  auditServices,
  vaultId,
  memberUserId,
  requestId,
  displayName,
}: {
  context: VaultMemberRouteContext;
  auditServices?: AuditServices;
  vaultId: string;
  memberUserId: string;
  requestId: string;
  displayName?: string;
}) {
  await auditServices?.emitAuditEvent({
    eventType: AUDIT_EVENT_TYPES.vaultAiAccessRequested,
    eventCategory: 'permission',
    severity: 'notice',
    outcome: 'success',
    actor: getAuditActorFromContext(context),
    vaultId,
    target: userTarget(memberUserId, displayName),
    source: 'web',
    requestContext: getAuditRequestContext(context),
    metadata: { request_id: requestId, request_type: 'vault.ai_access_grant', member_user_id: memberUserId },
  });
}

export async function emitVaultExternalInvitationRequested({
  context,
  auditServices,
  activityServices,
  vaultId,
  requestId,
  email,
  role,
  aiAccessLevel,
}: {
  context: VaultMemberRouteContext;
  auditServices?: AuditServices;
  activityServices?: ActivityServices;
  vaultId: string;
  requestId: string;
  email: string;
  role: string;
  aiAccessLevel: string;
}) {
  await activityServices?.emitActivityEvent({
    activityType: ACTIVITY_EVENT_TYPES.vaultApprovalRequested,
    entityType: 'permission_request',
    entityId: requestId,
    actor: getAuditActorFromContext(context),
    vaultId,
    target: { type: 'permission_request', id: requestId, displayName: email },
    source: 'web',
    metadata: { request_type: 'vault.external_invite', email, role, ai_access_level: aiAccessLevel },
  });
  await auditServices?.emitAuditEvent({
    eventType: AUDIT_EVENT_TYPES.vaultExternalInvitationRequested,
    eventCategory: 'permission',
    severity: 'notice',
    outcome: 'success',
    actor: getAuditActorFromContext(context),
    vaultId,
    target: { type: 'email_invitation', displayName: email },
    source: 'web',
    requestContext: getAuditRequestContext(context),
    metadata: { request_id: requestId, request_type: 'vault.external_invite', email, role, ai_access_level: aiAccessLevel },
  });
}

export async function emitVaultMemberAdded({
  context,
  auditServices,
  activityServices,
  vaultId,
  memberUserId,
  role,
  aiAccessLevel,
  displayName,
}: {
  context: VaultMemberRouteContext;
  auditServices?: AuditServices;
  activityServices?: ActivityServices;
  vaultId: string;
  memberUserId: string;
  role: string;
  aiAccessLevel: string;
  displayName?: string;
}) {
  await auditServices?.emitAuditEvent({
    eventType: AUDIT_EVENT_TYPES.vaultMemberAdded,
    eventCategory: 'vault',
    outcome: 'success',
    actor: getAuditActorFromContext(context),
    vaultId,
    target: userTarget(memberUserId, displayName),
    source: 'web',
    requestContext: getAuditRequestContext(context),
    metadata: { member_user_id: memberUserId, role, ai_access_level: aiAccessLevel },
  });
  await activityServices?.emitActivityEvent({
    activityType: ACTIVITY_EVENT_TYPES.vaultMemberAdded,
    entityType: 'vault',
    entityId: vaultId,
    actor: getAuditActorFromContext(context),
    vaultId,
    target: { type: 'user', id: memberUserId },
    source: 'web',
    metadata: { member_user_id: memberUserId, role, ai_access_level: aiAccessLevel },
  });
}

export async function emitVaultMemberUpdated({
  context,
  auditServices,
  activityServices,
  vaultId,
  memberUserId,
  previousRole,
  nextRole,
  previousAiAccessLevel,
  nextAiAccessLevel,
}: {
  context: VaultMemberRouteContext;
  auditServices?: AuditServices;
  activityServices?: ActivityServices;
  vaultId: string;
  memberUserId: string;
  previousRole: VaultRole;
  nextRole: VaultRole;
  previousAiAccessLevel: AiAccessLevel;
  nextAiAccessLevel: AiAccessLevel;
}) {
  await auditServices?.emitAuditEvent({
    eventType: getMemberUpdateAuditEventType({
      previousRole,
      nextRole,
      previousAiAccessLevel,
      nextAiAccessLevel,
    }),
    eventCategory: 'vault',
    outcome: 'success',
    actor: getAuditActorFromContext(context),
    vaultId,
    target: { type: 'user', id: memberUserId },
    source: 'web',
    requestContext: getAuditRequestContext(context),
    metadata: {
      member_user_id: memberUserId,
      previous_role: previousRole,
      next_role: nextRole,
      previous_ai_access_level: previousAiAccessLevel,
      next_ai_access_level: nextAiAccessLevel,
    },
  });
  await activityServices?.emitActivityEvent({
    activityType: nextRole !== previousRole || nextAiAccessLevel !== previousAiAccessLevel
      ? ACTIVITY_EVENT_TYPES.vaultMemberRoleChanged
      : ACTIVITY_EVENT_TYPES.vaultMemberAdded,
    entityType: 'vault',
    entityId: vaultId,
    actor: getAuditActorFromContext(context),
    vaultId,
    target: { type: 'user', id: memberUserId },
    source: 'web',
    metadata: {
      member_user_id: memberUserId,
      previous_role: previousRole,
      next_role: nextRole,
      previous_ai_access_level: previousAiAccessLevel,
      next_ai_access_level: nextAiAccessLevel,
    },
  });
}

export async function emitVaultMemberRemoved({
  context,
  auditServices,
  activityServices,
  vaultId,
  memberUserId,
  role,
}: {
  context: VaultMemberRouteContext;
  auditServices?: AuditServices;
  activityServices?: ActivityServices;
  vaultId: string;
  memberUserId: string;
  role: string;
}) {
  await auditServices?.emitAuditEvent({
    eventType: AUDIT_EVENT_TYPES.vaultMemberRemoved,
    eventCategory: 'vault',
    outcome: 'success',
    actor: getAuditActorFromContext(context),
    vaultId,
    target: { type: 'user', id: memberUserId },
    source: 'web',
    requestContext: getAuditRequestContext(context),
    metadata: { member_user_id: memberUserId, role },
  });
  await activityServices?.emitActivityEvent({
    activityType: ACTIVITY_EVENT_TYPES.vaultMemberRemoved,
    entityType: 'vault',
    entityId: vaultId,
    actor: getAuditActorFromContext(context),
    vaultId,
    target: { type: 'user', id: memberUserId },
    source: 'web',
    metadata: { member_user_id: memberUserId, role },
  });
}
