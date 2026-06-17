import { useInfiniteQuery } from '@tanstack/react-query';
import { getAdminAuditEvents, getDocumentActivity, getVaultActivity, getVaultAuditEvents } from './audit.api';
import type { AuditLogFilters } from './audit.types';

export const auditQueryKeys = {
  all: ['audit'] as const,
  documentActivity: (vaultId: string, documentId: string) =>
    [...auditQueryKeys.all, 'document-activity', vaultId, documentId] as const,
  vaultLog: (vaultId: string, filters: AuditLogFilters) =>
    [...auditQueryKeys.all, 'vault-log', vaultId, filters] as const,
  vaultActivity: (vaultId: string) =>
    [...auditQueryKeys.all, 'vault-activity', vaultId] as const,
  adminLog: (filters: AuditLogFilters) =>
    [...auditQueryKeys.all, 'admin-log', filters] as const,
};

export function useDocumentActivityQuery({
  vaultId,
  documentId,
  enabled = true,
}: {
  vaultId: string;
  documentId: string;
  enabled?: boolean;
}) {
  return useInfiniteQuery({
    queryKey: auditQueryKeys.documentActivity(vaultId, documentId),
    queryFn: ({ pageParam }) => getDocumentActivity({ vaultId, documentId, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled: enabled && vaultId.length > 0 && documentId.length > 0,
  });
}

export function useVaultAuditLogQuery({
  vaultId,
  filters,
  enabled = true,
}: {
  vaultId: string;
  filters: AuditLogFilters;
  enabled?: boolean;
}) {
  return useInfiniteQuery({
    queryKey: auditQueryKeys.vaultLog(vaultId, filters),
    queryFn: ({ pageParam }) => getVaultAuditEvents({ vaultId, filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled: enabled && vaultId.length > 0,
    retry: false,
  });
}

export function useVaultActivityQuery({
  vaultId,
  enabled = true,
}: {
  vaultId: string;
  enabled?: boolean;
}) {
  return useInfiniteQuery({
    queryKey: auditQueryKeys.vaultActivity(vaultId),
    queryFn: ({ pageParam }) => getVaultActivity({ vaultId, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled: enabled && vaultId.length > 0,
  });
}

export function useAdminAuditLogQuery({
  filters,
  enabled = true,
}: {
  filters: AuditLogFilters;
  enabled?: boolean;
}) {
  return useInfiniteQuery({
    queryKey: auditQueryKeys.adminLog(filters),
    queryFn: ({ pageParam }) => getAdminAuditEvents({ filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled,
    retry: false,
  });
}
