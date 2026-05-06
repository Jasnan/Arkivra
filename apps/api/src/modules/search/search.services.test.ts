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

  it('fuses fts and vector search into citation payloads', async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          chunk_id: 'chk_1',
          document_id: 'doc_1',
          vault_id: 'vlt_1',
          vault_name: 'Finance',
          document_name: 'Quarterly Report',
          page_start: 2,
          page_end: 3,
          section: 'Revenue',
          section_path: ['Financials', 'Revenue'],
          source_element_ids: ['el_chunk_1', 'el_chunk_2'],
          table_source_element_ids: [{ elementId: 'el_table_1' }],
          snippet: 'Revenue increased to 42',
          bounding_boxes: [
            {
              pageNumber: 2,
              x0: 1,
              y0: 2,
              x1: 3,
              y1: 4,
              layoutWidth: 100,
              layoutHeight: 200,
              system: 'pdf',
            },
          ],
          citation_precision: 'box',
          tables_html: ['<table><tr><td>42</td></tr></table>'],
          image_asset_ids: ['cas_1'],
          image_assets: [{ assetId: 'cas_1', sourceElementId: 'el_image_1' }],
          score: 0.032,
        },
      ],
    }));
    const embed = vi.fn(async () => [[0.1, 0.2, 0.3]]);
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
      chunkEmbedder: {
        name: 'test-embedder',
        embed,
      },
    });

    const result = await searchServices.searchHybrid({
      vaultId: 'vlt_1',
      query: 'revenue',
      limit: 5,
    });

    expect(embed).toHaveBeenCalledWith(['revenue']);
    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).toContain('FULL OUTER JOIN vec_ranked');
    expect(result.mode).toBe('hybrid');
    expect(result.citations).toEqual([
      {
        chunkId: 'chk_1',
        documentId: 'doc_1',
        vaultId: 'vlt_1',
        vaultName: 'Finance',
        documentName: 'Quarterly Report',
        pageStart: 2,
        pageEnd: 3,
        section: 'Revenue',
        sectionPath: ['Financials', 'Revenue'],
        sourceElementIds: ['el_chunk_1', 'el_chunk_2'],
        tableSourceElementIds: ['el_table_1'],
        snippet: 'Revenue increased to 42',
        boundingBoxes: [
          {
            pageNumber: 2,
            x0: 1,
            y0: 2,
            x1: 3,
            y1: 4,
            layoutWidth: 100,
            layoutHeight: 200,
            system: 'pdf',
          },
        ],
        citationPrecision: 'box',
        assetType: 'image',
        tablesHtml: ['<table><tr><td>42</td></tr></table>'],
        imageAssetIds: ['cas_1'],
        imageAssets: [{ assetId: 'cas_1', sourceElementId: 'el_image_1' }],
        score: 0.032,
      },
    ]);
  });

  it('degrades hybrid search to fts when embeddings are unavailable', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const embed = vi.fn(async () => []);
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
      chunkEmbedder: {
        name: 'test-embedder',
        embed,
      },
    });

    const result = await searchServices.searchHybrid({
      vaultId: 'vlt_1',
      query: 'contract',
      limit: 10,
    });

    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).not.toContain('FULL OUTER JOIN vec_ranked');
    expect(result.mode).toBe('fts');
    expect(result.citations).toEqual([]);
  });
});
