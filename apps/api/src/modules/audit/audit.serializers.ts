import type {
  ActivityFeedItem,
  AuditEventRecord,
  AuditJson,
  AuditLogItem,
  AuditViewer,
} from './audit.types.js';
import { formatAuditEventSummary, getAuditActorLabel } from './audit.formatters.js';

const BASIC_ACTIVITY_EVENT_TYPES = new Set([
  'document.uploaded',
  'document.deleted',
]);

const PRIVILEGED_ACTIVITY_EVENT_TYPES = new Set([
  'document.uploaded',
  'document.viewed',
  'document.downloaded',
  'document.deleted',
  'document.delete_failed',
  'document.access_denied',
]);

const BASIC_METADATA_KEYS = new Set([
  'file_name',
  'file_size',
  'mime_type',
  'document_name',
  'deletion_type',
  'access_method',
]);

export function canViewVaultAuditLog(viewer: AuditViewer) {
  return viewer.role === 'owner' || viewer.isAdmin;
}

export function isPrivilegedAuditViewer(viewer: AuditViewer) {
  return canViewVaultAuditLog(viewer);
}

function filterMetadata(metadata: AuditJson | null, privileged: boolean) {
  if (metadata === null) {
    return {};
  }

  if (privileged) {
    return metadata;
  }

  return Object.fromEntries(Object.entries(metadata).filter(([key]) => BASIC_METADATA_KEYS.has(key)));
}

export function canViewDocumentActivityEvent(event: AuditEventRecord, viewer: AuditViewer) {
  if (isPrivilegedAuditViewer(viewer)) {
    return PRIVILEGED_ACTIVITY_EVENT_TYPES.has(event.eventType);
  }

  return BASIC_ACTIVITY_EVENT_TYPES.has(event.eventType);
}

export function toActivityFeedItem(event: AuditEventRecord, viewer: AuditViewer): ActivityFeedItem {
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    eventType: event.eventType,
    eventCategory: event.eventCategory,
    severity: event.severity,
    outcome: event.outcome,
    actorDisplayName: getAuditActorLabel(event),
    summary: formatAuditEventSummary(event),
    metadata: filterMetadata(event.metadata, isPrivilegedAuditViewer(viewer)),
  };
}

export function toAuditLogItem(event: AuditEventRecord, viewer: AuditViewer): AuditLogItem {
  const privileged = isPrivilegedAuditViewer(viewer);

  return {
    ...toActivityFeedItem(event, viewer),
    actorId: event.actorId,
    actorType: event.actorType,
    vaultId: event.vaultId,
    documentId: event.documentId,
    targetType: event.targetType,
    targetId: event.targetId,
    targetDisplayName: event.targetDisplayName,
    source: event.source,
    severity: event.severity,
    ...(privileged
      ? {
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          requestId: event.requestId,
        }
      : {}),
  };
}
