import process from 'node:process';
import { serve } from '@hono/node-server';
import Redis from 'ioredis';
import { parseConfig } from './modules/config/config.js';
import { createAuth } from './modules/auth/auth.services.js';
import { createEncryptionServices } from './modules/encryption/encryption.services.js';
import { createStorageDriver } from './modules/storage/storage.services.js';
import { setupDatabase } from './modules/database/database.js';
import { createServer } from './modules/server/server.js';
import { createDocumentQueue } from './modules/worker/queue.js';
import { createUnstructuredClient } from './modules/unstructured/unstructured.client.js';
import { createUnstructuredParser } from './modules/parsing/adapters/unstructured.parser.js';
import { renderPdfPagesToImages } from './modules/parsing/pdf-page-renderer.js';
import {
  createRuntimeConfiguredGluedWordNormalizer,
} from './modules/parsing/glued-word-normalizer.js';
import { createRuntimeConfiguredOllamaChunkSummariser } from './modules/parsing/ollama-chunk-summariser.js';
import { createRuntimeConfiguredOllamaEmbedder } from './modules/parsing/ollama-embedder.js';
import { createRuntimeConfiguredOllamaVisionTextFallback } from './modules/parsing/ollama-vision-text-fallback.js';
import { createParserRegistry } from './modules/parsing/parser.registry.js';
import { createParsePipeline } from './modules/parsing/parse-pipeline.js';
import {
  createDeterministicTextCleaner,
  createNoopTextCleaner,
} from './modules/parsing/text-cleaner.js';
import { createDocumentWorker } from './modules/worker/document.worker.js';
import { createMaintenanceQueue } from './modules/worker/maintenance.queue.js';
import { createMaintenanceWorker } from './modules/worker/maintenance.worker.js';
import { createBackupQueue } from './modules/worker/backup.queue.js';
import { createBackupWorker } from './modules/worker/backup.worker.js';
import { createBackupServices } from './modules/admin/backups/backups.services.js';
import { createAdminAiServices } from './modules/admin/ai/ai.services.js';

