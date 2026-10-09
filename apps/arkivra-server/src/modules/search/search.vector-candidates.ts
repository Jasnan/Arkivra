import type { Database } from '../database/database.js';
import { sql } from 'drizzle-orm';
import type { VectorSearch } from './qdrant.client.js';

export async function loadExternalVectorCandidates({
  db,
  vectorSearch,
  embedding,
  vaultIds,
  documentId,
  documentVersionIds,
  historical = false,
  tagIds = [],
  dateFrom = null,
  dateTo = null,
  limit,
}: {
  db: Database;
  vectorSearch: VectorSearch;
  embedding: { vector: number[]; index: { id: string } };
  vaultIds: string[];
  documentId?: string;
  documentVersionIds?: string[];
  historical?: boolean;
  tagIds?: string[];
  dateFrom?: Date | null;
  dateTo?: Date | null;
  limit: number;
}) {
  if (!vaultIds.length)
    return sql`SELECT NULL::text AS id, NULL::float8 AS similarity, NULL::int AS chunk_index WHERE false`;
  const versions = await db.execute<{ id: string }>(sql`
    SELECT dv.id FROM document_versions dv INNER JOIN documents d ON d.id = dv.document_id AND d.vault_id = dv.vault_id
    WHERE d.vault_id = ANY(${sql.param(vaultIds)}::text[]) AND NOT d.is_deleted
      AND dv.deleted_at IS NULL AND dv.processing_status = 'completed'
      AND (${documentId ?? null}::text IS NULL OR d.id = ${documentId ?? null})
      AND ${documentVersionIds?.length ? sql`dv.id = ANY(${sql.param(documentVersionIds)}::text[])` : historical ? sql`TRUE` : sql`dv.id = d.current_version_id`}
      AND (${dateFrom}::timestamptz IS NULL OR d.created_at >= ${dateFrom})
      AND (${dateTo}::timestamptz IS NULL OR d.created_at <= ${dateTo})
      AND ${tagIds.length ? sql`EXISTS (SELECT 1 FROM document_tags dt WHERE dt.document_id = d.id AND dt.tag_id = ANY(${sql.param(tagIds)}::text[]))` : sql`TRUE`}
  `);
  const hits = await vectorSearch({
    indexId: embedding.index.id,
    vector: embedding.vector,
    vaultIds,
    documentVersionIds: versions.rows.map((v) => v.id),
    limit,
  });
  if (!hits.length)
    return sql`SELECT NULL::text AS id, NULL::float8 AS similarity, NULL::int AS chunk_index WHERE false`;
  return sql`SELECT hits.id, hits.similarity, dc.chunk_index FROM (VALUES ${sql.join(
    hits.map((hit) => sql`(${hit.chunkId}::text, ${hit.similarity}::float8)`),
    sql`, `,
  )}) AS hits(id, similarity)
    INNER JOIN document_chunks dc ON dc.id = hits.id
    INNER JOIN document_versions dv ON dv.id = dc.document_version_id AND dv.document_id = dc.document_id AND dv.vault_id = dc.vault_id
    INNER JOIN documents d ON d.id = dc.document_id AND d.vault_id = dc.vault_id
    INNER JOIN document_chunk_embeddings dce ON dce.chunk_id = dc.id AND dce.embedding_index_id = ${embedding.index.id} AND dce.document_version_id = dv.id AND dce.vault_id = dc.vault_id
    WHERE dc.vault_id = ANY(${sql.param(vaultIds)}::text[]) AND dv.id = ANY(${sql.param(versions.rows.map((v) => v.id))}::text[])
      AND ${documentVersionIds?.length || historical ? sql`TRUE` : sql`dv.id = d.current_version_id`}
      AND NOT d.is_deleted AND dv.deleted_at IS NULL AND dv.processing_status = 'completed'
  `;
}
