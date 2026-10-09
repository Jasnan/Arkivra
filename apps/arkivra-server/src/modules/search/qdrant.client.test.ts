import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Database } from '../database/database.js';
import { createQdrantClient, qdrantPointId } from './qdrant.client.js';
import { loadExternalVectorCandidates } from './search.vector-candidates.js';
import { createDocumentSearchServices } from './search.services.js';

describe('qdrant retrieval boundary', () => {
  it('writes deterministic UUID points and scoped payloads with authenticated requests', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => Response.json({ result: true }));
    fetchImpl.mockResolvedValueOnce(new Response('', { status: 404 }));
    const client = createQdrantClient({ url: 'http://qdrant', apiKey: 'test-key', fetchImpl });
    const chunk = {
      chunkId: 'doc:p1:r0',
      documentId: 'doc',
      documentVersionId: 'version',
      vaultId: 'vault',
      content: 'confidential text',
      embedding: [1, 0],
    };
    await client.upsert('index', 2, [chunk]);
    const lastCall = fetchImpl.mock.calls.at(-1)!;
    const body = JSON.parse(lastCall[1].body);
    expect(body.points[0].id).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    expect(body.points[0].id).toBe(qdrantPointId(chunk.chunkId));
    expect(body.points[0].payload).toMatchObject({
      chunkId: chunk.chunkId,
      vaultId: 'vault',
      documentVersionId: 'version',
    });
    expect(lastCall[1].headers['api-key']).toBe('test-key');
    expect(lastCall[1].body).not.toContain('confidential text');
  });
  it('requires vault and version scope and rejects out-of-scope payloads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        result: {
          points: [
            {
              score: 0.9,
              payload: { chunkId: 'good', vaultId: 'vault', documentVersionId: 'version' },
            },
            {
              score: 1,
              payload: { chunkId: 'bad-vault', vaultId: 'other', documentVersionId: 'version' },
            },
            {
              score: 1,
              payload: { chunkId: 'bad-version', vaultId: 'vault', documentVersionId: 'old' },
            },
          ],
        },
      }),
    );
    const client = createQdrantClient({ url: 'http://qdrant', fetchImpl });
    const args = {
      indexId: 'index',
      vector: [1, 0],
      vaultIds: ['vault'],
      documentVersionIds: ['version'],
      limit: 10,
    };
    expect(await client.search({ ...args, vaultIds: [] })).toEqual([]);
    expect(await client.search({ ...args, documentVersionIds: [] })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await client.search(args)).toEqual([{ chunkId: 'good', similarity: 0.9 }]);
    const filter = JSON.parse(fetchImpl.mock.calls[0]![1].body).filter;
    expect(filter.must).toEqual([
      { key: 'vaultId', match: { any: ['vault'] } },
      { key: 'documentVersionId', match: { any: ['version'] } },
    ]);
  });
  it('does not expose response bodies in backend errors', async () => {
    const client = createQdrantClient({
      url: 'http://qdrant',
      fetchImpl: vi.fn().mockResolvedValue(new Response('private payload', { status: 500 })),
    });
    await expect(
      client.search({
        indexId: 'index',
        vector: [1],
        vaultIds: ['vault'],
        documentVersionIds: ['version'],
        limit: 10,
      }),
    ).rejects.toThrow('Qdrant POST request failed (500)');
  });
  it('filters eligible versions before ANN retrieval and revalidates IDs during hydration', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: 'version' }] });
    const vectorSearch = vi
      .fn()
      .mockResolvedValue([{ chunkId: 'arbitrary-backend-id', similarity: 0.9 }]);
    const candidates = await loadExternalVectorCandidates({
      db: { execute } as unknown as Database,
      vectorSearch,
      embedding: { vector: [1], index: { id: 'index' } },
      vaultIds: ['vault'],
      tagIds: ['tag'],
      limit: 10,
    });
    expect(vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ vaultIds: ['vault'], documentVersionIds: ['version'] }),
    );
    const dialect = new PgDialect();
    const eligibility = dialect.sqlToQuery(execute.mock.calls[0]![0]).sql;
    expect(eligibility).toContain('dv.id = d.current_version_id');
    expect(eligibility).toContain('document_tags');
    expect(dialect.sqlToQuery(execute.mock.calls[0]![0]).params).toContainEqual(['vault']);
    const hydration = dialect.sqlToQuery(candidates);
    expect(hydration.sql).toContain('INNER JOIN document_chunk_embeddings');
    expect(hydration.sql).toContain('NOT d.is_deleted');
    expect(hydration.sql).toContain('dv.deleted_at IS NULL');
    expect(hydration.sql).toContain('dc.chunk_index');
    expect(hydration.params).toContain('index');
  });
  it('falls back to keyword citations when Qdrant fails', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const vectorSearch = vi.fn().mockRejectedValue(new Error('unavailable'));
    const services = createDocumentSearchServices({
      db: { execute } as unknown as Database,
      vectorSearch,
      embeddingProvider: { name: 'fixture', embed: async () => [[1, 0]] } as any,
      resolveActiveEmbeddingIndex: async () =>
        ({ id: 'index', provider: 'ollama', model: 'fixture', dimensions: 2 }) as any,
    });
    const result = await services.searchHybrid({ vaultId: 'vault', query: 'revenue', limit: 5 });
    expect(result.mode).toBe('fts');
    expect(result.citations).toEqual([]);
    expect(execute.mock.calls.length).toBeGreaterThan(1);
  });
});
