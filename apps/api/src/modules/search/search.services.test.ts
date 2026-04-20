import { describe, expect, it, vi } from 'vitest';
import { createDocumentSearchServices } from './search.services.js';

function flattenSqlChunks(chunks: unknown[]): string {
  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string') {
        return chunk;
      }

      if (typeof chunk === 'object' && chunk !== null) {
        if (Array.isArray((chunk as { value?: unknown }).value)) {
          return ((chunk as { value: unknown[] }).value).join('');
        }

        if (Array.isArray((chunk as { queryChunks?: unknown[] }).queryChunks)) {
          return flattenSqlChunks((chunk as { queryChunks: unknown[] }).queryChunks);
        }
      }

      return '';
    })
    .join('');
}

describe('document search services', () => {
  it('falls back to created_at when applying date filters', async () => {
    const execute = vi.fn(async () => ({ rows: [{ results_count: 0 }] }));
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
    });

    await searchServices.searchDocuments({
      vaultId: 'vlt_1',
      query: '',
      pageIndex: 0,
      pageSize: 20,
      dateFrom: new Date('2026-04-01'),
      dateTo: new Date('2026-04-30'),
    });

    const firstQuery = (execute.mock.calls as unknown as any[][])[0]?.[0];
    const queryText = flattenSqlChunks(firstQuery?.queryChunks ?? []);

    expect(queryText).toContain('COALESCE(d.document_date, d.created_at)');
  });

  it('includes document title fields in search matching', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ results_count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
    });

    await searchServices.searchDocuments({
      vaultId: 'vlt_1',
      query: 'contract',
      pageIndex: 0,
      pageSize: 20,
    });

    const firstQuery = (execute.mock.calls as unknown as any[][])[0]?.[0];
    const secondQuery = (execute.mock.calls as unknown as any[][])[1]?.[0];
    const combinedQueryText = [
      flattenSqlChunks(firstQuery?.queryChunks ?? []),
      flattenSqlChunks(secondQuery?.queryChunks ?? []),
    ].join('\n');

    expect(combinedQueryText).toContain('d.name ILIKE');
    expect(combinedQueryText).toContain('d.original_name ILIKE');
    expect(combinedQueryText).toContain('ORDER BY title_match DESC NULLS LAST');
  });
});
