import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ChunkEmbeddingWrite } from '../ai/indexing/embedding-index.types.js';

export type VectorCandidate = { chunkId: string; similarity: number };
export type VectorSearch = (args: {
  indexId: string;
  vector: number[];
  vaultIds: string[];
  documentVersionIds: string[];
  limit: number;
}) => Promise<VectorCandidate[]>;

export function qdrantPointId(chunkId: string) {
  const hex = createHash('sha256').update(chunkId).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const queryResponse = z.object({
  result: z.object({
    points: z.array(
      z.object({
        score: z.number().finite(),
        payload: z.object({
          chunkId: z.string(),
          vaultId: z.string(),
          documentVersionId: z.string(),
        }),
      }),
    ),
  }),
});

export function createQdrantClient({
  url,
  apiKey,
  collectionPrefix = 'arkivra',
  fetchImpl = fetch,
}: {
  url: string;
  apiKey?: string;
  collectionPrefix?: string;
  fetchImpl?: typeof fetch;
}) {
  if (!/^[\w-]+$/.test(collectionPrefix)) throw new Error('Invalid Qdrant collection prefix');
  const collection = (indexId: string) =>
    `${collectionPrefix}_${createHash('sha256').update(indexId).digest('hex').slice(0, 24)}`;
  async function request(path: string, method: string, body?: unknown, allowMissing = false) {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(apiKey ? { 'api-key': apiKey } : {}) },
      signal: AbortSignal.timeout(30_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`Qdrant ${method} request failed (${response.status})`);
    return await response.json();
  }
  async function ensureCollection(indexId: string, dimensions: number) {
    const path = `/collections/${collection(indexId)}`;
    const existing = await request(path, 'GET', undefined, true);
    if (existing === null) {
      try {
        await request(path, 'PUT', { vectors: { size: dimensions, distance: 'Cosine' } });
      } catch (error) {
        if ((await request(path, 'GET', undefined, true)) === null) throw error;
      }
    }
    // Idempotent; create before indexing so filtered HNSW has the needed indexes.
    for (const field of ['vaultId', 'documentVersionId', 'documentId']) {
      await request(`${path}/index?wait=true`, 'PUT', {
        field_name: field,
        field_schema: 'keyword',
      });
    }
  }
  async function upsert(indexId: string, dimensions: number, chunks: ChunkEmbeddingWrite[]) {
    if (!chunks.length) return;
    if (
      chunks.some(
        (c) => c.embedding.length !== dimensions || c.embedding.some((v) => !Number.isFinite(v)),
      )
    )
      throw new Error('Invalid Qdrant embedding');
    await ensureCollection(indexId, dimensions);
    for (let i = 0; i < chunks.length; i += 64) {
      await request(`/collections/${collection(indexId)}/points?wait=true`, 'PUT', {
        points: chunks.slice(i, i + 64).map((chunk) => ({
          id: qdrantPointId(chunk.chunkId),
          vector: chunk.embedding,
          // Content and citation data remain authoritative in PostgreSQL.
          payload: {
            chunkId: chunk.chunkId,
            vaultId: chunk.vaultId,
            documentId: chunk.documentId,
            documentVersionId: chunk.documentVersionId,
            contentSha256: createHash('sha256').update(chunk.content).digest('hex'),
          },
        })),
      });
    }
  }
  const search: VectorSearch = async ({ indexId, vector, vaultIds, documentVersionIds, limit }) => {
    if (!vaultIds.length || !documentVersionIds.length) return [];
    if (!vector.length || vector.some((v) => !Number.isFinite(v)))
      throw new Error('Invalid query vector');
    const data = await request(
      `/collections/${collection(indexId)}/points/query`,
      'POST',
      {
        query: vector,
        limit,
        with_payload: ['chunkId', 'vaultId', 'documentVersionId'],
        filter: {
          must: [
            { key: 'vaultId', match: { any: vaultIds } },
            { key: 'documentVersionId', match: { any: documentVersionIds } },
          ],
        },
      },
      true,
    );
    if (data === null) return [];
    return queryResponse
      .parse(data)
      .result.points.filter(
        (point) =>
          vaultIds.includes(point.payload.vaultId) &&
          documentVersionIds.includes(point.payload.documentVersionId),
      )
      .map((point) => ({ chunkId: point.payload.chunkId, similarity: point.score }));
  };
  return {
    search,
    upsert,
    ensureCollection,
    async deleteIndex(indexId: string) {
      await request(`/collections/${collection(indexId)}`, 'DELETE', undefined, true);
    },
  };
}
export type QdrantClient = ReturnType<typeof createQdrantClient>;
