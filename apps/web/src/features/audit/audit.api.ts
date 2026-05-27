import { fetchJson } from '@/lib/api';
import type { AuditLogFilters, PaginatedActivityResponse, PaginatedAuditLogResponse } from './audit.types';

function appendPagination(params: URLSearchParams, cursor?: string | null, limit?: number) {
  if (cursor) {
    params.set('cursor', cursor);
  }

  if (limit !== undefined) {
    params.set('limit', String(limit));
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

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value !== undefined && value.trim().length > 0) {
      params.set(key, value.trim());
    }
  }

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

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value !== undefined && value.trim().length > 0) {
      params.set(key, value.trim());
    }
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return fetchJson<PaginatedAuditLogResponse>(`/api/admin/audit-events${suffix}`);
}
