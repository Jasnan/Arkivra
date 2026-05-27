import type { VaultRole } from '../vaults/vaults.types.js';

export const AUDIT_EVENT_CATEGORIES = ['auth', 'vault', 'document', 'permission', 'audit', 'system'] as const;
export type AuditEventCategory = (typeof AUDIT_EVENT_CATEGORIES)[number];

export const AUDIT_SEVERITIES = ['info', 'notice', 'warning', 'critical'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const AUDIT_OUTCOMES = ['success', 'failure', 'denied'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const AUDIT_ACTOR_TYPES = ['user', 'system', 'api', 'unknown'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_SOURCES = ['web', 'api', 'background', 'system'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];

export const AUDIT_EVENT_TYPES = {
  documentUploaded: 'document.uploaded',
  documentViewed: 'document.viewed',
  documentDownloaded: 'document.downloaded',
  documentDeleted: 'document.deleted',
  documentDeleteFailed: 'document.delete_failed',
  documentAccessDenied: 'document.access_denied',
  vaultMemberAdded: 'vault.member_added',
  vaultMemberRemoved: 'vault.member_removed',
  vaultMemberRoleChanged: 'vault.member_role_changed',
  vaultAccessDenied: 'vault.access_denied',
  auditLogViewed: 'audit_log.viewed',
  auditLogSearched: 'audit_log.searched',
} as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES] | (string & {});

export type AuditActor = {
  id?: string | null;
  type?: AuditActorType;
  displayName?: string | null;
};

export type AuditTarget = {
  type?: string | null;
  id?: string | null;
  displayName?: string | null;
};

export type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export type AuditJson = Record<string, unknown>;

export type EmitAuditEventInput = {
  eventType: AuditEventType;
  eventCategory: AuditEventCategory;
  severity?: AuditSeverity;
  outcome: AuditOutcome;
  actor?: AuditActor | null;
  vaultId?: string | null;
  documentId?: string | null;
  target?: AuditTarget | null;
  source?: AuditSource;
  requestContext?: AuditRequestContext | null;
  metadata?: AuditJson | null;
  before?: AuditJson | null;
  after?: AuditJson | null;
  occurredAt?: Date;
  schemaVersion?: number;
  dedupe?: {
    windowMs: number;
  };
};

export type AuditEventRecord = {
  id: string;
  createdAt: Date;
  occurredAt: Date;
  eventType: string;
  eventCategory: string;
  severity: string;
  outcome: string;
  actorId: string | null;
  actorType: string;
  actorDisplayName: string | null;
  vaultId: string | null;
  documentId: string | null;
  targetType: string | null;
  targetId: string | null;
  targetDisplayName: string | null;
  source: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: AuditJson | null;
  before: AuditJson | null;
  after: AuditJson | null;
  schemaVersion: number;
};

export type ActivityFeedItem = {
  id: string;
  occurredAt: string;
  eventType: string;
  eventCategory: string;
  severity?: string;
  outcome: string;
  actorDisplayName: string;
  summary: string;
  metadata: AuditJson;
};

export type AuditLogItem = ActivityFeedItem & {
  actorId: string | null;
  actorType: string;
  vaultId: string | null;
  documentId: string | null;
  targetType: string | null;
  targetId: string | null;
  targetDisplayName: string | null;
  source: string;
  severity: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export type AuditViewer = {
  role: VaultRole | null;
  isAdmin: boolean;
};
