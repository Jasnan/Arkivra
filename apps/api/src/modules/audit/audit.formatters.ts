import type { AuditEventRecord } from './audit.types.js';

export function getAuditActorLabel(event: Pick<AuditEventRecord, 'actorDisplayName' | 'actorType'>) {
  if (event.actorDisplayName?.trim()) {
    return event.actorDisplayName.trim();
  }

  return event.actorType === 'system' ? 'System' : 'Unknown user';
}

export function formatAuditEventSummary(event: AuditEventRecord) {
  const actor = getAuditActorLabel(event);

  switch (event.eventType) {
    case 'document.uploaded':
      return `${actor} uploaded this document`;
    case 'document.viewed':
      return `${actor} viewed this document`;
    case 'document.downloaded':
      return `${actor} downloaded this document`;
    case 'document.deleted':
      return `${actor} deleted this document`;
    case 'document.delete_failed':
      return `${actor} could not delete this document`;
    case 'document.access_denied':
      return `Access was denied for ${actor}`;
    case 'audit_log.viewed':
      return `${actor} viewed the audit log`;
    case 'audit_log.searched':
      return `${actor} searched the audit log`;
    case 'vault.member_added':
      return `${actor} added a vault member`;
    case 'vault.member_removed':
      return `${actor} removed a vault member`;
    case 'vault.member_role_changed':
      return `${actor} changed a member role`;
    case 'vault.access_denied':
      return `Vault access was denied for ${actor}`;
    default:
      return `${actor} performed ${event.eventType}`;
  }
}
