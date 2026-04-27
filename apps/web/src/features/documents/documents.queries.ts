import { useQuery } from '@tanstack/react-query';
import type { SearchSortBy } from '@/features/search/search.types';
import { getDocument, listDeletedDocuments, listDocuments, listDocumentTags } from './documents.api';

export const documentQueryKeys = {
  all: ['documents'] as const,
  list: (vaultId: string, options?: { includeDeleted?: boolean; tagId?: string; sortBy?: SearchSortBy }) =>
    [...documentQueryKeys.all, 'list', vaultId, options?.includeDeleted ?? false, options?.tagId ?? 'all', options?.sortBy ?? 'created_desc'] as const,
  deletedList: () => [...documentQueryKeys.all, 'deleted-list'] as const,
  detail: (vaultId: string, documentId: string) =>
    [...documentQueryKeys.all, 'detail', vaultId, documentId] as const,
  tags: (vaultId: string, documentId: string) =>
    [...documentQueryKeys.all, 'tags', vaultId, documentId] as const,
};

export function useDocumentsQuery({
  vaultId,
  includeDeleted = false,
  tagId,
  sortBy = 'created_desc',
  enabled = true,
}: {
  vaultId: string;
  includeDeleted?: boolean;
  tagId?: string;
  sortBy?: SearchSortBy;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: documentQueryKeys.list(vaultId, { includeDeleted, tagId, sortBy }),
    queryFn: () => listDocuments({ vaultId, includeDeleted, tagId, sortBy }),
    enabled: enabled && vaultId.length > 0,
  });
}

export function useDeletedDocumentsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: documentQueryKeys.deletedList(),
    queryFn: listDeletedDocuments,
    enabled,
  });
}

export function useDocumentQuery({ vaultId, documentId }: { vaultId: string; documentId: string }) {
  return useQuery({
    queryKey: documentQueryKeys.detail(vaultId, documentId),
    queryFn: () => getDocument({ vaultId, documentId }),
    enabled: vaultId.length > 0 && documentId.length > 0,
    refetchInterval: query => {
      const status = query.state.data?.document.processingStatus;
      return status === 'pending' || status === 'processing' ? 5000 : false;
    },
  });
}

export function useDocumentTagsQuery({ vaultId, documentId }: { vaultId: string; documentId: string }) {
  return useQuery({
    queryKey: documentQueryKeys.tags(vaultId, documentId),
    queryFn: () => listDocumentTags({ vaultId, documentId }),
    enabled: vaultId.length > 0 && documentId.length > 0,
  });
}
