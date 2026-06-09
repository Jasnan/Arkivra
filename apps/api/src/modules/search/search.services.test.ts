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
  it('uses created_at when applying date filters', async () => {
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

    expect(queryText).toContain('d.created_at');
  });

  it('scopes browse search to current completed versions by default', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ results_count: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
    });

    await searchServices.searchDocuments({
      vaultId: 'vlt_1',
      query: '',
      pageIndex: 0,
      pageSize: 20,
    });

    const combinedQueryText = (execute.mock.calls as unknown as any[][])
      .map(call => flattenSqlChunks(call[0]?.queryChunks ?? []))
      .join('\n');

    expect(combinedQueryText).toContain('INNER JOIN document_versions AS dv');
    expect(combinedQueryText).toContain('dv.id = d.current_version_id');
    expect(combinedQueryText).toContain("dv.processing_status = 'completed'");
    expect(combinedQueryText).toContain('dv.deleted_at IS NULL');
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
    expect(combinedQueryText).toContain('dv.original_name ILIKE');
    expect(combinedQueryText).toContain('ORDER BY title_match DESC NULLS LAST');
  });

  it('returns one result per version in historical keyword mode', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ results_count: 0 }] });
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
    });

    await searchServices.searchDocuments({
      vaultId: 'vlt_1',
      query: 'contract',
      pageIndex: 0,
      pageSize: 20,
      includeVersions: 'historical',
    });

    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).toContain('SELECT DISTINCT document_id, document_version_id');
    expect(queryText).not.toContain('dv.id = d.current_version_id');
  });

  it('uses hybrid retrieval for document-shaped search results', async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          vault_id: 'vlt_1',
          vault_name: 'Finance',
          document_id: 'doc_1',
          document_version_id: 'dvr_2',
          version_number: 2,
          name: 'April invoice.pdf',
          original_name: 'April invoice.pdf',
          original_size: 42000,
          mime_type: 'application/pdf',
          created_at: new Date('2026-04-10T10:00:00.000Z'),
          updated_at: new Date('2026-04-12T10:00:00.000Z'),
          tags_json: '[]',
          matched_chunks_count: 1,
          chunk_index: 0,
          chunk_type: 'section',
          page_number: 1,
          chunk_content: 'Invoice total due on receipt',
          snippet: 'Invoice total due on receipt',
          score: 0.032,
          fulltext_match: false,
          substring_position: null,
          title_match: false,
          match_type: 'semantic',
          results_count: 1,
        },
      ],
    }));
    const embed = vi.fn(async (_texts: string[]) => [[0.1, 0.2, 0.3]]);
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
      embeddingProvider: {
        kind: 'ollama',
        embed: async ({ texts }) => embed(texts),
      },
      resolveActiveEmbeddingIndex: async () => ({
        id: 'eix_active',
        providerConfigId: 'aip_embedding',
        provider: 'ollama',
        model: 'test-embedding',
        dimensions: 3,
        distanceMetric: 'cosine',
        name: 'Test embedding',
        isEnabled: true,
      }),
    });

    const result = await searchServices.searchDocuments({
      vaultId: 'vlt_1',
      query: 'bills',
      pageIndex: 0,
      pageSize: 20,
      searchMode: 'hybrid',
    });

    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(embed).toHaveBeenCalledWith(['bills']);
    expect(queryText).toContain('FULL OUTER JOIN vec_ranked');
    expect(queryText).toContain('document_chunk_embeddings AS dce');
    expect(queryText).toContain('sd.document_version_id = dc.document_version_id');
    expect(queryText).toContain('dce.document_version_id = sd.document_version_id');
    expect(queryText).toContain('dce.embedding_index_id');
    expect(queryText).toContain('AND vec_ranked.similarity >=');
    expect(result.resultsCount).toBe(1);
    expect(result.results[0]?.bestChunk?.matchType).toBe('semantic');
    expect(result.results[0]?.bestChunk?.snippet).toBe('Invoice total due on receipt');
  });

  it('fuses fts and vector search into citation payloads', async () => {
    const execute = vi.fn(async () => ({
      rows: [
        {
          chunk_id: 'chk_1',
          document_id: 'doc_1',
          document_version_id: 'dvr_1',
          version_number: 1,
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
          image_provenance: [{
            elementId: 'el_image_1',
            caption: 'Figure 1. Revenue trend by quarter',
            pageNumber: 3,
          }],
          score: 0.032,
        },
      ],
    }));
    const embed = vi.fn(async (_texts: string[]) => [[0.1, 0.2, 0.3]]);
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
      embeddingProvider: {
        kind: 'ollama',
        embed: async ({ texts }) => embed(texts),
      },
      resolveActiveEmbeddingIndex: async () => ({
        id: 'eix_active',
        providerConfigId: 'aip_embedding',
        provider: 'ollama',
        model: 'test-embedding',
        dimensions: 3,
        distanceMetric: 'cosine',
        name: 'Test embedding',
        isEnabled: true,
      }),
    });

    const result = await searchServices.searchHybrid({
      vaultId: 'vlt_1',
      query: 'revenue',
      limit: 5,
    });

    expect(embed).toHaveBeenCalledWith(['revenue']);
    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).toContain('FULL OUTER JOIN vec_ranked');
    expect(queryText).toContain('document_chunk_embeddings AS dce');
    expect(queryText).toContain('dc.document_version_id = d.current_version_id');
    expect(queryText).toContain('dce.document_version_id = dc.document_version_id');
    expect(result.mode).toBe('hybrid');
    expect(result.citations).toEqual([
      {
        chunkId: 'chk_1',
        documentId: 'doc_1',
        documentVersionId: 'dvr_1',
        versionNumber: 1,
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
        imageAssets: [{
          assetId: 'cas_1',
          sourceElementId: 'el_image_1',
          caption: 'Figure 1. Revenue trend by quarter',
          pageNumber: 3,
        }],
        score: 0.032,
      },
    ]);
  });

  it('degrades hybrid search to fts when embeddings are unavailable', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const embed = vi.fn(async (_texts: string[]) => []);
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
      embeddingProvider: {
        kind: 'ollama',
        embed: async ({ texts }) => embed(texts),
      },
      resolveActiveEmbeddingIndex: async () => ({
        id: 'eix_active',
        providerConfigId: 'aip_embedding',
        provider: 'ollama',
        model: 'test-embedding',
        dimensions: 3,
        distanceMetric: 'cosine',
        name: 'Test embedding',
        isEnabled: true,
      }),
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

  it('filters hybrid citations by explicit document version ids', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
    });

    await searchServices.searchHybrid({
      vaultId: 'vlt_1',
      documentVersionIds: ['dvr_1'],
      query: 'contract',
      limit: 10,
      mode: 'fts',
    });

    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).toContain('dc.document_version_id IN (');
    expect(queryText).not.toContain('dc.document_version_id = d.current_version_id');
  });

  it('falls back to keyword document search when no active embedding index exists', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ results_count: 0 }] });
    const embed = vi.fn(async (_texts: string[]) => [[0.1, 0.2, 0.3]]);
    const searchServices = createDocumentSearchServices({
      db: { execute } as any,
      embeddingProvider: {
        kind: 'ollama',
        embed: async ({ texts }) => embed(texts),
      },
      resolveActiveEmbeddingIndex: async () => null,
    });

    const result = await searchServices.searchDocuments({
      vaultId: 'vlt_1',
      query: 'contract',
      pageIndex: 0,
      pageSize: 20,
      searchMode: 'hybrid',
    });

    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(embed).not.toHaveBeenCalled();
    expect(queryText).not.toContain('document_chunk_embeddings');
    expect(queryText).toContain('websearch_to_tsquery');
    expect(result.resultsCount).toBe(0);
  });
});
