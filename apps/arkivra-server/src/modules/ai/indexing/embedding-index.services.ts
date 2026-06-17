import type { Database } from '../../database/database.js';
import { sql } from 'drizzle-orm';
import { generateId } from '../../database/schema/helpers.js';
import {
  buildVectorLiteral,
  hashEmbeddingContent,
  hnswIndexName,
  mapEmbeddingIndexConfig,
  sqlIdentifier,
  sqlLiteral,
} from './embedding-index.helpers.js';
import type {
  ActiveEmbeddingIndex,
  ActiveEmbeddingIndexRow,
  ChunkEmbeddingWrite,
  CopiedVersionEmbeddingRow,
  CreateEmbeddingIndexInput,
  DiscoveredIndexDocument,
  DiscoveredIndexDocumentRow,
  DocumentIndexingWorkRow,
  DocumentStatusCountRow,
  EmbeddedCountRow,
  EmbeddingIndexConfig,
  EmbeddingIndexConfigRow,
  RetiredIndexRow,
  VersionChunkCountRow,
} from './embedding-index.types.js';

export type {
  ActiveEmbeddingIndex,
  ChunkEmbeddingWrite,
  CreateEmbeddingIndexInput,
  DiscoveredIndexDocument,
  EmbeddingIndexConfig,
} from './embedding-index.types.js';
export { hashEmbeddingContent } from './embedding-index.helpers.js';

