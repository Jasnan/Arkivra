import { describe, expect, it, vi } from 'vitest';
import {
  createEmbeddingIndexWorker,
  finalizeEmbeddingIndex,
  indexDocumentForEmbedding,
} from './embedding-index.worker.js';
import { hashEmbeddingContent } from './embedding-index.services.js';

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

function queryText(query: unknown) {
  return flattenSqlChunks((query as { queryChunks?: unknown[] })?.queryChunks ?? []);
}

describe('embedding index worker', () => {
  it('indexes existing document_chunks without invoking Docling', async () => {
    const doclingParser = vi.fn();
    const embed = vi.fn(async (_texts: string[]) => [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]]);
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);

      if (text.includes('FROM embedding_indexes AS ei')) {
        return {
          rows: [{
            id: 'eix_active',
            provider_config_id: 'aip_embedding',
            provider: 'ollama',
            model: 'bge-m3',
            dimensions: 3,
            distance_metric: 'cosine',
            status: 'building',
            name: 'Local embeddings',
            base_url: 'http://ollama.local',
            api_key_secret_ref: null,
            config: {},
            is_enabled: true,
          }],
        };
      }

      if (text.includes('FROM document_versions AS dv') && text.includes('LEFT JOIN document_chunks AS dc')) {
        return {
          rows: [
            {
              document_id: 'doc_1',
              document_version_id: 'dvr_1',
              vault_id: 'vlt_1',
              chunk_id: 'chk_1',
              content: 'First persisted chunk',
              chunk_index: 0,
            },
            {
              document_id: 'doc_1',
              document_version_id: 'dvr_1',
              vault_id: 'vlt_1',
              chunk_id: 'chk_2',
              content: 'Second persisted chunk',
              chunk_index: 1,
            },
            {
              document_id: 'doc_1',
              document_version_id: 'dvr_1',
              vault_id: 'vlt_1',
              chunk_id: 'chk_table',
              content: 'Chunk source: table\n\nHeaders: Field | Value\nRow 1: Total=42.00',
              chunk_index: 2,
            },
          ],
        };
      }

      if (text.includes('sum(expected_chunk_count)')) {
        return { rows: [{ expected_chunk_count: 3, failed_chunk_count: 0 }] };
      }

      if (text.includes('count(*)::int AS embedded_chunk_count')) {
        return { rows: [{ embedded_chunk_count: 3 }] };
      }

      if (text.includes('RETURNING document_version_id')) {
        return { rows: [{ document_version_id: 'dvr_1' }] };
      }

      return { rows: [] };
    });

    const result = await indexDocumentForEmbedding({
      db: { execute } as any,
      embeddingProviders: {
        ollama: {
          kind: 'ollama',
          embed: async ({ texts }) => embed(texts),
        },
      },
      embeddingIndexId: 'eix_active',
      documentVersionId: 'dvr_1',
    });

    expect(result).toEqual({ status: 'ready', embeddedChunkCount: 3 });
    expect(embed).toHaveBeenCalledWith([
      'First persisted chunk',
      'Second persisted chunk',
      'Chunk source: table\n\nHeaders: Field | Value\nRow 1: Total=42.00',
    ]);
    expect(doclingParser).not.toHaveBeenCalled();

    const combinedSql = execute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(combinedSql).toContain('FROM document_versions AS dv');
    expect(combinedSql).toContain('LEFT JOIN document_chunks AS dc');
    expect(combinedSql).toContain('dc.document_version_id = dv.id');
    expect(combinedSql).toContain('INSERT INTO document_chunk_embeddings');
    expect(combinedSql).toContain('document_version_id');
    expect(combinedSql).not.toContain('docling');
  });

  it('skips provider calls when document embeddings are already current', async () => {
    const embed = vi.fn(async (_texts: string[]) => [[0.1, 0.2, 0.3]]);
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);

      if (text.includes('FROM embedding_indexes AS ei')) {
        return {
          rows: [{
            id: 'eix_active',
            provider_config_id: 'aip_embedding',
            provider: 'ollama',
            model: 'bge-m3',
            dimensions: 3,
            distance_metric: 'cosine',
            status: 'active',
            name: 'Local embeddings',
            base_url: 'http://ollama.local',
            api_key_secret_ref: null,
            config: {},
            is_enabled: true,
          }],
        };
      }

      if (text.includes('FROM document_versions AS dv') && text.includes('LEFT JOIN document_chunks AS dc')) {
        return {
          rows: [{
            document_id: 'doc_1',
            document_version_id: 'dvr_1',
            vault_id: 'vlt_1',
            chunk_id: 'chk_1',
            content: 'Persisted chunk',
            chunk_index: 0,
          }],
        };
      }

      if (text.includes('FROM document_embedding_index_status')) {
        return {
          rows: [{
            status: 'ready',
            expected_chunk_count: 1,
            embedded_chunk_count: 1,
          }],
        };
      }

      if (text.includes('FROM document_chunk_embeddings')) {
        return {
          rows: [{
            chunk_id: 'chk_1',
            content_sha256: hashEmbeddingContent('Persisted chunk'),
          }],
        };
      }

      return { rows: [] };
    });

    const result = await indexDocumentForEmbedding({
      db: { execute } as any,
      embeddingProviders: {
        ollama: {
          kind: 'ollama',
          embed: async ({ texts }) => embed(texts),
        },
      },
      embeddingIndexId: 'eix_active',
      documentVersionId: 'dvr_1',
    });

    expect(result).toEqual({
      status: 'ready',
      skippedProvider: true,
      embeddedChunkCount: 1,
    });
    expect(embed).not.toHaveBeenCalled();
    const combinedSql = execute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(combinedSql).not.toContain('RETURNING document_version_id');
  });

  it('keeps two versions of one logical document isolated while indexing', async () => {
    const embed = vi.fn(async (texts: string[]) =>
      texts[0]?.includes('Version two') ? [[0.7, 0.8, 0.9]] : [[0.1, 0.2, 0.3]],
    );
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);

      if (text.includes('FROM embedding_indexes AS ei')) {
        return {
          rows: [{
            id: 'eix_active',
            provider_config_id: 'aip_embedding',
            provider: 'ollama',
            model: 'bge-m3',
            dimensions: 3,
            distance_metric: 'cosine',
            status: 'building',
            name: 'Local embeddings',
            base_url: 'http://ollama.local',
            api_key_secret_ref: null,
            config: {},
            is_enabled: true,
          }],
        };
      }

      if (text.includes('FROM document_versions AS dv') && text.includes('LEFT JOIN document_chunks AS dc')) {
        const isVersionTwo = execute.mock.calls.length > 0
          && JSON.stringify(query).includes('dvr_2');

        return {
          rows: [{
            document_id: 'doc_1',
            document_version_id: isVersionTwo ? 'dvr_2' : 'dvr_1',
            vault_id: 'vlt_1',
            chunk_id: isVersionTwo ? 'chk_v2_1' : 'chk_v1_1',
            content: isVersionTwo ? 'Version two chunk' : 'Version one chunk',
            chunk_index: 0,
          }],
        };
      }

      if (text.includes('sum(expected_chunk_count)')) {
        return { rows: [{ expected_chunk_count: 1, failed_chunk_count: 0 }] };
      }

      if (text.includes('count(*)::int AS embedded_chunk_count')) {
        return { rows: [{ embedded_chunk_count: 1 }] };
      }

      if (text.includes('RETURNING document_version_id')) {
        return { rows: [{ document_version_id: 'dvr_1' }] };
      }

      return { rows: [] };
    });

    await indexDocumentForEmbedding({
      db: { execute } as any,
      embeddingProviders: {
        ollama: {
          kind: 'ollama',
          embed: async ({ texts }) => embed(texts),
        },
      },
      embeddingIndexId: 'eix_active',
      documentVersionId: 'dvr_1',
    });
    await indexDocumentForEmbedding({
      db: { execute } as any,
      embeddingProviders: {
        ollama: {
          kind: 'ollama',
          embed: async ({ texts }) => embed(texts),
        },
      },
      embeddingIndexId: 'eix_active',
      documentVersionId: 'dvr_2',
    });

    expect(embed).toHaveBeenNthCalledWith(1, ['Version one chunk']);
    expect(embed).toHaveBeenNthCalledWith(2, ['Version two chunk']);
    const combinedSql = execute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(combinedSql).toContain('WHERE dv.id =');
    expect(combinedSql).toContain('ON CONFLICT (embedding_index_id, document_version_id)');
    expect(combinedSql).toContain('document_version_id');
  });

  it('does not load chunks or call providers when AI features are disabled after enqueue', async () => {
    const embed = vi.fn(async (_texts: string[]) => [[0.1, 0.2, 0.3]]);
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);

      if (text.includes('FROM embedding_indexes AS ei')) {
        return {
          rows: [{
            id: 'eix_active',
            provider_config_id: 'aip_embedding',
            provider: 'ollama',
            model: 'bge-m3',
            dimensions: 3,
            distance_metric: 'cosine',
            status: 'building',
            name: 'Local embeddings',
            base_url: 'http://ollama.local',
            api_key_secret_ref: null,
            config: {},
            is_enabled: true,
          }],
        };
      }

      return { rows: [] };
    });

    const result = await indexDocumentForEmbedding({
      db: { execute } as any,
      embeddingProviders: {
        ollama: {
          kind: 'ollama',
          embed: async ({ texts }) => embed(texts),
        },
      },
      adminAiServices: {
        getSettings: async () => ({ aiFeaturesEnabled: false }),
      },
      embeddingIndexId: 'eix_active',
      documentVersionId: 'dvr_1',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'ai_disabled' });
    expect(embed).not.toHaveBeenCalled();
    const combinedSql = execute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(combinedSql).not.toContain('FROM document_versions AS dv');
  });

  it('does not load chunks or call providers when the embedding provider config is disabled', async () => {
    const embed = vi.fn(async (_texts: string[]) => [[0.1, 0.2, 0.3]]);
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);

      if (text.includes('FROM embedding_indexes AS ei')) {
        return {
          rows: [{
            id: 'eix_active',
            provider_config_id: 'aip_embedding',
            provider: 'ollama',
            model: 'bge-m3',
            dimensions: 3,
            distance_metric: 'cosine',
            status: 'building',
            name: 'Local embeddings',
            base_url: 'http://ollama.local',
            api_key_secret_ref: null,
            config: {},
            is_enabled: false,
          }],
        };
      }

      return { rows: [] };
    });

    const result = await indexDocumentForEmbedding({
      db: { execute } as any,
      embeddingProviders: {
        ollama: {
          kind: 'ollama',
          embed: async ({ texts }) => embed(texts),
        },
      },
      embeddingIndexId: 'eix_active',
      documentVersionId: 'dvr_1',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'provider_config_disabled' });
    expect(embed).not.toHaveBeenCalled();
    const combinedSql = execute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(combinedSql).not.toContain('FROM document_versions AS dv');
  });

  it('skips queued orchestration and finalization when AI features are disabled', async () => {
    const worker = createEmbeddingIndexWorker({
      db: { execute: vi.fn(async () => ({ rows: [] })) } as any,
      embeddingProviders: {},
      adminAiServices: {
        getSettings: async () => ({ aiFeaturesEnabled: false }),
      },
      startPolling: false,
    });

    await expect(worker.processEmbeddingIndexJob({
      id: 'job_orchestrate',
      name: 'embedding-index-orchestrate',
      data: { embeddingIndexId: 'eix_active' },
      attempts: 1,
      maxAttempts: 3,
      updateProgress: async () => undefined,
    } as any)).resolves.toEqual({ skipped: true, reason: 'ai_disabled' });

    await expect(worker.processEmbeddingIndexJob({
      id: 'job_finalize',
      name: 'embedding-index-finalize',
      data: { embeddingIndexId: 'eix_active' },
      attempts: 1,
      maxAttempts: 3,
      updateProgress: async () => undefined,
    } as any)).resolves.toEqual({ skipped: true, reason: 'ai_disabled' });

    await worker.close();
  });

  it('finalizes a complete candidate by building HNSW, activating it, and scheduling old-index cleanup', async () => {
    const enqueueCleanupIndex = vi.fn(async () => undefined);
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);

      if (text.includes('FROM embedding_indexes AS ei')) {
        return {
          rows: [{
            id: 'eix_new',
            provider_config_id: 'aip_embedding',
            provider: 'ollama',
            model: 'bge-m3',
            dimensions: 3,
            distance_metric: 'cosine',
            status: 'building',
            name: 'Local embeddings',
            base_url: null,
            api_key_secret_ref: null,
            config: {},
            is_enabled: true,
          }],
        };
      }

      if (text.includes('pending_count')) {
        return { rows: [{ pending_count: 0, failed_count: 0, expected_chunk_count: 2 }] };
      }

      if (text.includes('count(*)::int AS embedded_chunk_count')) {
        return { rows: [{ embedded_chunk_count: 2 }] };
      }

      return { rows: [] };
    });
    const txExecute = vi.fn(async (query: unknown) => {
      const text = queryText(query);
      return text.includes('RETURNING id') ? { rows: [{ id: 'eix_old' }] } : { rows: [] };
    });
    const db = {
      execute,
      transaction: async (callback: (tx: { execute: typeof txExecute }) => unknown) =>
        callback({ execute: txExecute }),
    };

    const result = await finalizeEmbeddingIndex({
      db: db as any,
      embeddingIndexQueue: { enqueueCleanupIndex } as any,
      embeddingIndexId: 'eix_new',
    });

    expect(result).toMatchObject({
      status: 'active',
      retiredEmbeddingIndexIds: ['eix_old'],
      expectedChunkCount: 2,
      embeddedChunkCount: 2,
    });
    expect(enqueueCleanupIndex).toHaveBeenCalledWith({
      embeddingIndexId: 'eix_new',
      retiredEmbeddingIndexId: 'eix_old',
    });

    const combinedSql = execute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(combinedSql).toContain('USING hnsw');
    expect(combinedSql).toContain('embedding::public.vector(3)');
    const txSql = txExecute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(txSql).toContain("status = 'retiring'");
    expect(txSql).toContain("status = 'active'");
  });

  it('marks the document and candidate index failed when terminal embedding retries are exhausted', async () => {
    const execute = vi.fn(async (query: unknown) => {
      const text = queryText(query);

      if (text.includes('FROM embedding_indexes AS ei')) {
        return {
          rows: [{
            id: 'eix_failed',
            provider_config_id: 'aip_embedding',
            provider: 'ollama',
            model: 'bge-m3',
            dimensions: 3,
            distance_metric: 'cosine',
            status: 'building',
            name: 'Local embeddings',
            base_url: 'http://ollama.local',
            api_key_secret_ref: null,
            config: {},
            is_enabled: true,
          }],
        };
      }

      if (text.includes('FROM document_versions AS dv') && text.includes('LEFT JOIN document_chunks AS dc')) {
        return {
          rows: [{
            document_id: 'doc_1',
            document_version_id: 'dvr_1',
            vault_id: 'vlt_1',
            chunk_id: 'chk_1',
            content: 'Persisted chunk',
            chunk_index: 0,
          }],
        };
      }

      if (text.includes('sum(expected_chunk_count)')) {
        return { rows: [{ expected_chunk_count: 1, failed_chunk_count: 1 }] };
      }

      if (text.includes('count(*)::int AS embedded_chunk_count')) {
        return { rows: [{ embedded_chunk_count: 0 }] };
      }

      if (text.includes('RETURNING document_version_id')) {
        return { rows: [{ document_version_id: 'dvr_1' }] };
      }

      return { rows: [] };
    });
    const worker = createEmbeddingIndexWorker({
      db: { execute } as any,
      embeddingProviders: {
        ollama: {
          kind: 'ollama',
          embed: async () => {
            throw new Error('fetch failed');
          },
        },
      },
      startPolling: false,
    });

    await expect(worker.processEmbeddingIndexJob({
      id: 'job_1',
      name: 'embedding-index-document',
      data: {
        embeddingIndexId: 'eix_failed',
        documentVersionId: 'dvr_1',
      },
      attempts: 3,
      maxAttempts: 3,
      updateProgress: async () => undefined,
    } as any)).rejects.toThrow('fetch failed');

    await worker.close();

    const combinedSql = execute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(combinedSql).toContain('UPDATE document_embedding_index_status');
    expect(combinedSql).toContain("status = 'failed'");
    expect(combinedSql).toContain('UPDATE embedding_indexes');
    expect(combinedSql).toContain('failure_message =');
  });
});
