import type { Database } from '../../database/database.js';
import type { EmbeddingProviderRegistry } from '../providers/types.js';
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

type ChunkRow = {
  document_id: string;
  document_version_id: string;
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

type DocumentEmbeddingStatusRow = {
  status: string;
  expected_chunk_count: number;
  embedded_chunk_count: number;
};

type ChunkEmbeddingHashRow = {
  chunk_id: string;
  content_sha256: string;
};

export type EmbeddingIndexWorkerDeps = {
  db: Database;
  embeddingProviders: EmbeddingProviderRegistry;
  adminAiServices?: {
    getSettings: () => Promise<{ aiFeaturesEnabled: boolean }>;
  };
  appInstance?: string;
  concurrency?: number;
  startPolling?: boolean;
  pauseWhen?: () => Promise<boolean>;
};

async function loadDocumentChunks({
  db,
  documentVersionId,
}: {
  db: Database;
  documentVersionId: string;
}) {
  const result = await db.execute<ChunkRow>(sql`
    SELECT
      d.id AS document_id,
      dv.id AS document_version_id,
      dv.vault_id,
      dc.id AS chunk_id,
      dc.content,
      dc.chunk_index
    FROM document_versions AS dv
    INNER JOIN documents AS d ON d.id = dv.document_id
      AND d.vault_id = dv.vault_id
    LEFT JOIN document_chunks AS dc ON dc.document_version_id = dv.id
      AND dc.document_id = d.id
      AND dc.vault_id = dv.vault_id
    WHERE dv.id = ${documentVersionId}
      AND dv.processing_status = 'completed'
      AND dv.deleted_at IS NULL
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
      documentVersionId: row.document_version_id,
      vaultId: row.vault_id,
      content: row.content,
      contentSha256: hashEmbeddingContent(row.content),
    }];
  });
}

async function documentEmbeddingIsCurrent({
  db,
  embeddingIndexId,
  documentVersionId,
  chunks,
}: {
  db: Database;
  embeddingIndexId: string;
  documentVersionId: string;
  chunks: ReturnType<typeof toIndexableChunks>;
}) {
  const statusRows = await db.execute<DocumentEmbeddingStatusRow>(sql`
    SELECT status, expected_chunk_count, embedded_chunk_count
    FROM document_embedding_index_status
    WHERE embedding_index_id = ${embeddingIndexId}
      AND document_version_id = ${documentVersionId}
    LIMIT 1
  `);
  const status = statusRows.rows[0];

  if (
    status === undefined
    || status.status !== 'ready'
    || status.expected_chunk_count !== chunks.length
    || status.embedded_chunk_count !== chunks.length
  ) {
    return false;
  }

  const embeddingRows = await db.execute<ChunkEmbeddingHashRow>(sql`
    SELECT chunk_id, content_sha256
    FROM document_chunk_embeddings
    WHERE embedding_index_id = ${embeddingIndexId}
      AND document_version_id = ${documentVersionId}
  `);

  if (embeddingRows.rows.length !== chunks.length) {
    return false;
  }

  const hashByChunkId = new Map(
    embeddingRows.rows.map(row => [row.chunk_id, row.content_sha256]),
  );

  return chunks.every(chunk => hashByChunkId.get(chunk.chunkId) === chunk.contentSha256);
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
  adminAiServices,
  embeddingIndexId,
  documentVersionId,
}: {
  db: Database;
  embeddingProviders: EmbeddingProviderRegistry;
  adminAiServices?: {
    getSettings: () => Promise<{ aiFeaturesEnabled: boolean }>;
  };
  embeddingIndexId: string;
  documentVersionId: string;
}) {
  const services = createEmbeddingIndexServices({ db });
  const config = await services.getEmbeddingIndexConfig({ embeddingIndexId });
  if (config === null || !['active', 'building'].includes(config.status)) {
    return { status: 'skipped' as const, reason: 'index_not_writable' };
  }
  if (!config.isEnabled) {
    return { status: 'skipped' as const, reason: 'provider_config_disabled' };
  }
  if (adminAiServices !== undefined) {
    const settings = await adminAiServices.getSettings();
    if (!settings.aiFeaturesEnabled) {
      return { status: 'skipped' as const, reason: 'ai_disabled' };
    }
  }

  const provider = embeddingProviders[config.provider];
  if (provider === undefined) {
    throw new Error(`No embedding provider is registered for ${config.provider}.`);
  }

  const rows = await loadDocumentChunks({ db, documentVersionId });
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
      documentId: firstRow.document_id,
      documentVersionId,
      vaultId: firstRow.vault_id,
      status: 'skipped',
      expectedChunkCount: 0,
      embeddedChunkCount: 0,
      indexedAt: 'now',
    });
    await services.refreshEmbeddingIndexCounts({ embeddingIndexId });
    return { status: 'skipped' as const, reason: 'no_chunks' };
  }

  if (await documentEmbeddingIsCurrent({
    db,
    embeddingIndexId,
    documentVersionId,
    chunks,
  })) {
    return {
      status: 'ready' as const,
      skippedProvider: true,
      embeddedChunkCount: chunks.length,
    };
  }

  const claimed = await services.tryClaimDocumentIndexing({
    embeddingIndexId,
    documentId: firstRow.document_id,
    documentVersionId,
    vaultId: firstRow.vault_id,
    expectedChunkCount: chunks.length,
  });

  if (!claimed) {
    if (await documentEmbeddingIsCurrent({
      db,
      embeddingIndexId,
      documentVersionId,
      chunks,
    })) {
      return {
        status: 'ready' as const,
        skippedProvider: true,
        embeddedChunkCount: chunks.length,
      };
    }

    return { status: 'skipped' as const, reason: 'document_already_indexing' };
  }

  try {
    const embeddings = await provider.embed({
      texts: chunks.map(chunk => chunk.content),
      config,
    });

    assertEmbeddingsMatchConfig({
      embeddings,
      expectedCount: chunks.length,
      dimensions: config.dimensions,
    });

    const latestChunks = toIndexableChunks(await loadDocumentChunks({ db, documentVersionId }));
    const latestHashes = new Map(latestChunks.map(chunk => [chunk.chunkId, chunk.contentSha256]));
    const chunksChanged = chunks.some(chunk => latestHashes.get(chunk.chunkId) !== chunk.contentSha256)
      || latestChunks.length !== chunks.length;

    if (chunksChanged) {
      await services.setDocumentIndexStatus({
        embeddingIndexId,
        documentId: firstRow.document_id,
        documentVersionId,
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
        documentVersionId: chunk.documentVersionId,
        vaultId: chunk.vaultId,
        content: chunk.content,
        embedding: embeddings[index]!,
      })),
    });

    await services.setDocumentIndexStatus({
      embeddingIndexId,
      documentId: firstRow.document_id,
      documentVersionId,
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
  } catch (error) {
    await services.setDocumentIndexStatus({
      embeddingIndexId,
      documentId: firstRow.document_id,
      documentVersionId,
      vaultId: firstRow.vault_id,
      status: 'pending',
      expectedChunkCount: chunks.length,
      embeddedChunkCount: 0,
      failureMessage: error instanceof Error ? error.message : 'Embedding indexing failed.',
    });
    await services.refreshEmbeddingIndexCounts({ embeddingIndexId });
    throw error;
  }
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
  adminAiServices,
  appInstance,
  concurrency = 1,
  startPolling = true,
  pauseWhen,
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
      if (adminAiServices !== undefined) {
        const settings = await adminAiServices.getSettings();
        if (!settings.aiFeaturesEnabled) {
          return {
            skipped: true,
            reason: 'ai_disabled',
          };
        }
      }

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
          documentVersionId: document.documentVersionId,
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
      if (job.data.documentVersionId === undefined) {
        throw new Error('Document indexing job is missing documentVersionId.');
      }

      let result: Awaited<ReturnType<typeof indexDocumentForEmbedding>>;

      try {
        result = await indexDocumentForEmbedding({
          db,
          embeddingProviders,
          adminAiServices,
          embeddingIndexId: job.data.embeddingIndexId,
          documentVersionId: job.data.documentVersionId,
        });
      } catch (error) {
        if (job.attempts >= job.maxAttempts) {
          const failureMessage = error instanceof Error ? error.message : 'Unknown embedding indexing failure.';
          await services.markDocumentIndexFailed({
            embeddingIndexId: job.data.embeddingIndexId,
            documentVersionId: job.data.documentVersionId,
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
      if (adminAiServices !== undefined) {
        const settings = await adminAiServices.getSettings();
        if (!settings.aiFeaturesEnabled) {
          return {
            skipped: true,
            reason: 'ai_disabled',
          };
        }
      }

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
    pauseWhen,
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