export function createEmbeddingIndexServices({ db }: { db: Database }) {
  async function createEmbeddingIndex(input: CreateEmbeddingIndexInput) {
    const providerConfigId = generateId({ prefix: 'aip' });
    const embeddingIndexId = generateId({ prefix: 'eix' });
    const name = input.name ?? `${input.provider}:${input.model}`;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO ai_provider_configs (
          id,
          capability,
          provider,
          name,
          base_url,
          model,
          dimensions,
          config,
          api_key_secret_ref,
          is_enabled,
          created_at,
          updated_at
        )
        VALUES (
          ${providerConfigId},
          'embedding',
          ${input.provider},
          ${name},
          ${input.baseUrl ?? null},
          ${input.model},
          ${input.dimensions},
          ${JSON.stringify(input.options ?? {})}::jsonb,
          ${input.apiKeySecretRef ?? null},
          true,
          now(),
          now()
        )
      `);

      await tx.execute(sql`
        INSERT INTO embedding_indexes (
          id,
          provider_config_id,
          provider,
          model,
          dimensions,
          distance_metric,
          status,
          is_active,
          build_started_at,
          created_at,
          updated_at
        )
        VALUES (
          ${embeddingIndexId},
          ${providerConfigId},
          ${input.provider},
          ${input.model},
          ${input.dimensions},
          'cosine',
          'building',
          false,
          now(),
          now(),
          now()
        )
      `);

      await tx.execute(sql`
        WITH reusable_source_index AS (
          SELECT ei.id
          FROM embedding_indexes AS ei
          INNER JOIN ai_provider_configs AS apc ON apc.id = ei.provider_config_id
          WHERE ei.id <> ${embeddingIndexId}
            AND ei.provider = ${input.provider}
            AND ei.model = ${input.model}
            AND ei.dimensions = ${input.dimensions}
            AND ei.status IN ('active', 'ready')
            AND COALESCE(apc.base_url, '') = ${input.baseUrl ?? ''}
          ORDER BY ei.is_active DESC, ei.created_at DESC
          LIMIT 1
        )
        INSERT INTO document_chunk_embeddings (
          id,
          embedding_index_id,
          chunk_id,
          document_id,
          document_version_id,
          vault_id,
          content_sha256,
          embedding
        )
        SELECT
          'dce_' || md5(${embeddingIndexId} || ':' || source.chunk_id),
          ${embeddingIndexId},
          source.chunk_id,
          source.document_id,
          source.document_version_id,
          source.vault_id,
          source.content_sha256,
          source.embedding
        FROM document_chunk_embeddings AS source
        INNER JOIN reusable_source_index AS reusable ON reusable.id = source.embedding_index_id
        INNER JOIN document_versions AS dv ON dv.id = source.document_version_id
        INNER JOIN documents AS d ON d.id = dv.document_id
        WHERE d.current_version_id = dv.id
          AND dv.processing_status = 'completed'
          AND dv.deleted_at IS NULL
          AND d.is_deleted = false
        ON CONFLICT (embedding_index_id, chunk_id) DO NOTHING
      `);
    });

    return {
      embeddingIndexId,
      providerConfigId,
    };
  }

  async function getActiveEmbeddingIndex(): Promise<ActiveEmbeddingIndex | null> {
    const result = await db.execute<ActiveEmbeddingIndexRow>(sql`
      SELECT
        ei.id,
        ei.provider_config_id,
        ei.provider,
        ei.model,
        ei.dimensions,
        ei.distance_metric,
        apc.name,
        apc.base_url,
        apc.api_key_secret_ref,
        apc.config,
        apc.is_enabled
      FROM embedding_indexes AS ei
      INNER JOIN ai_provider_configs AS apc ON apc.id = ei.provider_config_id
      WHERE ei.is_active = true
        AND ei.status = 'active'
        AND apc.capability = 'embedding'
        AND apc.is_enabled = true
      LIMIT 1
    `);

    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }

    return mapEmbeddingIndexConfig(row);
  }

  async function getEmbeddingIndexConfig({
    embeddingIndexId,
  }: {
    embeddingIndexId: string;
  }): Promise<EmbeddingIndexConfig | null> {
    const result = await db.execute<EmbeddingIndexConfigRow>(sql`
      SELECT
        ei.id,
        ei.provider_config_id,
        ei.provider,
        ei.model,
        ei.dimensions,
        ei.distance_metric,
        ei.status,
        apc.name,
        apc.base_url,
        apc.api_key_secret_ref,
        apc.config,
        apc.is_enabled
      FROM embedding_indexes AS ei
      INNER JOIN ai_provider_configs AS apc ON apc.id = ei.provider_config_id
      WHERE ei.id = ${embeddingIndexId}
        AND apc.capability = 'embedding'
      LIMIT 1
    `);

    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }

    const config = mapEmbeddingIndexConfig(row);
    return config === null
      ? null
      : {
        ...config,
        status: row.status,
      };
  }

  async function discoverDocumentsForIndex({
    embeddingIndexId,
    includeReady = false,
  }: {
    embeddingIndexId: string;
    includeReady?: boolean;
  }): Promise<DiscoveredIndexDocument[]> {
    const result = await db.execute<DiscoveredIndexDocumentRow>(sql`
      SELECT
        d.id AS document_id,
        dv.id AS document_version_id,
        dv.vault_id,
        count(dc.id)::int AS expected_chunk_count
      FROM document_versions AS dv
      INNER JOIN documents AS d ON d.id = dv.document_id
        AND d.vault_id = dv.vault_id
        AND d.current_version_id = dv.id
      INNER JOIN document_chunks AS dc ON dc.document_version_id = dv.id
      WHERE dv.processing_status = 'completed'
        AND dv.deleted_at IS NULL
        AND d.is_deleted = false
      GROUP BY d.id, dv.id, dv.vault_id
      ORDER BY dv.uploaded_at ASC, dv.id ASC
    `);

    const documents = result.rows.map(row => ({
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      vaultId: row.vault_id,
      expectedChunkCount: row.expected_chunk_count,
    }));

    if (documents.length > 0) {
      const valuesSql = sql.join(
        documents.map(document => sql`(
          ${embeddingIndexId},
          ${document.documentId},
          ${document.documentVersionId},
          ${document.vaultId},
          'pending',
          ${document.expectedChunkCount},
          0,
          NULL,
          0,
          NULL,
          now(),
          now()
        )`),
        sql`, `,
      );

      await db.execute(sql`
        INSERT INTO document_embedding_index_status (
          embedding_index_id,
          document_id,
          document_version_id,
          vault_id,
          status,
          expected_chunk_count,
          embedded_chunk_count,
          failure_message,
          attempts,
          indexed_at,
          created_at,
          updated_at
        )
        VALUES ${valuesSql}
        ON CONFLICT (embedding_index_id, document_version_id)
        DO UPDATE SET
          document_id = EXCLUDED.document_id,
          vault_id = EXCLUDED.vault_id,
          expected_chunk_count = EXCLUDED.expected_chunk_count,
          status = CASE
            WHEN document_embedding_index_status.status IN ('ready', 'indexing') THEN document_embedding_index_status.status
            ELSE 'pending'
          END,
          failure_message = NULL,
          updated_at = now()
      `);
    }

    await db.execute(sql`
      UPDATE embedding_indexes
      SET
        expected_chunk_count = ${documents.reduce((total, document) => total + document.expectedChunkCount, 0)},
        status = CASE WHEN status = 'failed' THEN 'building' ELSE status END,
        updated_at = now()
      WHERE id = ${embeddingIndexId}
    `);

    if (includeReady) {
      return documents;
    }

    const workRows = await db.execute<DocumentIndexingWorkRow>(sql`
      SELECT
        deis.document_id,
        deis.document_version_id,
        deis.vault_id,
        deis.expected_chunk_count
      FROM document_embedding_index_status AS deis
      INNER JOIN document_versions AS dv ON dv.id = deis.document_version_id
      INNER JOIN documents AS d ON d.id = dv.document_id
        AND d.vault_id = dv.vault_id
        AND d.current_version_id = dv.id
      WHERE deis.embedding_index_id = ${embeddingIndexId}
        AND deis.status <> 'ready'
        AND dv.processing_status = 'completed'
        AND dv.deleted_at IS NULL
        AND d.is_deleted = false
      ORDER BY deis.created_at ASC, deis.document_version_id ASC
    `);

    return workRows.rows.map(row => ({
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      vaultId: row.vault_id,
      expectedChunkCount: row.expected_chunk_count,
    }));
  }

  async function writeChunkEmbeddings({
    embeddingIndexId,
    chunks,
  }: {
    embeddingIndexId: string;
    chunks: ChunkEmbeddingWrite[];
  }) {
    if (chunks.length === 0) {
      return { writtenCount: 0 };
    }

    const rowsSql = sql.join(
      chunks.map((chunk) => {
        const id = chunk.id ?? generateId({ prefix: 'dce' });
        const contentSha256 = hashEmbeddingContent(chunk.content);
        return sql`(
          ${id},
          ${embeddingIndexId},
          ${chunk.chunkId},
          ${chunk.documentId},
          ${chunk.documentVersionId},
          ${chunk.vaultId},
          ${contentSha256},
          ${buildVectorLiteral(chunk.embedding)}::vector
        )`;
      }),
      sql`, `,
    );

    await db.execute(sql`
      INSERT INTO document_chunk_embeddings (
        id,
        embedding_index_id,
        chunk_id,
        document_id,
        document_version_id,
        vault_id,
        content_sha256,
        embedding
      )
      VALUES ${rowsSql}
      ON CONFLICT (embedding_index_id, chunk_id)
      DO UPDATE SET
        content_sha256 = EXCLUDED.content_sha256,
        embedding = EXCLUDED.embedding
    `);

    return { writtenCount: chunks.length };
  }

  async function setDocumentIndexStatus({
    embeddingIndexId,
    documentId,
    documentVersionId,
    vaultId,
    status,
    expectedChunkCount,
    embeddedChunkCount,
    failureMessage,
    indexedAt,
    incrementAttempts = false,
  }: {
    embeddingIndexId: string;
    documentId: string;
    documentVersionId: string;
    vaultId: string;
    status: 'pending' | 'indexing' | 'ready' | 'failed' | 'stale' | 'skipped';
    expectedChunkCount: number;
    embeddedChunkCount: number;
    failureMessage?: string | null;
    indexedAt?: 'now' | null;
    incrementAttempts?: boolean;
  }) {
    await db.execute(sql`
      INSERT INTO document_embedding_index_status (
        embedding_index_id,
        document_id,
        document_version_id,
        vault_id,
        status,
        expected_chunk_count,
        embedded_chunk_count,
        failure_message,
        attempts,
        indexed_at,
        created_at,
        updated_at
      )
      VALUES (
        ${embeddingIndexId},
        ${documentId},
        ${documentVersionId},
        ${vaultId},
        ${status},
        ${expectedChunkCount},
        ${embeddedChunkCount},
        ${failureMessage ?? null},
        ${incrementAttempts ? 1 : 0},
        ${indexedAt === 'now' ? sql`now()` : sql`NULL`},
        now(),
        now()
      )
      ON CONFLICT (embedding_index_id, document_version_id)
      DO UPDATE SET
        document_id = EXCLUDED.document_id,
        vault_id = EXCLUDED.vault_id,
        status = EXCLUDED.status,
        expected_chunk_count = EXCLUDED.expected_chunk_count,
        embedded_chunk_count = EXCLUDED.embedded_chunk_count,
        failure_message = EXCLUDED.failure_message,
        attempts = document_embedding_index_status.attempts + ${incrementAttempts ? 1 : 0},
        indexed_at = EXCLUDED.indexed_at,
        updated_at = now()
    `);
  }

  async function markDocumentIndexFailed({
    embeddingIndexId,
    documentVersionId,
    failureMessage,
  }: {
    embeddingIndexId: string;
    documentVersionId: string;
    failureMessage: string;
  }) {
    await db.execute(sql`
      UPDATE document_embedding_index_status
      SET
        status = 'failed',
        failure_message = ${failureMessage},
        updated_at = now()
      WHERE embedding_index_id = ${embeddingIndexId}
        AND document_version_id = ${documentVersionId}
        AND status <> 'ready'
    `);
  }

  async function refreshEmbeddingIndexCounts({ embeddingIndexId }: { embeddingIndexId: string }) {
    const statusRows = await db.execute<DocumentStatusCountRow>(sql`
      SELECT
        COALESCE(sum(expected_chunk_count), 0)::int AS expected_chunk_count,
        COALESCE(sum(expected_chunk_count) FILTER (WHERE status IN ('failed', 'stale')), 0)::int AS failed_chunk_count
      FROM document_embedding_index_status
      WHERE embedding_index_id = ${embeddingIndexId}
    `);
    const embeddingRows = await db.execute<EmbeddedCountRow>(sql`
      SELECT count(*)::int AS embedded_chunk_count
      FROM document_chunk_embeddings
      WHERE embedding_index_id = ${embeddingIndexId}
    `);

    const expectedChunkCount = statusRows.rows[0]?.expected_chunk_count ?? 0;
    const embeddedChunkCount = embeddingRows.rows[0]?.embedded_chunk_count ?? 0;
    const failedChunkCount = statusRows.rows[0]?.failed_chunk_count ?? 0;

    await db.execute(sql`
      UPDATE embedding_indexes
      SET
        expected_chunk_count = ${expectedChunkCount},
        embedded_chunk_count = ${embeddedChunkCount},
        failed_chunk_count = ${failedChunkCount},
        updated_at = now()
      WHERE id = ${embeddingIndexId}
    `);

    return {
      expectedChunkCount,
      embeddedChunkCount,
      failedChunkCount,
    };
  }

  async function markEmbeddingIndexFailed({
    embeddingIndexId,
    failureMessage,
  }: {
    embeddingIndexId: string;
    failureMessage: string;
  }) {
    await db.execute(sql`
      UPDATE embedding_indexes
      SET
        status = 'failed',
        is_active = false,
        failure_message = ${failureMessage},
        updated_at = now()
      WHERE id = ${embeddingIndexId}
        AND status <> 'active'
    `);
  }

  async function markEmbeddingIndexReady({ embeddingIndexId }: { embeddingIndexId: string }) {
    await db.execute(sql`
      UPDATE embedding_indexes
      SET
        status = 'ready',
        build_completed_at = now(),
        failure_message = NULL,
        updated_at = now()
      WHERE id = ${embeddingIndexId}
        AND status = 'building'
    `);
  }

  async function buildHnswIndex({
    embeddingIndexId,
    dimensions,
  }: {
    embeddingIndexId: string;
    dimensions: number;
  }) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error(`Invalid embedding dimensions for HNSW index: ${dimensions}`);
    }

    await db.execute(sql.raw(`
      CREATE INDEX IF NOT EXISTS ${sqlIdentifier(hnswIndexName(embeddingIndexId))}
        ON public.document_chunk_embeddings
        USING hnsw ((embedding::public.vector(${dimensions})) public.vector_cosine_ops)
        WHERE embedding_index_id = ${sqlLiteral(embeddingIndexId)}
    `));
  }

  async function activateEmbeddingIndex({ embeddingIndexId }: { embeddingIndexId: string }) {
    return db.transaction(async (tx) => {
      const retired = await tx.execute<RetiredIndexRow>(sql`
        UPDATE embedding_indexes
        SET
          status = 'retiring',
          is_active = false,
          updated_at = now()
        WHERE is_active = true
          AND id <> ${embeddingIndexId}
        RETURNING id
      `);

      await tx.execute(sql`
        UPDATE embedding_indexes
        SET
          status = 'active',
          is_active = true,
          activated_at = now(),
          updated_at = now()
        WHERE id = ${embeddingIndexId}
          AND status IN ('ready', 'building')
      `);

      return retired.rows.map(row => row.id);
    });
  }

  async function cleanupRetiredEmbeddingIndex({
    retiredEmbeddingIndexId,
  }: {
    retiredEmbeddingIndexId: string;
  }) {
    await db.execute(sql`
      DELETE FROM document_chunk_embeddings
      WHERE embedding_index_id = ${retiredEmbeddingIndexId}
    `);
    await db.execute(sql.raw(`
      DROP INDEX IF EXISTS public.${sqlIdentifier(hnswIndexName(retiredEmbeddingIndexId))}
    `));
    await db.execute(sql`
      UPDATE embedding_indexes
      SET
        status = 'retired',
        is_active = false,
        updated_at = now()
      WHERE id = ${retiredEmbeddingIndexId}
        AND status IN ('retiring', 'retired')
    `);
  }

  async function removeDocumentFromEmbeddingIndexes({ documentId }: { documentId: string }) {
    await db.execute(sql`
      WITH affected_indexes AS (
        SELECT embedding_index_id
        FROM document_chunk_embeddings
        WHERE document_id = ${documentId}
        UNION
        SELECT embedding_index_id
        FROM document_embedding_index_status
        WHERE document_id = ${documentId}
      ),
      deleted_embeddings AS (
        DELETE FROM document_chunk_embeddings
        WHERE document_id = ${documentId}
        RETURNING embedding_index_id
      ),
      deleted_statuses AS (
        DELETE FROM document_embedding_index_status
        WHERE document_id = ${documentId}
        RETURNING embedding_index_id
      )
      UPDATE embedding_indexes AS ei
      SET
        expected_chunk_count = COALESCE((
          SELECT sum(expected_chunk_count)::int
          FROM document_embedding_index_status
          WHERE embedding_index_id = ei.id
        ), 0),
        embedded_chunk_count = COALESCE((
          SELECT count(*)::int
          FROM document_chunk_embeddings
          WHERE embedding_index_id = ei.id
        ), 0),
        failed_chunk_count = COALESCE((
          SELECT sum(expected_chunk_count)::int
          FROM document_embedding_index_status
          WHERE embedding_index_id = ei.id
            AND status IN ('failed', 'stale')
        ), 0),
        updated_at = now()
      WHERE ei.id IN (SELECT embedding_index_id FROM affected_indexes)
    `);
  }

  async function copyEmbeddingsForRestoredVersion({
    sourceDocumentVersionId,
    targetDocumentVersionId,
  }: {
    sourceDocumentVersionId: string;
    targetDocumentVersionId: string;
  }) {
    const targetCountRows = await db.execute<VersionChunkCountRow>(sql`
      WITH source_version AS (
        SELECT id, document_id, vault_id
        FROM document_versions
        WHERE id = ${sourceDocumentVersionId}
          AND deleted_at IS NULL
        LIMIT 1
      ),
      target_version AS (
        SELECT target.id, target.document_id, target.vault_id
        FROM document_versions AS target
        INNER JOIN source_version AS source
          ON source.id = target.restored_from_version_id
          AND source.document_id = target.document_id
          AND source.vault_id = target.vault_id
        WHERE target.id = ${targetDocumentVersionId}
          AND target.deleted_at IS NULL
        LIMIT 1
      )
      SELECT count(*)::int AS chunk_count
      FROM target_version
      INNER JOIN document_chunks AS target_chunk
        ON target_chunk.document_version_id = target_version.id
        AND target_chunk.document_id = target_version.document_id
        AND target_chunk.vault_id = target_version.vault_id
    `);
    const targetChunkCount = targetCountRows.rows[0]?.chunk_count ?? 0;

    if (targetChunkCount === 0) {
      return {
        copiedChunkCount: 0,
        readyEmbeddingIndexIds: [] as string[],
      };
    }

    const copiedRows = await db.execute<CopiedVersionEmbeddingRow>(sql`
      WITH source_version AS (
        SELECT id, document_id, vault_id
        FROM document_versions
        WHERE id = ${sourceDocumentVersionId}
          AND deleted_at IS NULL
        LIMIT 1
      ),
      target_version AS (
        SELECT target.id, target.document_id, target.vault_id
        FROM document_versions AS target
        INNER JOIN source_version AS source_version
          ON source_version.id = target.restored_from_version_id
          AND source_version.document_id = target.document_id
          AND source_version.vault_id = target.vault_id
        WHERE target.id = ${targetDocumentVersionId}
          AND target.deleted_at IS NULL
        LIMIT 1
      ),
      copied AS (
        INSERT INTO document_chunk_embeddings (
          id,
          embedding_index_id,
          chunk_id,
          document_id,
          document_version_id,
          vault_id,
          content_sha256,
          embedding
        )
        SELECT
          'dce_' || md5(source.embedding_index_id || ':' || target_chunk.id),
          source.embedding_index_id,
          target_chunk.id,
          target_version.document_id,
          target_version.id,
          target_version.vault_id,
          source.content_sha256,
          source.embedding
        FROM target_version
        INNER JOIN document_chunks AS target_chunk
          ON target_chunk.document_version_id = target_version.id
          AND target_chunk.document_id = target_version.document_id
          AND target_chunk.vault_id = target_version.vault_id
        INNER JOIN source_version
          ON source_version.document_id = target_version.document_id
          AND source_version.vault_id = target_version.vault_id
        INNER JOIN document_chunks AS source_chunk
          ON source_chunk.document_version_id = source_version.id
          AND source_chunk.document_id = source_version.document_id
          AND source_chunk.vault_id = source_version.vault_id
          AND source_chunk.chunk_index = target_chunk.chunk_index
        INNER JOIN document_chunk_embeddings AS source
          ON source.chunk_id = source_chunk.id
          AND source.document_version_id = source_chunk.document_version_id
          AND source.document_id = source_chunk.document_id
          AND source.vault_id = source_chunk.vault_id
          AND source.content_sha256 = target_chunk.content_sha256
        INNER JOIN document_embedding_index_status AS source_status
          ON source_status.embedding_index_id = source.embedding_index_id
          AND source_status.document_version_id = source_version.id
          AND source_status.status = 'ready'
        ON CONFLICT (embedding_index_id, chunk_id)
        DO UPDATE SET
          document_id = EXCLUDED.document_id,
          document_version_id = EXCLUDED.document_version_id,
          vault_id = EXCLUDED.vault_id,
          content_sha256 = EXCLUDED.content_sha256,
          embedding = EXCLUDED.embedding
        RETURNING embedding_index_id
      )
      SELECT embedding_index_id, count(*)::int AS copied_chunk_count
      FROM copied
      GROUP BY embedding_index_id
    `);

    const readyEmbeddingIndexIds = copiedRows.rows
      .filter(row => row.copied_chunk_count === targetChunkCount)
      .map(row => row.embedding_index_id);

    if (readyEmbeddingIndexIds.length > 0) {
      const readyStatusSql = sql.join(
        readyEmbeddingIndexIds.map(embeddingIndexId => sql`(
          ${embeddingIndexId},
          ${targetDocumentVersionId},
          'ready',
          ${targetChunkCount},
          ${targetChunkCount},
          NULL,
          now(),
          now()
        )`),
        sql`, `,
      );

      await db.execute(sql`
        INSERT INTO document_embedding_index_status (
          embedding_index_id,
          document_id,
          document_version_id,
          vault_id,
          status,
          expected_chunk_count,
          embedded_chunk_count,
          failure_message,
          indexed_at,
          created_at,
          updated_at
        )
        SELECT
          ready.embedding_index_id,
          target_version.document_id,
          target_version.id,
          target_version.vault_id,
          ready.status,
          ready.expected_chunk_count,
          ready.embedded_chunk_count,
          ready.failure_message,
          ready.indexed_at,
          ready.created_at,
          now()
        FROM (
          VALUES ${readyStatusSql}
        ) AS ready(
          embedding_index_id,
          document_version_id,
          status,
          expected_chunk_count,
          embedded_chunk_count,
          failure_message,
          indexed_at,
          created_at
        )
        INNER JOIN document_versions AS target_version
          ON target_version.id = ready.document_version_id
        ON CONFLICT (embedding_index_id, document_version_id)
        DO UPDATE SET
          document_id = EXCLUDED.document_id,
          vault_id = EXCLUDED.vault_id,
          status = EXCLUDED.status,
          expected_chunk_count = EXCLUDED.expected_chunk_count,
          embedded_chunk_count = EXCLUDED.embedded_chunk_count,
          failure_message = NULL,
          indexed_at = EXCLUDED.indexed_at,
          updated_at = now()
      `);

      for (const embeddingIndexId of readyEmbeddingIndexIds) {
        await refreshEmbeddingIndexCounts({ embeddingIndexId });
      }
    }

    return {
      copiedChunkCount: copiedRows.rows.reduce((total, row) => total + row.copied_chunk_count, 0),
      readyEmbeddingIndexIds,
    };
  }

  async function listDocumentVersionIdsForIndex({ embeddingIndexId }: { embeddingIndexId: string }) {
    const result = await db.execute<{ document_version_id: string }>(sql`
      SELECT document_version_id
      FROM document_embedding_index_status
      WHERE embedding_index_id = ${embeddingIndexId}
    `);

    return result.rows.map(row => row.document_version_id);
  }

  return {
    activateEmbeddingIndex,
    buildHnswIndex,
    cleanupRetiredEmbeddingIndex,
    copyEmbeddingsForRestoredVersion,
    createEmbeddingIndex,
    discoverDocumentsForIndex,
    getActiveEmbeddingIndex,
    getEmbeddingIndexConfig,
    listDocumentVersionIdsForIndex,
    markDocumentIndexFailed,
    markEmbeddingIndexFailed,
    removeDocumentFromEmbeddingIndexes,
    markEmbeddingIndexReady,
    refreshEmbeddingIndexCounts,
    setDocumentIndexStatus,
    writeChunkEmbeddings,
  };
}

export type EmbeddingIndexServices = ReturnType<typeof createEmbeddingIndexServices>;
