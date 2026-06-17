import type { Database } from '../database/database.js';
import type { AuditEventRecord, EmitAuditEventInput } from './audit.types.js';
import { and, desc, eq, inArray, lt, notInArray, sql } from 'drizzle-orm';
import {
  auditEventsTable,
  documentsTable,
  vaultFoldersTable,
  vaultsTable,
} from '../database/schema/index.js';
import { buildLogicalFolderPath } from '../folders/folders.services.js';
import { sanitizeAuditJson, sanitizeAuditMetadata } from './audit.redaction.js';

const PASSIVE_AUDIT_LOG_EVENT_TYPES = ['audit_log.viewed', 'audit_log.searched'];

export type AuditEventFilters = {
  eventType?: string | string[];
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

    return paginateRows(await enrichAuditResourceContexts(rows), limit);
  }

  async function listVaultAuditEvents({
    vaultId,
    filters = {},
  }: {
    vaultId: string;
    filters?: AuditEventFilters;
  }) {
    const limit = filters.limit ?? 50;
    const conditions = [
      eq(auditEventsTable.vaultId, vaultId),
      notInArray(auditEventsTable.eventType, PASSIVE_AUDIT_LOG_EVENT_TYPES),
    ];

    if (Array.isArray(filters.eventType)) {
      if (filters.eventType.length > 0) {
        conditions.push(inArray(auditEventsTable.eventType, filters.eventType));
      }
    } else if (filters.eventType !== undefined) {
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

    return paginateRows(await enrichAuditResourceContexts(rows), limit);
  }

  async function listAuditEvents({ filters = {} }: { filters?: AuditEventFilters }) {
    const limit = filters.limit ?? 50;
    const conditions = [
      notInArray(auditEventsTable.eventType, PASSIVE_AUDIT_LOG_EVENT_TYPES),
    ];

    if (Array.isArray(filters.eventType)) {
      if (filters.eventType.length > 0) {
        conditions.push(inArray(auditEventsTable.eventType, filters.eventType));
      }
    } else if (filters.eventType !== undefined) {
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

    return paginateRows(await enrichAuditResourceContexts(rows), limit);
  }

  async function enrichAuditResourceContexts(rows: AuditEventRecord[]) {
    if (rows.length === 0) {
      return rows;
    }

    const vaultIds = Array.from(new Set(
      rows
        .flatMap(row => [
          row.vaultId,
          row.targetType === 'vault' ? row.targetId : null,
        ])
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ));
    const documentIds = Array.from(new Set(
      rows
        .flatMap(row => [
          row.documentId,
          row.targetType === 'document' ? row.targetId : null,
        ])
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ));

    const vaultRows = vaultIds.length > 0
      ? await db
          .select({ id: vaultsTable.id, name: vaultsTable.name })
          .from(vaultsTable)
          .where(inArray(vaultsTable.id, vaultIds))
      : [];
    const documentRows = documentIds.length > 0
      ? await db
          .select({
            id: documentsTable.id,
            vaultId: documentsTable.vaultId,
            folderId: documentsTable.folderId,
            name: documentsTable.name,
          })
          .from(documentsTable)
          .where(inArray(documentsTable.id, documentIds))
      : [];
    const folderRows = vaultIds.length > 0
      ? await db
          .select({
            id: vaultFoldersTable.id,
            vaultId: vaultFoldersTable.vaultId,
            parentId: vaultFoldersTable.parentId,
            name: vaultFoldersTable.name,
          })
          .from(vaultFoldersTable)
          .where(inArray(vaultFoldersTable.vaultId, vaultIds))
      : [];

    const vaultsById = new Map(vaultRows.map(vault => [vault.id, vault]));
    const documentsById = new Map(documentRows.map(document => [document.id, document]));
    const foldersByVaultId = new Map<string, typeof folderRows>();

    for (const folder of folderRows) {
      const folders = foldersByVaultId.get(folder.vaultId) ?? [];
      folders.push(folder);
      foldersByVaultId.set(folder.vaultId, folders);
    }

    return rows.map((row) => {
      const vaultId = row.vaultId ?? (row.targetType === 'vault' ? row.targetId : null);
      const documentId = row.documentId ?? (row.targetType === 'document' ? row.targetId : null);
      const document = documentId === null ? null : documentsById.get(documentId) ?? null;
      const vault = (document?.vaultId ?? vaultId) === null
        ? null
        : vaultsById.get(document?.vaultId ?? vaultId ?? '') ?? null;
      let folderPath: string | null = null;

      if (document?.folderId) {
        const folders = foldersByVaultId.get(document.vaultId) ?? [];
        try {
          folderPath = buildLogicalFolderPath(folders, document.folderId).replaceAll('/', ' / ');
        } catch {
          folderPath = null;
        }
      }

      const documentPath = document === null
        ? null
        : [vault?.name, folderPath, document.name].filter(Boolean).join(' / ');

      return {
        ...row,
        resource: {
          vaultName: vault?.name ?? null,
          documentName: document?.name ?? null,
          documentPath: documentPath?.length ? documentPath : null,
          targetName: row.targetDisplayName ?? document?.name ?? vault?.name ?? null,
        },
      };
    });
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
