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
  documentRestored: 'document.restored',
  documentVersionCreated: 'document.version_created',
  documentVersionRestored: 'document.version_restored',
  documentVersionDeleted: 'document.version_deleted',
  documentVersionDeleteFailed: 'document.version_delete_failed',
  documentAccessDenied: 'document.access_denied',
  vaultMemberAdded: 'vault.member_added',
  vaultMemberRemoved: 'vault.member_removed',
  vaultMemberRoleChanged: 'vault.member_role_changed',
  vaultOwnerPromotionRequested: 'vault.owner_promotion_requested',
  vaultOwnerPromotionApproved: 'vault.owner_promotion_approved',
  vaultOwnerPromotionRejected: 'vault.owner_promotion_rejected',
  vaultOwnerRoleRemoved: 'vault.owner_role_removed',
  vaultAiAccessRequested: 'vault.ai_access_requested',
  vaultAiAccessApproved: 'vault.ai_access_approved',
  vaultAiAccessRejected: 'vault.ai_access_rejected',
  vaultAiAccessEnabled: 'vault.ai_access_enabled',
  vaultAiAccessDisabled: 'vault.ai_access_disabled',
  vaultExternalInvitationRequested: 'vault.external_invitation_requested',
  vaultExternalInvitationApproved: 'vault.external_invitation_approved',
  vaultExternalInvitationRejected: 'vault.external_invitation_rejected',
  vaultExternalInvitationSent: 'vault.external_invitation_sent',
  permissionRequestCreated: 'permission_request.created',
  permissionRequestApproved: 'permission_request.approved',
  permissionRequestRejected: 'permission_request.rejected',
  vaultAccessDenied: 'vault.access_denied',
  authTwoFactorEnabled: 'auth.two_factor_enabled',
  authTwoFactorDisabled: 'auth.two_factor_disabled',
  authPasswordChanged: 'auth.password_changed',
  authPasswordSet: 'auth.password_set',
  authEmailChangeRequested: 'auth.email_change_requested',
  authEmailChanged: 'auth.email_changed',
  authOAuthLinkRequested: 'auth.oauth_link_requested',
  authOAuthLinked: 'auth.oauth_linked',
  authOAuthUnlinked: 'auth.oauth_unlinked',
  authSensitiveActionDenied: 'auth.sensitive_action_denied',
  aiFeaturesToggled: 'ai.features_toggled',
  aiChatModelChanged: 'ai.chat_model_changed',
  aiTranslationModelChanged: 'ai.translation_model_changed',
  aiEmbeddingModelChanged: 'ai.embedding_model_changed',
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
  resource?: AuditResourceContext;
};

export type AuditResourceContext = {
  vaultName?: string | null;
  documentName?: string | null;
  documentPath?: string | null;
  targetName?: string | null;
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
  resource?: AuditResourceContext;
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
