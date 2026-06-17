import type { QueryClient } from '@tanstack/react-query';
import { adminQueryKeys } from '@/features/admin/admin.queries';
import { chatQueryKeys } from '@/features/chat/chat.queries';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { fileBrowserQueryKeys } from '@/features/file-browser/file-browser.queries';
import { searchQueryKeys } from '@/features/search/search.queries';

interface DeletedDocumentsCache {
  documents: Array<{ id: string; vaultId?: string }>;
  retentionDays: number;
}

export function removeDocumentsFromDeletedListCache(
  queryClient: QueryClient,
  documents: Array<{ id: string; vaultId?: string }>,
) {
  const ids = new Set(documents.map((document) => document.id));

  if (ids.size === 0) {
    return;
  }

  queryClient.setQueriesData<DeletedDocumentsCache>(
    {
      queryKey: documentQueryKeys.all,
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[1] === 'deleted-list',
    },
    (data) =>
      data
        ? {
            ...data,
            documents: data.documents.filter((document) => !ids.has(document.id)),
          }
        : data,
  );
}

export async function invalidateDocumentCollectionCaches(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiStatus() }),
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: fileBrowserQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
  ]);
}
