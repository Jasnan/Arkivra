import type { Context, Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { AuditEventFilters } from './audit.services.js';
import type { AuditViewer } from './audit.types.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireAdmin } from '../authorization/authorization.middleware.js';
import { createAuditServices } from './audit.services.js';
import { toAuditLogItem, canViewVaultAuditLog } from './audit.serializers.js';
import { AUDIT_EVENT_TYPES } from './audit.types.js';
import { getAuditActorFromContext, getAuditRequestContext } from './audit.http.js';

function parseLimit(value: string | undefined, fallback: number, max: number) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function parseDate(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFilters(search: URLSearchParams): AuditEventFilters | null {
  const dateFrom = parseDate(search.get('dateFrom') ?? undefined);
  const dateTo = parseDate(search.get('dateTo') ?? undefined);

  if (dateFrom === null || dateTo === null) {
    return null;
  }

  return {
    eventType: search.get('eventType')?.trim() || undefined,
    eventCategory: search.get('eventCategory')?.trim() || undefined,
    severity: search.get('severity')?.trim() || undefined,
    actorId: search.get('actorId')?.trim() || undefined,
    vaultId: search.get('vaultId')?.trim() || undefined,
    documentId: search.get('documentId')?.trim() || undefined,
    targetType: search.get('targetType')?.trim() || undefined,
    targetId: search.get('targetId')?.trim() || undefined,
    outcome: search.get('outcome')?.trim() || undefined,
    cursor: search.get('cursor')?.trim() || undefined,
    dateFrom,
    dateTo,
    limit: parseLimit(search.get('limit') ?? undefined, 50, 100),
  };
}

function getViewer(context: Context<ServerContext>): AuditViewer {
  return {
    role: context.get('vaultRole'),
    isAdmin: context.get('isAdmin'),
  };
}

export function registerAuditRoutes({
  app,
  db,
  services,
}: {
  app: Hono<ServerContext>;
  db: Database;
  services?: ReturnType<typeof createAuditServices>;
}) {
  const auditServices = services ?? createAuditServices({ db });

  app.get('/api/vaults/:vaultId/audit-events', async (context) => {
    const vaultId = context.get('vaultId');

    if (vaultId === null) {
      return context.json({ error: { code: 'vault.forbidden', message: 'Forbidden' } }, 403);
    }

    const viewer = getViewer(context);
    if (!canViewVaultAuditLog(viewer)) {
      return context.json({ error: { code: 'audit_log.forbidden', message: 'Forbidden' } }, 403);
    }

    const search = new URL(context.req.url).searchParams;
    const filters = getFilters(search);

    if (filters === null) {
      return context.json(
        { error: { code: 'audit_log.invalid_filters', message: 'Invalid audit log filters' } },
        400,
      );
    }

    const hasFilters = ['eventType', 'eventCategory', 'severity', 'actorId', 'documentId', 'outcome', 'dateFrom', 'dateTo']
      .some(key => search.has(key));

    if (hasFilters) {
      await auditServices.emitAuditEvent({
        eventType: AUDIT_EVENT_TYPES.auditLogSearched,
        eventCategory: 'audit',
        outcome: 'success',
        actor: getAuditActorFromContext(context),
        vaultId,
        target: { type: 'vault', id: vaultId },
        source: 'web',
        requestContext: getAuditRequestContext(context),
        metadata: { filters_applied: true },
      });
    }

    const { events, nextCursor } = await auditServices.listVaultAuditEvents({ vaultId, filters });

    return context.json({
      events: events.map(event => toAuditLogItem(event, viewer)),
      nextCursor,
    });
  });

  app.get('/api/admin/audit-events', requireAuthentication(), requireAdmin(), async (context) => {
    const search = new URL(context.req.url).searchParams;
    const filters = getFilters(search);

    if (filters === null) {
      return context.json(
        { error: { code: 'audit_log.invalid_filters', message: 'Invalid audit log filters' } },
        400,
      );
    }

    const hasFilters = [
      'eventType',
      'eventCategory',
      'severity',
      'actorId',
      'vaultId',
      'documentId',
      'targetType',
      'targetId',
      'outcome',
      'dateFrom',
      'dateTo',
    ].some(key => search.has(key));

    await auditServices.emitAuditEvent({
      eventType: hasFilters ? AUDIT_EVENT_TYPES.auditLogSearched : AUDIT_EVENT_TYPES.auditLogViewed,
      eventCategory: 'audit',
      severity: 'notice',
      outcome: 'success',
      actor: getAuditActorFromContext(context),
      target: { type: 'audit_log', id: 'admin' },
      source: 'web',
      requestContext: getAuditRequestContext(context),
      metadata: { filters_applied: hasFilters },
    });

    const { events, nextCursor } = await auditServices.listAuditEvents({ filters });
    const viewer = getViewer(context);

    return context.json({
      events: events.map(event => toAuditLogItem(event, viewer)),
      nextCursor,
    });
  });
}
