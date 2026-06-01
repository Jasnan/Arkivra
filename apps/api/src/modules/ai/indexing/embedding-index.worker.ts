import type { Database } from '../../database/database.js';
import type { EmbeddingProvider, EmbeddingProviderKind } from '../providers/types.js';
import type { AsyncJob } from '../../worker/postgres-jobs.js';
import type { EmbeddingIndexJobData, EmbeddingIndexQueue } from './embedding-index.queue.js';
import { sql } from 'drizzle-orm';
import { createPostgresWorker, getScopedQueueName } from '../../worker/postgres-jobs.js';
import {
  EMBEDDING_INDEX_CLEANUP_JOB,
  EMBEDDING_INDEX_DOCUMENT_JOB,
  EMBEDDING_INDEX_FINALIZE_JOB,
  EMBEDDING_INDEX_ORCHESTRATE_JOB,
  EMBEDDING_INDEX_QUEUE,
  createEmbeddingIndexQueue,
} from './embedding-index.queue.js';
import {
  createEmbeddingIndexServices,
  hashEmbeddingContent,
} from './embedding-index.services.js';

type EmbeddingProviderRegistry = Partial<Record<EmbeddingProviderKind, EmbeddingProvider>>;

type ChunkRow = {
  document_id: string;
  vault_id: string;
  chunk_id: string | null;
  content: string | null;
  chunk_index: number | null;
};

type FinalizeCountsRow = {
  pending_count: number;
  failed_count: number;
  expected_chunk_count: number;
};

type EmbeddedCountRow = {
  embedded_chunk_count: number;
};

export type EmbeddingIndexWorkerDeps = {
  db: Database;
  embeddingProviders: EmbeddingProviderRegistry;
  appInstance?: string;
  concurrency?: number;
  startPolling?: boolean;
};

async function loadDocumentChunks({
  db,
  documentId,
}: {
  db: Database;
  documentId: string;
}) {
  const result = await db.execute<ChunkRow>(sql`
    SELECT
      d.id AS document_id,
      d.vault_id,
      dc.id AS chunk_id,
      dc.content,
      dc.chunk_index
    FROM documents AS d
    LEFT JOIN document_chunks AS dc ON dc.document_id = d.id
    WHERE d.id = ${documentId}
      AND d.processing_status = 'completed'
      AND d.is_deleted = false
    ORDER BY dc.chunk_index ASC, dc.id ASC
  `);

  return result.rows;
}

function toIndexableChunks(rows: ChunkRow[]) {
  return rows.flatMap((row) => {
    if (row.chunk_id === null || row.content === null) {
      return [];
    }

    return [{
      chunkId: row.chunk_id,
      documentId: row.document_id,
      vaultId: row.vault_id,
      content: row.content,
      contentSha256: hashEmbeddingContent(row.content),
    }];
  });
}

function assertEmbeddingsMatchConfig({
  embeddings,
  expectedCount,
  dimensions,
}: {
  embeddings: number[][];
  expectedCount: number;
  dimensions: number;
}) {
  if (embeddings.length !== expectedCount) {
    throw new Error(`Embedding provider returned ${embeddings.length} vector(s) for ${expectedCount} chunk(s).`);
  }

  const invalidIndex = embeddings.findIndex(vector => vector.length !== dimensions);
  if (invalidIndex >= 0) {
    throw new Error(
      `Embedding provider returned ${embeddings[invalidIndex]?.length ?? 0} dimensions for chunk ${invalidIndex}; expected ${dimensions}.`,
    );
  }
}