export async function startApp() {
  const { config } = parseConfig({ env: process.env });

  const processMode = config.processMode;
  const isWebMode = processMode === 'all' || processMode === 'web';
  const isWorkerMode = processMode === 'all' || processMode === 'worker';

  console.info(`Starting Arkivra in "${processMode}" mode...`);

  const { db, pool } = setupDatabase({ config });
  const { auth } = createAuth({ db, config });
  const encryption = createEncryptionServices({ kekKeysRaw: config.encryption.keys });
  const storage = createStorageDriver({ config });

  const redis = new Redis(config.redis.url, { maxRetriesPerRequest: null });
  const documentQueue = createDocumentQueue({ connection: redis });
  const maintenanceQueue = createMaintenanceQueue({ connection: redis });
  const backupQueue = createBackupQueue({ connection: redis });
  const backupServices = createBackupServices({ config });
  const adminAiServices = createAdminAiServices({ db, config });

  if (isWebMode) {
    const { app } = createServer({
      config,
      auth,
      db,
      storage,
      encryption,
      documentQueue,
      backupQueue,
      adminAiServices,
    });

    serve(
      {
        fetch: app.fetch,
        port: config.server.port,
        hostname: config.server.hostname,
      },
      ({ port }) => {
        console.info(`Arkivra API server listening on http://${config.server.hostname}:${port}`);
      },
    );
  }

  // Collect cleanup functions for graceful shutdown
  const cleanups: Array<() => Promise<void>> = [];

  if (isWorkerMode) {
    const unstructuredClient = createUnstructuredClient({
      baseUrl: config.unstructured.url,
      apiKey: config.unstructured.apiKey,
      partitionOptions: {
        strategy: config.unstructured.strategy,
        languages: config.unstructured.languages,
        inferTableStructure: config.unstructured.inferTableStructure,
        extractImageBlockTypes: config.unstructured.extractImageBlockTypes,
        splitPdfPage: config.unstructured.splitPdfPage,
        splitPdfAllowFailed: config.unstructured.splitPdfAllowFailed,
        splitPdfConcurrencyLevel: config.unstructured.splitPdfConcurrencyLevel,
        splitPdfBatchSize: config.unstructured.splitPdfBatchSize,
      },
    });
    const unstructuredParser = createUnstructuredParser({
      unstructuredClient,
      engineVersion: config.unstructured.engineVersion,
    });
    const parserRegistry = createParserRegistry({
      parsers: [unstructuredParser],
      defaultEngine: 'unstructured',
    });
    const textCleaner =
      config.parsers.textCleanup === 'deterministic'
        ? createDeterministicTextCleaner()
        : createNoopTextCleaner();
    const gluedWordNormalizer = createRuntimeConfiguredGluedWordNormalizer({
      resolveSettings: async () => {
        const settings = await adminAiServices.getSettings();
        return {
          enabled: settings.enabled,
          host: settings.ollamaHost,
          model: settings.model,
          minTokenLength: settings.minTokenLength,
          maxCandidates: settings.maxCandidates,
          batchSize: settings.batchSize,
          maxInputChars: config.ollama.aiNormalizationMaxInputChars,
          logRequests: config.ollama.logRequests,
        };
      },
    });
    const emptyTextFallback = config.parsers.emptyTextFallback === 'ollama_vision'
      ? createRuntimeConfiguredOllamaVisionTextFallback({
          resolveSettings: async () => {
            const settings = await adminAiServices.getSettings();
            return {
              host: settings.ollamaHost,
              model: settings.model,
              logRequests: config.ollama.logRequests,
            };
          },
          loadImages: async (input, raw) => {
            if (raw.engine !== 'unstructured') {
              return [];
            }

            return await renderPdfPagesToImages({
              fileName: input.fileName,
              mimeType: input.mimeType,
              fileData: input.fileData,
              maxPages: 8,
            });
          },
        })
      : undefined;
    const chunkSummariser = createRuntimeConfiguredOllamaChunkSummariser({
      resolveSettings: async () => {
        const settings = await adminAiServices.getIngestionSettings();
        return {
          enabled: settings.summarisationEnabled,
          host: settings.summarisationHost,
          model: settings.summarisationModel,
          maxImagesPerChunk: settings.summarisationMaxImagesPerChunk,
          logRequests: config.ollama.logRequests,
        };
      },
    });
    const parsePipeline = createParsePipeline({
      parserRegistry,
      cleaner: textCleaner,
      gluedWordNormalizer,
      emptyTextFallback,
      chunkSummariser,
    });
    const chunkEmbedder = createRuntimeConfiguredOllamaEmbedder({
      resolveSettings: async () => {
        const settings = await adminAiServices.getIngestionSettings();
        return {
          enabled: settings.embeddingEnabled,
          host: settings.embeddingHost,
          model: settings.embeddingModel,
          dimensions: settings.embeddingDimensions,
          logRequests: config.ollama.logRequests,
        };
      },
    });
    const documentWorker = createDocumentWorker({
      db,
      storage,
      encryption,
      parsePipeline,
      chunkEmbedder,
      connection: redis,
    });
    const maintenanceWorker = createMaintenanceWorker({
      connection: redis,
      db,
      defaultRetentionDays: config.backgroundJobs.documentRetentionDays,
      storage,
    });
    const backupWorker = createBackupWorker({
      backupDirectory: backupServices.backupDirectory,
      connection: redis,
      maintenanceFlagPath: backupServices.maintenanceFlagPath,
      pool,
      storageBasePath: config.storage.filesystem.basePath,
      version: config.version,
    });

    await maintenanceQueue.scheduleHardDeleteExpiredDocuments({
      cronPattern: config.backgroundJobs.hardDeleteExpiredDocumentsCron,
      retentionDays: config.backgroundJobs.documentRetentionDays,
    });

    console.info('Document processing worker started');
    console.info(
      `AI OCR normalization: runtime-configured via admin settings (env defaults: ${config.parsers.gluedWordNormalization}, ${config.ollama.model} @ ${config.ollama.host})`,
    );
    console.info(
      `Empty-text fallback: ${config.parsers.emptyTextFallback === 'ollama_vision' ? `Ollama vision (${config.ollama.model} @ ${config.ollama.host})` : 'disabled'}`,
    );
    console.info(
      `Document parser: Unstructured ${config.unstructured.url} (${config.unstructured.strategy}, languages ${config.unstructured.languages.join('+')})`,
    );
    console.info(
      `Scheduled hard-delete-expired-documents cron (${config.backgroundJobs.hardDeleteExpiredDocumentsCron}) with ${config.backgroundJobs.documentRetentionDays} day retention`,
    );
    cleanups.push(async () => documentWorker.close());
    cleanups.push(async () => maintenanceWorker.close());
    cleanups.push(async () => backupWorker.close());
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.info('Shutting down...');
    for (const fn of cleanups) {
      await fn();
    }
    await documentQueue.close();
    await maintenanceQueue.close();
    await backupQueue.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
}
