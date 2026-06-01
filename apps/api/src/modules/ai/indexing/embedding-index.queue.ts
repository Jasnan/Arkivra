import type { Database } from '../../database/database.js';
import { createPostgresQueue, getScopedQueueName } from '../../worker/postgres-jobs.js';

export const EMBEDDING_INDEX_QUEUE = 'embedding-index';
export const EMBEDDING_INDEX_ORCHESTRATE_JOB = 'embedding-index-orchestrate';
export const EMBEDDING_INDEX_DOCUMENT_JOB = 'embedding-index-document';
export const EMBEDDING_INDEX_FINALIZE_JOB = 'embedding-index-finalize';
export const EMBEDDING_INDEX_CLEANUP_JOB = 'embedding-index-cleanup';

export type EmbeddingIndexJobData =
  | { embeddingIndexId: string; documentId?: never; retiredEmbeddingIndexId?: never }
  | { embeddingIndexId: string; documentId: string; retiredEmbeddingIndexId?: never }
  | { embeddingIndexId: string; documentId?: never; retiredEmbeddingIndexId: string };

function orchestrateJobId(embeddingIndexId: string) {
  return `embedding-index-orchestrate-${embeddingIndexId}`;
}

function documentJobId(embeddingIndexId: string, documentId: string) {
  return `embedding-index-document-${embeddingIndexId}-${documentId}`;
}

function finalizeJobId(embeddingIndexId: string) {
  return `embedding-index-finalize-${embeddingIndexId}`;
}

function cleanupJobId(embeddingIndexId: string, retiredEmbeddingIndexId: string) {
  return `embedding-index-cleanup-${embeddingIndexId}-${retiredEmbeddingIndexId}`;
}

export function createEmbeddingIndexQueue({
  db,
  appInstance,
}: {
  db: Database;
  appInstance?: string;
}) {
  const queue = createPostgresQueue<EmbeddingIndexJobData>({
    db,
    queueName: getScopedQueueName(EMBEDDING_INDEX_QUEUE, appInstance),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  });

  async function enqueueOrchestrateIndex({ embeddingIndexId }: { embeddingIndexId: string }) {
    await queue.add(
      EMBEDDING_INDEX_ORCHESTRATE_JOB,
      { embeddingIndexId },
      { jobId: orchestrateJobId(embeddingIndexId) },
    );
  }

  async function enqueueDocumentIndexing({
    embeddingIndexId,
    documentId,
  }: {
    embeddingIndexId: string;
    documentId: string;
  }) {
    await queue.add(
      EMBEDDING_INDEX_DOCUMENT_JOB,
      { embeddingIndexId, documentId },
      { jobId: documentJobId(embeddingIndexId, documentId) },
    );
  }

  async function enqueueFinalizeIndex({ embeddingIndexId }: { embeddingIndexId: string }) {
    await queue.add(
      EMBEDDING_INDEX_FINALIZE_JOB,
      { embeddingIndexId },
      { jobId: finalizeJobId(embeddingIndexId) },
    );
  }

  async function enqueueCleanupIndex({
    embeddingIndexId,
    retiredEmbeddingIndexId,
  }: {
    embeddingIndexId: string;
    retiredEmbeddingIndexId: string;
  }) {
    await queue.add(
      EMBEDDING_INDEX_CLEANUP_JOB,
      { embeddingIndexId, retiredEmbeddingIndexId },
      { jobId: cleanupJobId(embeddingIndexId, retiredEmbeddingIndexId) },
    );
  }

  async function cancelEmbeddingIndexJobs({
    embeddingIndexId,
    documentIds,
  }: {
    embeddingIndexId: string;
    documentIds: string[];
  }) {
    const jobIds = [
      orchestrateJobId(embeddingIndexId),
      finalizeJobId(embeddingIndexId),
      ...documentIds.map(documentId => documentJobId(embeddingIndexId, documentId)),
    ];

    for (const jobId of jobIds) {
      const job = await queue.getJob(jobId);
      const state = await job?.getState();
      if (job !== undefined && state !== 'active' && state !== 'unknown') {
        await job.remove();
      }
    }
  }

  async function close() {
    await queue.close();
  }

  return {
    cancelEmbeddingIndexJobs,
    close,
    enqueueCleanupIndex,
    enqueueDocumentIndexing,
    enqueueFinalizeIndex,
    enqueueOrchestrateIndex,
    queue,
  };
}

export type EmbeddingIndexQueue = ReturnType<typeof createEmbeddingIndexQueue>;