export async function indexDocumentForEmbedding({
  db,
  embeddingProviders,
  embeddingIndexId,
  documentId,
}: {
  db: Database;
  embeddingProviders: EmbeddingProviderRegistry;
  embeddingIndexId: string;
  documentId: string;
}) {
  const services = createEmbeddingIndexServices({ db });
  const config = await services.getEmbeddingIndexConfig({ embeddingIndexId });
  if (config === null || !['active', 'building'].includes(config.status)) {
    return { status: 'skipped' as const, reason: 'index_not_writable' };
  }

  const provider = embeddingProviders[config.provider];
  if (provider === undefined) {
    throw new Error(`No embedding provider is registered for ${config.provider}.`);
  }

  const rows = await loadDocumentChunks({ db, documentId });
  if (rows.length === 0) {
    return { status: 'skipped' as const, reason: 'document_not_indexable' };
  }

  const firstRow = rows[0];
  if (firstRow === undefined) {
    return { status: 'skipped' as const, reason: 'document_not_indexable' };
  }

  const chunks = toIndexableChunks(rows);
  if (chunks.length === 0) {
    await services.setDocumentIndexStatus({
      embeddingIndexId,
      documentId,
      vaultId: firstRow.vault_id,
      status: 'skipped',
      expectedChunkCount: 0,
      embeddedChunkCount: 0,
      indexedAt: 'now',
    });
    await services.refreshEmbeddingIndexCounts({ embeddingIndexId });
    return { status: 'skipped' as const, reason: 'no_chunks' };
  }

  await services.setDocumentIndexStatus({
    embeddingIndexId,
    documentId,
    vaultId: firstRow.vault_id,
    status: 'indexing',
    expectedChunkCount: chunks.length,
    embeddedChunkCount: 0,
    incrementAttempts: true,
  });

  const embeddings = await provider.embed({
    texts: chunks.map(chunk => chunk.content),
    config,
  });

  assertEmbeddingsMatchConfig({
    embeddings,
    expectedCount: chunks.length,
    dimensions: config.dimensions,
  });

  const latestChunks = toIndexableChunks(await loadDocumentChunks({ db, documentId }));
  const latestHashes = new Map(latestChunks.map(chunk => [chunk.chunkId, chunk.contentSha256]));
  const chunksChanged = chunks.some(chunk => latestHashes.get(chunk.chunkId) !== chunk.contentSha256)
    || latestChunks.length !== chunks.length;

  if (chunksChanged) {
    await services.setDocumentIndexStatus({
      embeddingIndexId,
      documentId,
      vaultId: firstRow.vault_id,
      status: 'stale',
      expectedChunkCount: latestChunks.length,
      embeddedChunkCount: 0,
      failureMessage: 'Document chunks changed while embedding.',
    });
    await services.refreshEmbeddingIndexCounts({ embeddingIndexId });
    return { status: 'stale' as const };
  }

  const latestIndexConfig = await services.getEmbeddingIndexConfig({ embeddingIndexId });
  if (latestIndexConfig === null || !['active', 'building'].includes(latestIndexConfig.status)) {
    return { status: 'skipped' as const, reason: 'index_no_longer_writable' };
  }

  await services.writeChunkEmbeddings({
    embeddingIndexId,
    chunks: chunks.map((chunk, index) => ({
      chunkId: chunk.chunkId,
      documentId: chunk.documentId,
      vaultId: chunk.vaultId,
      content: chunk.content,
      embedding: embeddings[index]!,
    })),
  });

  await services.setDocumentIndexStatus({
    embeddingIndexId,
    documentId,
    vaultId: firstRow.vault_id,
    status: 'ready',
    expectedChunkCount: chunks.length,
    embeddedChunkCount: chunks.length,
    indexedAt: 'now',
  });
  await services.refreshEmbeddingIndexCounts({ embeddingIndexId });

  return {
    status: 'ready' as const,
    embeddedChunkCount: chunks.length,
  };
}

async function getFinalizeCounts({
  db,
  embeddingIndexId,
}: {
  db: Database;
  embeddingIndexId: string;
}) {
  const statusRows = await db.execute<FinalizeCountsRow>(sql`
    SELECT
      count(*) FILTER (WHERE status IN ('pending', 'indexing'))::int AS pending_count,
      count(*) FILTER (WHERE status IN ('failed', 'stale'))::int AS failed_count,
      COALESCE(sum(expected_chunk_count), 0)::int AS expected_chunk_count
    FROM document_embedding_index_status
    WHERE embedding_index_id = ${embeddingIndexId}
  `);
  const embeddingRows = await db.execute<EmbeddedCountRow>(sql`
    SELECT count(*)::int AS embedded_chunk_count
    FROM document_chunk_embeddings
    WHERE embedding_index_id = ${embeddingIndexId}
  `);

  return {
    pendingCount: statusRows.rows[0]?.pending_count ?? 0,
    failedCount: statusRows.rows[0]?.failed_count ?? 0,
    expectedChunkCount: statusRows.rows[0]?.expected_chunk_count ?? 0,
    embeddedChunkCount: embeddingRows.rows[0]?.embedded_chunk_count ?? 0,
  };
}

