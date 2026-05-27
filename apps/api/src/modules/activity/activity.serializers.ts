import type { ActivityEventRecord, ActivityFeedItem } from './activity.types.js';
import { formatActivitySummary, getActivityActorLabel } from './activity.formatters.js';

export function toActivityFeedItem(event: ActivityEventRecord): ActivityFeedItem {
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    activityType: event.activityType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorDisplayName: getActivityActorLabel(event),
    summary: formatActivitySummary(event),
    metadata: event.metadata ?? {},
  };
}
