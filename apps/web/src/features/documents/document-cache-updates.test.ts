import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import {
  invalidateDocumentCollectionCaches,
  removeDocumentsFromDeletedListCache,
} from './document-cache-updates';

interface TestDeletedDocumentsCache {
  retentionDays: number;
  documents: Array<{ id: string; vaultId: string; name: string }>;
}

describe('document cache updates', () => {
  it('removes restored documents from every loaded trash list cache', () => {
    const queryClient = new QueryClient();

    queryClient.setQueryData(documentQueryKeys.deletedList(), {
      retentionDays: 30,
      documents: [
        { id: 'doc_1', vaultId: 'vlt_1', name: 'Invoice.pdf' },
        { id: 'doc_2', vaultId: 'vlt_2', name: 'Policy.pdf' },
      ],
    });
    queryClient.setQueryData(documentQueryKeys.deletedList('vlt_1'), {
      retentionDays: 30,
      documents: [{ id: 'doc_1', vaultId: 'vlt_1', name: 'Invoice.pdf' }],
    });

    removeDocumentsFromDeletedListCache(queryClient, [{ id: 'doc_1', vaultId: 'vlt_1' }]);

    expect(
      queryClient.getQueryData<TestDeletedDocumentsCache>(documentQueryKeys.deletedList())
        ?.documents,
    ).toEqual([{ id: 'doc_2', vaultId: 'vlt_2', name: 'Policy.pdf' }]);
    expect(
      queryClient.getQueryData<TestDeletedDocumentsCache>(documentQueryKeys.deletedList('vlt_1'))
        ?.documents,
    ).toEqual([]);
  });

  it('invalidates document-adjacent collection caches together', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateDocumentCollectionCaches(queryClient);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['documents'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['file-browser'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['search'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'ai', 'status'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['chat'] });
  });
});