export async function finalizeEmbeddingIndex({
  db,
  embeddingIndexQueue,
  embeddingIndexId,
}: {
  db: Database;
  embeddingIndexQueue: EmbeddingIndexQueue;
  embeddingIndexId: string;
}) {
  const services = createEmbeddingIndexServices({ db });
  const config = await services.getEmbeddingIndexConfig({ embeddingIndexId });
  if (config === null || config.status !== 'building') {
    return { status: 'skipped' as const, reason: 'index_not_building' };
  }

  const counts = await getFinalizeCounts({ db, embeddingIndexId });
  if (counts.pendingCount > 0) {
    throw new Error(`Embedding index ${embeddingIndexId} still has ${counts.pendingCount} pending document(s).`);
  }

  if (counts.failedCount > 0) {
    await services.markEmbeddingIndexFailed({
      embeddingIndexId,
      failureMessage: `${counts.failedCount} document(s) failed or became stale during indexing.`,
    });
    return { status: 'failed' as const, ...counts };
  }

  if (counts.embeddedChunkCount !== counts.expectedChunkCount) {
    const failureMessage =
      `Embedding count mismatch: expected ${counts.expectedChunkCount}, got ${counts.embeddedChunkCount}.`;
    await services.markEmbeddingIndexFailed({ embeddingIndexId, failureMessage });
    return { status: 'failed' as const, ...counts };
  }

  await services.buildHnswIndex({
    embeddingIndexId,
    dimensions: config.dimensions,
  });
  await services.markEmbeddingIndexReady({ embeddingIndexId });
  const retiredEmbeddingIndexIds = await services.activateEmbeddingIndex({ embeddingIndexId });

  for (const retiredEmbeddingIndexId of retiredEmbeddingIndexIds) {
    await embeddingIndexQueue.enqueueCleanupIndex({
      embeddingIndexId,
      retiredEmbeddingIndexId,
    });
  }

  return {
    status: 'active' as const,
    retiredEmbeddingIndexIds,
    ...counts,
  };
}

