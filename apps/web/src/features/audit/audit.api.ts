import { fetchJson } from '@/lib/api';
import { localDateToUtcBoundary } from '@/lib/localization';
import type { AuditLogFilters, PaginatedActivityResponse, PaginatedAuditLogResponse } from './audit.types';

function appendPagination(params: URLSearchParams, cursor?: string | null, limit?: number) {
  if (cursor) {
    params.set('cursor', cursor);
  }

  if (limit !== undefined) {
    params.set('limit', String(limit));
  }
}

function appendAuditFilters(params: URLSearchParams, filters?: AuditLogFilters) {
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item.trim().length > 0) {
          params.append(key, item.trim());
        }
      }
    } else if (value !== undefined && value.trim().length > 0) {
      const trimmed = value.trim();
      const queryValue = key === 'dateFrom'
        ? localDateToUtcBoundary(trimmed, 'start') ?? trimmed
        : key === 'dateTo'
          ? localDateToUtcBoundary(trimmed, 'end') ?? trimmed
          : trimmed;

      params.set(key, queryValue);
    }
  }
}

export function getDocumentActivity({
  vaultId,
  documentId,
  cursor,
  limit = 25,
}: {
  vaultId: string;
  documentId: string;
  cursor?: string | null;
  limit?: number;
}) {
  const params = new URLSearchParams();
  appendPagination(params, cursor, limit);
  const suffix = params.toString() ? `?${params.toString()}` : '';

  return fetchJson<PaginatedActivityResponse>(
    `/api/vaults/${vaultId}/documents/${documentId}/activity${suffix}`,
  );
}

export function getVaultAuditEvents({
  vaultId,
  cursor,
  limit = 50,
  filters,
}: {
  vaultId: string;
  cursor?: string | null;
  limit?: number;
  filters?: AuditLogFilters;
}) {
  const params = new URLSearchParams();
  appendPagination(params, cursor, limit);

  appendAuditFilters(params, filters);

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return fetchJson<PaginatedAuditLogResponse>(`/api/vaults/${vaultId}/audit-events${suffix}`);
}

export function getVaultActivity({
  vaultId,
  cursor,
  limit = 50,
}: {
  vaultId: string;
  cursor?: string | null;
  limit?: number;
}) {
  const params = new URLSearchParams();
  appendPagination(params, cursor, limit);
  const suffix = params.toString() ? `?${params.toString()}` : '';

  return fetchJson<PaginatedActivityResponse>(`/api/vaults/${vaultId}/activity${suffix}`);
}

export function getAdminAuditEvents({
  cursor,
  limit = 50,
  filters,
}: {
  cursor?: string | null;
  limit?: number;
  filters?: AuditLogFilters;
}) {
  const params = new URLSearchParams();
  appendPagination(params, cursor, limit);

  appendAuditFilters(params, filters);

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return fetchJson<PaginatedAuditLogResponse>(`/api/admin/audit-events${suffix}`);
}
