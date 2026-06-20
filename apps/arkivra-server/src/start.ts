import process from 'node:process';
import { serve } from '@hono/node-server';
import { parseConfig } from './modules/config/config.js';
import { loadApiEnvFiles } from './modules/config/env-loader.js';
import { createAuth } from './modules/auth/auth.services.js';
import { createEncryptionServices } from './modules/encryption/encryption.services.js';
import { createStorageDriver } from './modules/storage/storage.services.js';
import { setupDatabase } from './modules/database/database.js';
import { createServer } from './modules/server/server.js';
import { createDocumentQueue } from './modules/worker/queue.js';
import { createDoclingClient } from './modules/docling/docling.client.js';
import { createDoclingParser } from './modules/parsing/adapters/docling.parser.js';
import { createRuntimeConfiguredOllamaImageCaptioner } from './modules/parsing/image-captioner.js';
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
import { createActivityServices } from './modules/activity/activity.services.js';
import {
  createEmbeddingIndexServices,
  createEmbeddingIndexQueue,
  createEmbeddingIndexWorker,
} from './modules/ai/indexing/index.js';
import { createOllamaEmbeddingProvider } from './modules/ai/providers/index.js';

export async function startApp() {
  loadApiEnvFiles();
  const { config } = parseConfig({ env: process.env });

  const processMode = config.processMode;
  const isWebMode = processMode === 'all' || processMode === 'web';
  const isWorkerMode = processMode === 'all' || processMode === 'worker';

  console.info(`Starting Arkivra in "${processMode}" mode...`);
  if (config.app.instance !== undefined) {
    console.info(`Arkivra app instance: ${config.app.instance}`);
  }

  const { db, pool } = setupDatabase({ config });
  const { auth } = createAuth({ db, config });
  const encryption = createEncryptionServices({ kekKeysRaw: config.encryption.keys });
  const storage = createStorageDriver({ config });

  const documentQueue = createDocumentQueue({ db, appInstance: config.app.instance });
  const maintenanceQueue = createMaintenanceQueue({ db, appInstance: config.app.instance });
  const backupQueue = createBackupQueue({ db, appInstance: config.app.instance });
  const embeddingIndexQueue = createEmbeddingIndexQueue({ db, appInstance: config.app.instance });
  const backupServices = createBackupServices({ config });
  const adminAiServices = createAdminAiServices({ db, config, embeddingIndexQueue });
  const activityServices = createActivityServices({ db });

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
      embeddingIndexQueue,
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
    const doclingClient = createDoclingClient({
      baseUrl: config.docling.url,
    });
    const imageCaptioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => {
        const settings = await adminAiServices.getIngestionSettings();
        return {
          enabled: settings.captioningEnabled,
          host: settings.captioningHost,
          model: settings.captioningModel,
          logRequests: config.ollama.logRequests,
        };
      },
    });
    const doclingParser = createDoclingParser({
      doclingClient,
      engineVersion: config.docling.engineVersion,
      imageCaptioner,
      vlmEnabled: config.docling.vlmPipeline === 'enabled',
      vlmPipelinePreset: config.docling.vlmModel,
      scanClassifier: {
        maxSampledPages: config.parsers.pdfScanDetection.maxSampledPages,
        minTextItemsPerDigitalPage: config.parsers.pdfScanDetection.minTextItemsPerDigitalPage,
        minAlnumCharsPerDigitalPage: config.parsers.pdfScanDetection.minAlnumCharsPerDigitalPage,
        scanHeavyScannedPageRatio: config.parsers.pdfScanDetection.scanHeavyScannedPageRatio,
        mixedScannedPageRatio: config.parsers.pdfScanDetection.mixedScannedPageRatio,
      },
    });
    const parserRegistry = createParserRegistry({
      parsers: [doclingParser],
      defaultEngine: 'docling',
    });
    const textCleaner =
      config.parsers.textCleanup === 'deterministic'
        ? createDeterministicTextCleaner()
        : createNoopTextCleaner();
    const parsePipeline = createParsePipeline({
      parserRegistry,
      cleaner: textCleaner,
    });
    const documentWorker = createDocumentWorker({
      db,
      storage,
      encryption,
      parsePipeline,
      concurrency: config.backgroundJobs.documentProcessingConcurrency,
      appInstance: config.app.instance,
      pauseWhen: backupServices.isMaintenanceModeEnabled,
      activityServices,
      adminAiServices,
      embeddingIndexQueue,
    });
    const maintenanceWorker = createMaintenanceWorker({
      db,
      defaultRetentionDays: config.backgroundJobs.documentRetentionDays,
      storage,
      appInstance: config.app.instance,
      pauseWhen: backupServices.isMaintenanceModeEnabled,
    });
    const backupWorker = createBackupWorker({
      backupDirectory: backupServices.backupDirectory,
      backupEncryptionKeyRaw: config.backups.archiveEncryptionKey,
      backupPartSizeBytes: config.backups.partSizeBytes,
      db,
      maintenanceFlagPath: backupServices.maintenanceFlagPath,
      pool,
      storageBasePath: config.storage.filesystem.basePath,
      version: config.version,
      appInstance: config.app.instance,
    });
    const embeddingIndexWorker = createEmbeddingIndexWorker({
      db,
      appInstance: config.app.instance,
      adminAiServices,
      pauseWhen: backupServices.isMaintenanceModeEnabled,
      embeddingProviders: {
        ollama: createOllamaEmbeddingProvider({
          batchSize: config.ollama.embeddingBatchSize,
        }),
      },
    });
    try {
      const settings = await adminAiServices.getSettings();
      if (settings.aiFeaturesEnabled) {
        const activeIndex = await createEmbeddingIndexServices({ db }).getActiveEmbeddingIndex();
        if (activeIndex !== null) {
          await embeddingIndexQueue.enqueueOrchestrateIndex({ embeddingIndexId: activeIndex.id });
        }
      }
    } catch (error) {
      console.error(
        'Could not enqueue startup semantic index reconciliation:',
        error instanceof Error ? error.message : error,
      );
    }

    await maintenanceQueue.scheduleHardDeleteExpiredDocuments({
      cronPattern: config.backgroundJobs.hardDeleteExpiredDocumentsCron,
      retentionDays: config.backgroundJobs.documentRetentionDays,
    });

    console.info('Document processing worker started');
    console.info('Embedding indexing worker started');
    console.info(`Document parser: Docling ${config.docling.url}`);
    console.info(
      `Scheduled hard-delete-expired-documents cron (${config.backgroundJobs.hardDeleteExpiredDocumentsCron}) with ${config.backgroundJobs.documentRetentionDays} day retention`,
    );
    cleanups.push(async () => documentWorker.close());
    cleanups.push(async () => maintenanceWorker.close());
    cleanups.push(async () => backupWorker.close());
    cleanups.push(async () => embeddingIndexWorker.close());
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
    await embeddingIndexQueue.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
}
