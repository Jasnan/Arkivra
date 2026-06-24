import type { Database } from '../database/database.js';
import type { ActivityEventRecord, EmitActivityEventInput } from './activity.types.js';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { activityEventsTable } from '../database/schema/index.js';
import { sanitizeAuditJson } from '../audit/audit.redaction.js';

export function createActivityServices({ db }: { db: Database }) {
  async function emitActivityEvent(input: EmitActivityEventInput) {
    const actor = input.actor ?? null;
    const target = input.target ?? null;
    const [event] = await db
      .insert(activityEventsTable)
      .values({
        occurredAt: input.occurredAt ?? sql`now()`,
        activityType: input.activityType,
        entityType: input.entityType,
        entityId: input.entityId,
        actorId: actor?.id ?? null,
        actorType: actor?.type ?? (actor?.id ? 'user' : 'unknown'),
        actorDisplayName: actor?.displayName ?? null,
        vaultId: input.vaultId ?? null,
        documentId: input.documentId ?? null,
        targetType: target?.type ?? null,
        targetId: target?.id ?? null,
        targetDisplayName: target?.displayName ?? null,
        source: input.source ?? 'api',
        visibility: input.visibility ?? 'vault_members',
        metadata: sanitizeAuditJson(input.metadata),
        auditEventId: input.auditEventId ?? null,
        schemaVersion: input.schemaVersion ?? 1,
      })
      .returning();

    if (event === undefined) {
      throw new Error('Failed to write activity event');
    }

    return event;
  }

  async function listDocumentActivity({
    vaultId,
    documentId,
    cursor,
    limit = 25,
  }: {
    vaultId: string;
    documentId: string;
    cursor?: string;
    limit?: number;
  }) {
    const conditions = [
      eq(activityEventsTable.vaultId, vaultId),
      eq(activityEventsTable.documentId, documentId),
    ];

    if (cursor !== undefined) {
      conditions.push(lt(activityEventsTable.occurredAt, new Date(cursor)));
    }

    const rows = await db
      .select()
      .from(activityEventsTable)
      .where(and(...conditions))
      .orderBy(desc(activityEventsTable.occurredAt), desc(activityEventsTable.id))
      .limit(limit + 1);

    return paginateRows(rows, limit);
  }

  async function listVaultActivity({
    vaultId,
    cursor,
    limit = 50,
  }: {
    vaultId: string;
    cursor?: string;
    limit?: number;
  }) {
    const conditions = [
      eq(activityEventsTable.vaultId, vaultId),
      sql`(${activityEventsTable.activityType} <> 'document.processing_status_changed' OR ${activityEventsTable.metadata}->>'processing_status' = 'failed')`,
    ];

    if (cursor !== undefined) {
      conditions.push(lt(activityEventsTable.occurredAt, new Date(cursor)));
    }

    const rows = await db
      .select()
      .from(activityEventsTable)
      .where(and(...conditions))
      .orderBy(desc(activityEventsTable.occurredAt), desc(activityEventsTable.id))
      .limit(limit + 1);

    return paginateRows(rows, limit);
  }

  return {
    emitActivityEvent,
    listDocumentActivity,
    listVaultActivity,
  };
}

function paginateRows(rows: ActivityEventRecord[], limit: number) {
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? events.at(-1)?.occurredAt.toISOString() ?? null : null;

  return { events, nextCursor };
}
