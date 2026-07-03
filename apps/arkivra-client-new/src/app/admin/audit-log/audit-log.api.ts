import { fetchJson } from "@/lib/api"

export interface AuditResourceContext {
  vaultName?: string | null
  documentName?: string | null
  documentPath?: string | null
  targetName?: string | null
}

export interface AuditLogItem {
  id: string
  occurredAt: string
  eventType: string
  eventCategory: string
  severity: string
  outcome: string
  actorDisplayName: string
  summary: string
  metadata: Record<string, unknown>
  actorId: string | null
  actorType: string
  vaultId: string | null
  documentId: string | null
  targetType: string | null
  targetId: string | null
  targetDisplayName: string | null
  source: string
  ipAddress?: string | null
  userAgent?: string | null
  requestId?: string | null
  resource?: AuditResourceContext
}

export interface PaginatedAuditLogResponse {
  events: AuditLogItem[]
  nextCursor: string | null
}

export interface AuditLogFilters {
  eventType?: string | string[]
  eventCategory?: string
  severity?: string
  actorId?: string
  vaultId?: string | string[]
  documentId?: string
  targetType?: string
  targetId?: string
  outcome?: string
  dateFrom?: string
  dateTo?: string
}

function getFilterValues(value: string | string[] | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : value ? [value] : [])
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function localDateToUtcBoundary(value: string | undefined, boundary: "start" | "end") {
  if (!value) return undefined

  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value

  const date = boundary === "start"
    ? new Date(year, month - 1, day, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 23, 59, 59, 999)

  return date.toISOString()
}

function appendPagination(params: URLSearchParams, cursor?: string | null, limit?: number) {
  if (cursor) {
    params.set("cursor", cursor)
  }

  if (limit !== undefined) {
    params.set("limit", String(limit))
  }
}

function appendAuditFilters(params: URLSearchParams, filters?: AuditLogFilters) {
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item.trim().length > 0) {
          params.append(key, item.trim())
        }
      }
      continue
    }

    if (value !== undefined && value.trim().length > 0) {
      const trimmed = value.trim()
      const queryValue = key === "dateFrom"
        ? localDateToUtcBoundary(trimmed, "start") ?? trimmed
        : key === "dateTo"
          ? localDateToUtcBoundary(trimmed, "end") ?? trimmed
          : trimmed

      params.set(key, queryValue)
    }
  }
}

function sortAuditEvents(events: AuditLogItem[]) {
  return [...events].sort((left, right) => {
    const dateComparison = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
    return dateComparison !== 0 ? dateComparison : right.id.localeCompare(left.id)
  })
}

async function getSingleAdminAuditEvents({
  cursor,
  limit = 50,
  filters,
}: {
  cursor?: string | null
  limit?: number
  filters?: AuditLogFilters
}) {
  const params = new URLSearchParams()
  appendPagination(params, cursor, limit)
  appendAuditFilters(params, filters)

  const suffix = params.toString() ? `?${params.toString()}` : ""
  return fetchJson<PaginatedAuditLogResponse>(`/api/admin/audit-events${suffix}`)
}

export async function getAdminAuditEvents({
  cursor,
  limit = 50,
  filters,
}: {
  cursor?: string | null
  limit?: number
  filters?: AuditLogFilters
}) {
  const vaultIds = getFilterValues(filters?.vaultId)

  if (vaultIds.length <= 1) {
    return getSingleAdminAuditEvents({
      cursor,
      limit,
      filters: {
        ...filters,
        vaultId: vaultIds[0],
      },
    })
  }

  const responses = await Promise.all(
    vaultIds.map((vaultId) =>
      getSingleAdminAuditEvents({
        cursor,
        limit,
        filters: {
          ...filters,
          vaultId,
        },
      })
    )
  )
  const eventsById = new Map<string, AuditLogItem>()

  for (const response of responses) {
    for (const event of response.events) {
      eventsById.set(event.id, event)
    }
  }

  const mergedEvents = sortAuditEvents(Array.from(eventsById.values()))
  const events = mergedEvents.slice(0, limit)
  const hasMore = mergedEvents.length > limit || responses.some((response) => response.nextCursor !== null)

  return {
    events,
    nextCursor: hasMore ? events.at(-1)?.occurredAt ?? null : null,
  }
}
