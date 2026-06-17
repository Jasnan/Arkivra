import { describe, expect, it, vi } from 'vitest';
import { createEmbeddingIndexServices, hashEmbeddingContent } from './embedding-index.services.js';

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

describe('embedding index services', () => {
  it('seeds a new candidate index with reusable embeddings from a matching active index', async () => {
    const txExecute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(async (callback: (tx: { execute: typeof txExecute }) => Promise<void>) =>
      callback({ execute: txExecute }),
    );
    const services = createEmbeddingIndexServices({ db: { transaction } as any });

    const result = await services.createEmbeddingIndex({
      provider: 'ollama',
      model: 'bge-m3',
      dimensions: 1024,
      baseUrl: 'http://127.0.0.1:11434',
    });

    expect(result.embeddingIndexId).toMatch(/^eix_/);
    expect(result.providerConfigId).toMatch(/^aip_/);

    const combinedSql = txExecute.mock.calls.map((call) => {
      const query = (call as unknown[])[0] as { queryChunks?: unknown[] } | undefined;
      return flattenSqlChunks(query?.queryChunks ?? []);
    }).join('\n');
    const indexInsertSql = flattenSqlChunks(
      (((txExecute.mock.calls as unknown as any[][])[1]?.[0])?.queryChunks ?? []),
    );

    expect(combinedSql).toContain('WITH reusable_source_index AS');
    expect(combinedSql).toContain('INSERT INTO document_chunk_embeddings');
    expect(combinedSql).toContain("ei.status IN ('active', 'ready')");
    expect(combinedSql).toContain('d.is_deleted = false');
    expect(indexInsertSql).toContain('build_started_at');
    expect(indexInsertSql).toContain('now(),\n          now(),\n          now()');
  });

  it('returns the active provider-backed embedding index', async () => {
    const execute = vi.fn(async () => ({
      rows: [{
        id: 'eix_active',
        provider_config_id: 'aip_embedding',
        provider: 'ollama',
        model: 'bge-m3',
        dimensions: 1024,
        distance_metric: 'cosine',
        name: 'Local embeddings',
        base_url: 'http://ollama.local',
        api_key_secret_ref: null,
        config: { numCtx: 4096 },
        is_enabled: true,
      }],
    }));
    const services = createEmbeddingIndexServices({ db: { execute } as any });

    await expect(services.getActiveEmbeddingIndex()).resolves.toEqual({
      id: 'eix_active',
      providerConfigId: 'aip_embedding',
      provider: 'ollama',
      model: 'bge-m3',
      dimensions: 1024,
      distanceMetric: 'cosine',
      name: 'Local embeddings',
      baseUrl: 'http://ollama.local',
      apiKeySecretRef: undefined,
      options: { numCtx: 4096 },
      isEnabled: true,
    });

    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).toContain('FROM embedding_indexes AS ei');
    expect(queryText).toContain('INNER JOIN ai_provider_configs AS apc');
    expect(queryText).toContain('ei.is_active = true');
  });

  it('upserts vectors under an embedding index', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const services = createEmbeddingIndexServices({ db: { execute } as any });

    const result = await services.writeChunkEmbeddings({
      embeddingIndexId: 'eix_active',
      chunks: [{
        id: 'dce_1',
        chunkId: 'chk_1',
        documentId: 'doc_1',
        documentVersionId: 'dvr_1',
        vaultId: 'vlt_1',
        content: 'Revenue increased',
        embedding: [0.1, 0.2, 0.3],
      }],
    });

    expect(result).toEqual({ writtenCount: 1 });
    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).toContain('INSERT INTO document_chunk_embeddings');
    expect(queryText).toContain('document_version_id');
    expect(queryText).toContain('ON CONFLICT (embedding_index_id, chunk_id)');
    expect(queryText).toContain('DO UPDATE SET');
  });

  it('upserts document status rows by embedding index and document version', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const services = createEmbeddingIndexServices({ db: { execute } as any });

    await services.setDocumentIndexStatus({
      embeddingIndexId: 'eix_active',
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
      vaultId: 'vlt_1',
      status: 'pending',
      expectedChunkCount: 2,
      embeddedChunkCount: 0,
    });

    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).toContain('document_version_id');
    expect(queryText).toContain('ON CONFLICT (embedding_index_id, document_version_id)');
  });

  it('copies restored-version vectors only through matching version-owned chunks', async () => {
    const execute = vi.fn(async (query: unknown) => {
      const queryText = flattenSqlChunks((query as { queryChunks?: unknown[] })?.queryChunks ?? []);

      if (queryText.includes('count(*)::int AS chunk_count')) {
        return { rows: [{ chunk_count: 1 }] };
      }

      if (queryText.includes('WITH source_version AS') && queryText.includes('copied AS')) {
        return { rows: [{ embedding_index_id: 'eix_active', copied_chunk_count: 1 }] };
      }

      if (queryText.includes('sum(expected_chunk_count)')) {
        return { rows: [{ expected_chunk_count: 1, failed_chunk_count: 0 }] };
      }

      if (queryText.includes('count(*)::int AS embedded_chunk_count')) {
        return { rows: [{ embedded_chunk_count: 1 }] };
      }

      return { rows: [] };
    });
    const services = createEmbeddingIndexServices({ db: { execute } as any });

    const result = await services.copyEmbeddingsForRestoredVersion({
      sourceDocumentVersionId: 'dvr_source',
      targetDocumentVersionId: 'dvr_target',
    });

    expect(result).toEqual({
      copiedChunkCount: 1,
      readyEmbeddingIndexIds: ['eix_active'],
    });

    const combinedSql = execute.mock.calls
      .map(call => flattenSqlChunks(((call as unknown[])[0] as { queryChunks?: unknown[] })?.queryChunks ?? []))
      .join('\n');
    expect(combinedSql).toContain('target_chunk.document_version_id = target_version.id');
    expect(combinedSql).toContain('source.id = target.restored_from_version_id');
    expect(combinedSql).toContain('source.document_id = target.document_id');
    expect(combinedSql).toContain('source.vault_id = target.vault_id');
    expect(combinedSql).toContain('source_chunk.document_version_id = source_version.id');
    expect(combinedSql).toContain('source.content_sha256 = target_chunk.content_sha256');
    expect(combinedSql).toContain("source_status.status = 'ready'");
    expect(combinedSql).toContain('ON CONFLICT (embedding_index_id, document_version_id)');
  });

  it('removes document vectors and status rows from embedding indexes', async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    const services = createEmbeddingIndexServices({ db: { execute } as any });

    await services.removeDocumentFromEmbeddingIndexes({ documentId: 'doc_1' });

    const queryText = flattenSqlChunks(((execute.mock.calls as unknown as any[][])[0]?.[0])?.queryChunks ?? []);
    expect(queryText).toContain('DELETE FROM document_chunk_embeddings');
    expect(queryText).toContain('DELETE FROM document_embedding_index_status');
    expect(queryText).toContain('UPDATE embedding_indexes');
    expect(queryText).toContain('WHERE document_id =');
  });

  it('hashes chunk content consistently for stale detection', () => {
    expect(hashEmbeddingContent('Revenue increased')).toBe(hashEmbeddingContent('Revenue increased'));
    expect(hashEmbeddingContent('Revenue increased')).not.toBe(hashEmbeddingContent('Revenue decreased'));
  });
});
