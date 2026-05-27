import type { Database } from '../database/database.js';
import type { AuditEventRecord, EmitAuditEventInput } from './audit.types.js';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { auditEventsTable } from '../database/schema/index.js';
import { sanitizeAuditJson, sanitizeAuditMetadata } from './audit.redaction.js';

export type AuditEventFilters = {
  eventType?: string;
  eventCategory?: string;
  severity?: string;
  actorId?: string;
  vaultId?: string;
  documentId?: string;
  targetType?: string;
  targetId?: string;
  outcome?: string;
  dateFrom?: Date;
  dateTo?: Date;
  cursor?: string;
  limit?: number;
};

export function createAuditServices({ db }: { db: Database }) {
  async function emitAuditEvent(input: EmitAuditEventInput) {
    const now = input.occurredAt ?? new Date();
    const actor = input.actor ?? null;
    const target = input.target ?? null;
    const requestContext = input.requestContext ?? null;
    const metadata = sanitizeAuditMetadata(input.eventType, input.metadata);
    const before = sanitizeAuditJson(input.before);
    const after = sanitizeAuditJson(input.after);

    if (input.dedupe !== undefined && actor?.id && input.documentId) {
      const [recent] = await db
        .select({ id: auditEventsTable.id, occurredAt: auditEventsTable.occurredAt })
        .from(auditEventsTable)
        .where(
          and(
            eq(auditEventsTable.eventType, input.eventType),
            eq(auditEventsTable.actorId, actor.id),
            eq(auditEventsTable.documentId, input.documentId),
            eq(auditEventsTable.vaultId, input.vaultId ?? ''),
            sql`${auditEventsTable.occurredAt} >= ${new Date(now.getTime() - input.dedupe.windowMs)}`,
          ),
        )
        .orderBy(desc(auditEventsTable.occurredAt))
        .limit(1);

      if (recent !== undefined) {
        return recent;
      }
    }

    const [event] = await db
      .insert(auditEventsTable)
      .values({
        occurredAt: now,
        eventType: input.eventType,
        eventCategory: input.eventCategory,
        severity: input.severity ?? 'info',
        outcome: input.outcome,
        actorId: actor?.id ?? null,
        actorType: actor?.type ?? (actor?.id ? 'user' : 'unknown'),
        actorDisplayName: actor?.displayName ?? null,
        vaultId: input.vaultId ?? null,
        documentId: input.documentId ?? null,
        targetType: target?.type ?? null,
        targetId: target?.id ?? input.documentId ?? input.vaultId ?? null,
        targetDisplayName: target?.displayName ?? null,
        source: input.source ?? 'api',
        ipAddress: requestContext?.ipAddress ?? null,
        userAgent: requestContext?.userAgent ?? null,
        requestId: requestContext?.requestId ?? null,
        metadata,
        before,
        after,
        schemaVersion: input.schemaVersion ?? 1,
      })
      .returning();

    if (event === undefined) {
      throw new Error('Failed to write audit event');
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
      eq(auditEventsTable.vaultId, vaultId),
      eq(auditEventsTable.documentId, documentId),
    ];

    if (cursor !== undefined) {
      conditions.push(lt(auditEventsTable.occurredAt, new Date(cursor)));
    }

    const rows = await db
      .select()
      .from(auditEventsTable)
      .where(and(...conditions))
      .orderBy(desc(auditEventsTable.occurredAt), desc(auditEventsTable.id))
      .limit(limit + 1);

    return paginateRows(rows, limit);
  }

  async function listVaultAuditEvents({
    vaultId,
    filters = {},
  }: {
    vaultId: string;
    filters?: AuditEventFilters;
  }) {
    const limit = filters.limit ?? 50;
    const conditions = [eq(auditEventsTable.vaultId, vaultId)];

    if (filters.eventType !== undefined) {
      conditions.push(eq(auditEventsTable.eventType, filters.eventType));
    }

    if (filters.eventCategory !== undefined) {
      conditions.push(eq(auditEventsTable.eventCategory, filters.eventCategory));
    }

    if (filters.severity !== undefined) {
      conditions.push(eq(auditEventsTable.severity, filters.severity));
    }

    if (filters.actorId !== undefined) {
      conditions.push(eq(auditEventsTable.actorId, filters.actorId));
    }

    if (filters.documentId !== undefined) {
      conditions.push(eq(auditEventsTable.documentId, filters.documentId));
    }

    if (filters.outcome !== undefined) {
      conditions.push(eq(auditEventsTable.outcome, filters.outcome));
    }

    if (filters.dateFrom !== undefined) {
      conditions.push(sql`${auditEventsTable.occurredAt} >= ${filters.dateFrom}`);
    }

    if (filters.dateTo !== undefined) {
      conditions.push(sql`${auditEventsTable.occurredAt} <= ${filters.dateTo}`);
    }

    if (filters.cursor !== undefined) {
      conditions.push(lt(auditEventsTable.occurredAt, new Date(filters.cursor)));
    }

    const rows = await db
      .select()
      .from(auditEventsTable)
      .where(and(...conditions))
      .orderBy(desc(auditEventsTable.occurredAt), desc(auditEventsTable.id))
      .limit(limit + 1);

    return paginateRows(rows, limit);
  }

  async function listAuditEvents({ filters = {} }: { filters?: AuditEventFilters }) {
    const limit = filters.limit ?? 50;
    const conditions = [];

    if (filters.eventType !== undefined) {
      conditions.push(eq(auditEventsTable.eventType, filters.eventType));
    }

    if (filters.eventCategory !== undefined) {
      conditions.push(eq(auditEventsTable.eventCategory, filters.eventCategory));
    }

    if (filters.severity !== undefined) {
      conditions.push(eq(auditEventsTable.severity, filters.severity));
    }

    if (filters.actorId !== undefined) {
      conditions.push(eq(auditEventsTable.actorId, filters.actorId));
    }

    if (filters.vaultId !== undefined) {
      conditions.push(eq(auditEventsTable.vaultId, filters.vaultId));
    }

    if (filters.documentId !== undefined) {
      conditions.push(eq(auditEventsTable.documentId, filters.documentId));
    }

    if (filters.targetType !== undefined) {
      conditions.push(eq(auditEventsTable.targetType, filters.targetType));
    }

    if (filters.targetId !== undefined) {
      conditions.push(eq(auditEventsTable.targetId, filters.targetId));
    }

    if (filters.outcome !== undefined) {
      conditions.push(eq(auditEventsTable.outcome, filters.outcome));
    }

    if (filters.dateFrom !== undefined) {
      conditions.push(sql`${auditEventsTable.occurredAt} >= ${filters.dateFrom}`);
    }

    if (filters.dateTo !== undefined) {
      conditions.push(sql`${auditEventsTable.occurredAt} <= ${filters.dateTo}`);
    }

    if (filters.cursor !== undefined) {
      conditions.push(lt(auditEventsTable.occurredAt, new Date(filters.cursor)));
    }

    let query = db
      .select()
      .from(auditEventsTable)
      .$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query
      .orderBy(desc(auditEventsTable.occurredAt), desc(auditEventsTable.id))
      .limit(limit + 1);

    return paginateRows(rows, limit);
  }

  return {
    emitAuditEvent,
    listAuditEvents,
    listDocumentActivity,
    listVaultAuditEvents,
  };
}

function paginateRows(rows: AuditEventRecord[], limit: number) {
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? events.at(-1)?.occurredAt.toISOString() ?? null : null;

  return { events, nextCursor };
}
