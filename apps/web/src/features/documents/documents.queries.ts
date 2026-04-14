import { useQuery } from '@tanstack/react-query';
import { getDocument, listDocuments, listDocumentTags } from './documents.api';

export const documentQueryKeys = {
  all: ['documents'] as const,
  list: (vaultId: string, options?: { includeDeleted?: boolean; tagId?: string }) =>
    [...documentQueryKeys.all, 'list', vaultId, options?.includeDeleted ?? false, options?.tagId ?? 'all'] as const,
  detail: (vaultId: string, documentId: string) =>
    [...documentQueryKeys.all, 'detail', vaultId, documentId] as const,
  tags: (vaultId: string, documentId: string) =>
    [...documentQueryKeys.all, 'tags', vaultId, documentId] as const,
};

export function useDocumentsQuery({
  vaultId,
  includeDeleted = false,
  tagId,
}: {
  vaultId: string;
  includeDeleted?: boolean;
  tagId?: string;
}) {
  return useQuery({
    queryKey: documentQueryKeys.list(vaultId, { includeDeleted, tagId }),
    queryFn: () => listDocuments({ vaultId, includeDeleted, tagId }),
    enabled: vaultId.length > 0,
  });
}

export function useDocumentQuery({ vaultId, documentId }: { vaultId: string; documentId: string }) {
  return useQuery({
    queryKey: documentQueryKeys.detail(vaultId, documentId),
    queryFn: () => getDocument({ vaultId, documentId }),
    enabled: vaultId.length > 0 && documentId.length > 0,
  });
}

export function useDocumentTagsQuery({ vaultId, documentId }: { vaultId: string; documentId: string }) {
  return useQuery({
    queryKey: documentQueryKeys.tags(vaultId, documentId),
    queryFn: () => listDocumentTags({ vaultId, documentId }),
    enabled: vaultId.length > 0 && documentId.length > 0,
  });
}
