import { describe, expect, it, vi } from 'vitest';
import {
  createEmbeddingIndexWorker,
  finalizeEmbeddingIndex,
  indexDocumentForEmbedding,
} from './embedding-index.worker.js';

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
    const embed = vi.fn(async (_texts: string[]) => [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]);
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

      if (text.includes('FROM documents AS d') && text.includes('LEFT JOIN document_chunks AS dc')) {
        return {
          rows: [
            {
              document_id: 'doc_1',
              vault_id: 'vlt_1',
              chunk_id: 'chk_1',
              content: 'First persisted chunk',
              chunk_index: 0,
            },
            {
              document_id: 'doc_1',
              vault_id: 'vlt_1',
              chunk_id: 'chk_2',
              content: 'Second persisted chunk',
              chunk_index: 1,
            },
          ],
        };
      }

      if (text.includes('sum(expected_chunk_count)')) {
        return { rows: [{ expected_chunk_count: 2, failed_chunk_count: 0 }] };
      }

      if (text.includes('count(*)::int AS embedded_chunk_count')) {
        return { rows: [{ embedded_chunk_count: 2 }] };
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
      documentId: 'doc_1',
    });

    expect(result).toEqual({ status: 'ready', embeddedChunkCount: 2 });
    expect(embed).toHaveBeenCalledWith(['First persisted chunk', 'Second persisted chunk']);
    expect(doclingParser).not.toHaveBeenCalled();

    const combinedSql = execute.mock.calls.map(call => queryText(call[0])).join('\n');
    expect(combinedSql).toContain('FROM documents AS d');
    expect(combinedSql).toContain('LEFT JOIN document_chunks AS dc');
    expect(combinedSql).toContain('INSERT INTO document_chunk_embeddings');
    expect(combinedSql).not.toContain('docling');
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

      if (text.includes('FROM documents AS d') && text.includes('LEFT JOIN document_chunks AS dc')) {
        return {
          rows: [{
            document_id: 'doc_1',
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
        documentId: 'doc_1',
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
