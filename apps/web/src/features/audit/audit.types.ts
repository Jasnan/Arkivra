export interface ActivityFeedItem {
  id: string;
  occurredAt: string;
  activityType: string;
  entityType: string;
  entityId: string;
  actorDisplayName: string;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface AuditLogItem {
  id: string;
  occurredAt: string;
  eventType: string;
  eventCategory: string;
  severity: string;
  outcome: string;
  actorDisplayName: string;
  summary: string;
  metadata: Record<string, unknown>;
  actorId: string | null;
  actorType: string;
  vaultId: string | null;
  documentId: string | null;
  targetType: string | null;
  targetId: string | null;
  targetDisplayName: string | null;
  source: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface PaginatedActivityResponse {
  activity: ActivityFeedItem[];
  nextCursor: string | null;
}

export interface PaginatedAuditLogResponse {
  events: AuditLogItem[];
  nextCursor: string | null;
}

export interface AuditLogFilters {
  eventType?: string;
  eventCategory?: string;
  severity?: string;
  actorId?: string;
  vaultId?: string;
  documentId?: string;
  targetType?: string;
  targetId?: string;
  outcome?: string;
  dateFrom?: string;
  dateTo?: string;
}