export function createEmbeddingIndexWorker({
  db,
  embeddingProviders,
  appInstance,
  concurrency = 1,
  startPolling = true,
}: EmbeddingIndexWorkerDeps) {
  const embeddingIndexQueue = createEmbeddingIndexQueue({ db, appInstance });

  async function getJobEmbeddingConfigLabel(job: AsyncJob<EmbeddingIndexJobData> | undefined) {
    const embeddingIndexId = job?.data.embeddingIndexId;
    if (embeddingIndexId === undefined) {
      return 'embedding model unknown';
    }

    try {
      const config = await createEmbeddingIndexServices({ db }).getEmbeddingIndexConfig({ embeddingIndexId });
      if (config === null) {
        return `embedding index ${embeddingIndexId}, model unavailable`;
      }

      return [
        `embedding index ${embeddingIndexId}`,
        `provider ${config.provider}`,
        `model ${config.model}`,
        `${config.dimensions} dimensions`,
      ].join(', ');
    } catch (error) {
      return `embedding index ${embeddingIndexId}, model lookup failed: ${error instanceof Error ? error.message : 'unknown error'}`;
    }
  }

  async function processEmbeddingIndexJob(job: AsyncJob<EmbeddingIndexJobData>) {
    const services = createEmbeddingIndexServices({ db });

    if (job.name === EMBEDDING_INDEX_ORCHESTRATE_JOB) {
      const config = await services.getEmbeddingIndexConfig({
        embeddingIndexId: job.data.embeddingIndexId,
      });
      if (config === null || !['active', 'building'].includes(config.status)) {
        return {
          skipped: true,
          reason: 'index_not_orchestratable',
        };
      }

      const documents = await services.discoverDocumentsForIndex({
        embeddingIndexId: job.data.embeddingIndexId,
        includeReady: false,
      });

      for (const [index, document] of documents.entries()) {
        await embeddingIndexQueue.enqueueDocumentIndexing({
          embeddingIndexId: job.data.embeddingIndexId,
          documentId: document.documentId,
        });
        await job.updateProgress(documents.length === 0 ? 50 : Math.round(((index + 1) / documents.length) * 80));
      }

      if (config.status === 'building') {
        await embeddingIndexQueue.enqueueFinalizeIndex({
          embeddingIndexId: job.data.embeddingIndexId,
        });
      }

      return {
        discoveredDocumentCount: documents.length,
        mode: config.status,
      };
    }

    if (job.name === EMBEDDING_INDEX_DOCUMENT_JOB) {
      if (job.data.documentId === undefined) {
        throw new Error('Document indexing job is missing documentId.');
      }

      let result: Awaited<ReturnType<typeof indexDocumentForEmbedding>>;

      try {
        result = await indexDocumentForEmbedding({
          db,
          embeddingProviders,
          embeddingIndexId: job.data.embeddingIndexId,
          documentId: job.data.documentId,
        });
      } catch (error) {
        if (job.attempts >= job.maxAttempts) {
          const failureMessage = error instanceof Error ? error.message : 'Unknown embedding indexing failure.';
          await services.markDocumentIndexFailed({
            embeddingIndexId: job.data.embeddingIndexId,
            documentId: job.data.documentId,
            failureMessage,
          });
          await services.refreshEmbeddingIndexCounts({
            embeddingIndexId: job.data.embeddingIndexId,
          });
          await services.markEmbeddingIndexFailed({
            embeddingIndexId: job.data.embeddingIndexId,
            failureMessage,
          });
        }

        throw error;
      }

      if (result.status === 'stale') {
        await embeddingIndexQueue.enqueueOrchestrateIndex({
          embeddingIndexId: job.data.embeddingIndexId,
        });
      }

      return result;
    }

    if (job.name === EMBEDDING_INDEX_FINALIZE_JOB) {
      return finalizeEmbeddingIndex({
        db,
        embeddingIndexQueue,
        embeddingIndexId: job.data.embeddingIndexId,
      });
    }

    if (job.name === EMBEDDING_INDEX_CLEANUP_JOB) {
      if (job.data.retiredEmbeddingIndexId === undefined) {
        throw new Error('Cleanup job is missing retiredEmbeddingIndexId.');
      }

      await services.cleanupRetiredEmbeddingIndex({
        retiredEmbeddingIndexId: job.data.retiredEmbeddingIndexId,
      });

      return {
        retiredEmbeddingIndexId: job.data.retiredEmbeddingIndexId,
      };
    }

    throw new Error(`Unknown embedding index job: ${job.name}`);
  }

  const worker = createPostgresWorker<EmbeddingIndexJobData>({
    db,
    queueName: getScopedQueueName(EMBEDDING_INDEX_QUEUE, appInstance),
    concurrency,
    autorun: startPolling,
    handler: async job => processEmbeddingIndexJob(job),
  });

  worker.on('failed', (job, error) => {
    void getJobEmbeddingConfigLabel(job).then((label) => {
      console.error(
        `Embedding index job failed for ${job?.name ?? 'unknown'} (${job?.id ?? 'unknown'}; ${label}):`,
        error.message,
      );
    });
  });

  worker.on('completed', (job) => {
    void getJobEmbeddingConfigLabel(job).then((label) => {
      console.info(`Embedding index job completed for ${job.name} (${job.id}; ${label})`);
    });
  });

  async function close() {
    await worker.close();
    await embeddingIndexQueue.close();
  }

  return {
    close,
    processEmbeddingIndexJob,
    worker,
  };
}
