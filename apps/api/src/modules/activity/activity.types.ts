import type { AuditActor, AuditJson, AuditSource, AuditTarget } from '../audit/audit.types.js';

export const ACTIVITY_EVENT_TYPES = {
  documentCreated: 'document.created',
  documentMetadataUpdated: 'document.metadata_updated',
  documentDeleted: 'document.deleted',
  documentRestored: 'document.restored',
  documentVersionCreated: 'document.version_created',
  documentVersionRestored: 'document.version_restored',
  documentVersionDeleted: 'document.version_deleted',
  documentMoved: 'document.moved',
  documentProcessingStatusChanged: 'document.processing_status_changed',
  vaultCreated: 'vault.created',
  vaultMetadataUpdated: 'vault.metadata_updated',
  vaultApprovalRequested: 'vault.approval_requested',
  vaultApproved: 'vault.approved',
  vaultRejected: 'vault.rejected',
  vaultDeleted: 'vault.deleted',
  vaultMemberAdded: 'vault.member_added',
  vaultMemberRemoved: 'vault.member_removed',
  vaultMemberRoleChanged: 'vault.member_role_changed',
} as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[keyof typeof ACTIVITY_EVENT_TYPES] | (string & {});

export type ActivityVisibility = 'vault_members' | 'owners' | 'requester' | 'admins';

export type EmitActivityEventInput = {
  activityType: ActivityEventType;
  entityType: 'vault' | 'document' | 'permission_request' | (string & {});
  entityId: string;
  actor?: AuditActor | null;
  vaultId?: string | null;
  documentId?: string | null;
  target?: AuditTarget | null;
  source?: AuditSource;
  visibility?: ActivityVisibility;
  metadata?: AuditJson | null;
  auditEventId?: string | null;
  occurredAt?: Date;
  schemaVersion?: number;
};

export type ActivityEventRecord = {
  id: string;
  createdAt: Date;
  occurredAt: Date;
  activityType: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorType: string;
  actorDisplayName: string | null;
  vaultId: string | null;
  documentId: string | null;
  targetType: string | null;
  targetId: string | null;
  targetDisplayName: string | null;
  source: string;
  visibility: string;
  metadata: AuditJson | null;
  auditEventId: string | null;
  schemaVersion: number;
};

export type ActivityFeedItem = {
  id: string;
  occurredAt: string;
  activityType: string;
  entityType: string;
  entityId: string;
  actorDisplayName: string;
  summary: string;
  metadata: AuditJson;
};
