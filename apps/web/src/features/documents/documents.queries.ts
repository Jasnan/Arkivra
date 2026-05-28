import { useQuery } from '@tanstack/react-query';
import type { SearchSortBy } from '@/features/search/search.types';
import { isDocumentProcessingActive } from './documents.utils';
import { getDocument, getDocumentFileText, listDeletedDocuments, listDocumentChunks, listDocuments, listDocumentTags } from './documents.api';

export const documentQueryKeys = {
  all: ['documents'] as const,
  list: (vaultId: string, options?: { includeDeleted?: boolean; tagId?: string; sortBy?: SearchSortBy; folderId?: string | null }) =>
    [
      ...documentQueryKeys.all,
      'list',
      vaultId,
      options?.includeDeleted ?? false,
      options?.tagId ?? 'all',
      options?.sortBy ?? 'created_desc',
      options?.folderId === undefined ? 'all-folders' : options.folderId ?? 'root',
    ] as const,
  deletedList: (vaultId?: string) => [...documentQueryKeys.all, 'deleted-list', vaultId ?? 'all'] as const,
  detail: (vaultId: string, documentId: string) =>
    [...documentQueryKeys.all, 'detail', vaultId, documentId] as const,
  chunks: (vaultId: string, documentId: string) =>
    [...documentQueryKeys.all, 'chunks', vaultId, documentId] as const,
  fileText: (vaultId: string, documentId: string, includeDeleted = false) =>
    [...documentQueryKeys.all, 'file-text', vaultId, documentId, includeDeleted] as const,
  tags: (vaultId: string, documentId: string) =>
    [...documentQueryKeys.all, 'tags', vaultId, documentId] as const,
};

export function useDocumentsQuery({
  vaultId,
  includeDeleted = false,
  tagId,
  sortBy = 'created_desc',
  folderId,
  enabled = true,
}: {
  vaultId: string;
  includeDeleted?: boolean;
  tagId?: string;
  sortBy?: SearchSortBy;
  folderId?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: documentQueryKeys.list(vaultId, { includeDeleted, tagId, sortBy, folderId }),
    queryFn: () => listDocuments({ vaultId, includeDeleted, tagId, sortBy, folderId }),
    enabled: enabled && vaultId.length > 0,
  });
}

export function useDeletedDocumentsQuery({
  vaultId,
  enabled = true,
}: {
  vaultId?: string;
  enabled?: boolean;
} = {}) {
  return useQuery({
    queryKey: documentQueryKeys.deletedList(vaultId),
    queryFn: () => listDeletedDocuments({ vaultId }),
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
      return isDocumentProcessingActive(status) ? 5000 : false;
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

export function useDocumentChunksQuery({
  vaultId,
  documentId,
  enabled = true,
}: {
  vaultId: string;
  documentId: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: documentQueryKeys.chunks(vaultId, documentId),
    queryFn: () => listDocumentChunks({ vaultId, documentId }),
    enabled: enabled && vaultId.length > 0 && documentId.length > 0,
  });
}

export function useDocumentFileTextQuery({
  vaultId,
  documentId,
  includeDeleted = false,
  enabled = true,
}: {
  vaultId: string;
  documentId: string;
  includeDeleted?: boolean;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: documentQueryKeys.fileText(vaultId, documentId, includeDeleted),
    queryFn: () => getDocumentFileText({ vaultId, documentId, includeDeleted }),
    enabled: enabled && vaultId.length > 0 && documentId.length > 0,
  });
}
