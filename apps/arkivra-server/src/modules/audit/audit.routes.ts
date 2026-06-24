import type { Context, Hono } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type { AuditEventFilters } from './audit.services.js';
import type { AuditViewer } from './audit.types.js';
import { requireAuthentication } from '../auth/auth.middleware.js';
import { requireAdmin } from '../authorization/authorization.middleware.js';
import { createAuditServices } from './audit.services.js';
import { toAuditLogItem, canViewVaultAuditLog } from './audit.serializers.js';

function parseLimit(value: string | undefined, fallback: number, max: number) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function parseDate(value: string | undefined, boundary?: 'start' | 'end') {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && boundary !== undefined
    ? new Date(`${trimmed}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`)
    : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFilters(search: URLSearchParams): AuditEventFilters | null {
  const dateFrom = parseDate(search.get('dateFrom') ?? undefined, 'start');
  const dateTo = parseDate(search.get('dateTo') ?? undefined, 'end');
  const eventTypes = search.getAll('eventType').map(value => value.trim()).filter(Boolean);

  if (dateFrom === null || dateTo === null) {
    return null;
  }

  return {
    eventType: eventTypes.length > 1 ? eventTypes : eventTypes[0],
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

    const { events, nextCursor } = await auditServices.listAuditEvents({ filters });
    const viewer = getViewer(context);

    return context.json({
      events: events.map(event => toAuditLogItem(event, viewer)),
      nextCursor,
    });
  });
}
