import type { ActivityEventRecord } from './activity.types.js';

export function getActivityActorLabel(event: Pick<ActivityEventRecord, 'actorDisplayName' | 'actorType'>) {
  if (event.actorDisplayName?.trim()) {
    return event.actorDisplayName.trim();
  }

  return event.actorType === 'system' ? 'System' : 'Unknown user';
}

function getMetadataString(event: ActivityEventRecord, key: string) {
  const value = event.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function formatActivitySummary(event: ActivityEventRecord) {
  const actor = getActivityActorLabel(event);

  switch (event.activityType) {
    case 'document.created':
      return `${actor} uploaded file`;
    case 'document.metadata_updated': {
      const fields = event.metadata?.changed_fields;
      const label = Array.isArray(fields) && fields.length > 0
        ? fields.map(String).join(', ')
        : 'metadata';
      return `${actor} updated ${label}`;
    }
    case 'document.deleted':
      return `${actor} deleted file`;
    case 'document.restored':
      return `${actor} restored file`;
    case 'document.version_created':
      return `${actor} uploaded a new version`;
    case 'document.version_restored':
      return `${actor} restored a document version`;
    case 'document.version_deleted':
      return `${actor} deleted a document version`;
    case 'document.moved': {
      const from = getMetadataString(event, 'from_path') ?? 'Unknown location';
      const to = getMetadataString(event, 'to_path') ?? 'Unknown location';
      return `${actor} moved file from ${from} to ${to}`;
    }
    case 'document.processing_status_changed': {
      const stage = getMetadataString(event, 'processing_status') ?? 'processing';
      return `Document ${stage.replaceAll('_', ' ')}`;
    }
    case 'vault.created':
      return `${actor} created this vault`;
    case 'vault.metadata_updated':
      return `${actor} updated vault metadata`;
    case 'vault.approval_requested':
      return `${actor} requested vault approval`;
    case 'vault.approved':
      return `${actor} approved this vault`;
    case 'vault.rejected':
      return `${actor} rejected this vault`;
    case 'vault.deleted':
      return `${actor} deleted this vault`;
    case 'vault.member_added':
      return `${actor} added a vault member`;
    case 'vault.member_removed':
      return `${actor} removed a vault member`;
    case 'vault.member_role_changed':
      return `${actor} changed member access`;
    default:
      return `${actor} performed ${event.activityType}`;
  }
}
