import type { Database } from '../database/database.js';
import type { StorageDriver } from '../storage/storage.types.js';
import type { EncryptionServices } from '../encryption/encryption.services.js';
import type { ParsePipeline } from '../parsing/parse-pipeline.js';
import type { EmbeddingIndexQueue } from '../ai/indexing/index.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import type { DocumentConverter } from '../document-conversion/index.js';
import { isOfficeDocumentConvertible } from '../document-conversion/index.js';
import type { createAuditServices } from '../audit/audit.services.js';
import { AUDIT_EVENT_TYPES } from '../audit/audit.types.js';
import {
  documentVersionChunkAssetStoragePrefix,
  documentVersionPreviewPdfStorageKey,
} from '../documents/document-storage-keys.js';
import { persistParsedDocument } from '../parsing/persistence.js';
import { sha256Hex } from '../parsing/binary-diagnostics.js';
import type { MaintenanceJobData } from './maintenance.queue.js';
import { sql } from 'drizzle-orm';
import {
  GENERATE_OFFICE_PREVIEW_PDFS_JOB,
  HARD_DELETE_EXPIRED_DOCUMENTS_JOB,
  MAINTENANCE_QUEUE,
} from './maintenance.queue.js';
import type { AsyncJob } from './postgres-jobs.js';
import { createPostgresWorker, getScopedQueueName } from './postgres-jobs.js';
import type { OfficeDocumentConversionRuntimeStatus } from '../admin/maintenance/office-conversion-settings.js';

type ExpiredDocumentRow = {
  id: string;
  original_name: string;
  original_storage_key: string;
  vault_id: string;
};

type AssetStorageKeyRow = {
  storage_key: string;
};

type DocumentVersionStorageRow = {
  id: string;
  original_storage_key: string;
};

export type MaintenanceWorkerDeps = {
  db: Database;
  defaultRetentionDays: number;
  encryption?: EncryptionServices;
  parsePipeline?: ParsePipeline;
  storage: StorageDriver;
  appInstance?: string;
  startPolling?: boolean;
  pauseWhen?: () => Promise<boolean>;
  documentConverter?: DocumentConverter;
  resolveOfficeDocumentConversionRuntimeStatus?: () => Promise<OfficeDocumentConversionRuntimeStatus>;
  adminAiServices?: {
    getSettings: () => Promise<{ aiFeaturesEnabled: boolean }>;
  };
  embeddingIndexQueue?: EmbeddingIndexQueue;
  auditServices?: ReturnType<typeof createAuditServices>;
};

type OfficePreviewCandidateRow = {
  document_id: string;
  document_version_id: string;
  vault_id: string;
  original_name: string;
  original_storage_key: string;
  original_sha256_hash: string;
  mime_type: string;
  file_encryption_key_wrapped: string | null;
  file_encryption_kek_version: string | null;
};

export async function hardDeleteExpiredDocuments({
  db,
  now = new Date(),
  retentionDays,
  storage,
  auditServices,
}: {
  db: Database;
  now?: Date;
  retentionDays: number;
  storage: StorageDriver;
  auditServices?: ReturnType<typeof createAuditServices>;
}) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  const expiredDocuments = await db.execute<ExpiredDocumentRow>(sql`
    SELECT id, original_name, original_storage_key, vault_id
    FROM documents
    WHERE is_deleted = true
      AND deleted_at IS NOT NULL
      AND deleted_at <= ${cutoff}
  `);

  let deletedCount = 0;

  for (const document of expiredDocuments.rows) {
    const assetStorageKeys = await db.execute<AssetStorageKeyRow>(sql`
      SELECT DISTINCT storage_key
      FROM document_chunk_assets
      WHERE document_id = ${document.id}
        AND storage_key IS NOT NULL
    `);

    const versionStorageRows = await db.execute<DocumentVersionStorageRow>(sql`
      SELECT id, original_storage_key
      FROM document_versions
      WHERE document_id = ${document.id}
    `);

    for (const asset of assetStorageKeys.rows) {
      await storage.remove(asset.storage_key);
    }

    for (const version of versionStorageRows.rows) {
      await storage.removePrefix?.(`previews/${version.id}`);
      await storage.remove(version.original_storage_key);
    }

    await storage.removePrefix?.(`previews/${document.id}`);
    await storage.remove(document.original_storage_key);
    await storage.removePrefix?.(`${document.vault_id}/${document.id}`);
    await db.execute(sql`DELETE FROM documents WHERE id = ${document.id}`);
    await auditServices?.emitAuditEvent({
      eventType: AUDIT_EVENT_TYPES.documentDeleted,
      eventCategory: 'document',
      outcome: 'success',
      actor: { type: 'system', displayName: 'System' },
      vaultId: document.vault_id,
      documentId: document.id,
      target: { type: 'document', id: document.id, displayName: document.original_name },
      source: 'background',
      metadata: {
        document_name: document.original_name,
        file_name: document.original_name,
        deletion_type: 'retention',
      },
    });
    deletedCount += 1;
  }

  return {
    cutoff,
    deletedCount,
  };
}

async function prepareEmbeddingReparse({
  db,
  documentVersionId,
}: {
  db: Database;
  documentVersionId: string;
}) {
  const affectedIndexes = await db.execute<{ embedding_index_id: string }>(sql`
    SELECT DISTINCT embedding_index_id
    FROM document_chunk_embeddings
    WHERE document_version_id = ${documentVersionId}
    UNION
    SELECT DISTINCT embedding_index_id
    FROM document_embedding_index_status
    WHERE document_version_id = ${documentVersionId}
  `);

  await db.execute(sql`
    DELETE FROM document_embedding_index_status
    WHERE document_version_id = ${documentVersionId}
  `);

  return affectedIndexes.rows.map(row => row.embedding_index_id);
}

async function refreshEmbeddingIndexCounts({
  db,
  embeddingIndexIds,
}: {
  db: Database;
  embeddingIndexIds: string[];
}) {
  if (embeddingIndexIds.length === 0) {
    return;
  }

  await db.execute(sql`
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
    WHERE ei.id IN (${sql.join(embeddingIndexIds.map(id => sql`${id}`), sql`,`)})
  `);
}

export async function generateOfficePreviewPdfs({
  db,
  storage,
  encryption,
  parsePipeline,
  documentConverter,
  resolveOfficeDocumentConversionRuntimeStatus,
  adminAiServices,
  embeddingIndexQueue,
  limit = 100,
}: {
  db: Database;
  storage: StorageDriver;
  encryption: EncryptionServices;
  parsePipeline: ParsePipeline;
  documentConverter?: DocumentConverter;
  resolveOfficeDocumentConversionRuntimeStatus?: () => Promise<OfficeDocumentConversionRuntimeStatus>;
  adminAiServices?: { getSettings: () => Promise<{ aiFeaturesEnabled: boolean }> };
  embeddingIndexQueue?: EmbeddingIndexQueue;
  limit?: number;
}) {
  if (documentConverter === undefined) {
    return { convertedCount: 0, skippedCount: 0, failedCount: 0, reason: 'not_configured' as const };
  }

  const runtimeStatus =
    resolveOfficeDocumentConversionRuntimeStatus === undefined
      ? ({ canScheduleConversion: true, effectiveState: 'active', error: null } as Pick<
          OfficeDocumentConversionRuntimeStatus,
          'canScheduleConversion' | 'effectiveState' | 'error'
        >)
      : await resolveOfficeDocumentConversionRuntimeStatus();
  if (!runtimeStatus.canScheduleConversion) {
    return {
      convertedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      reason: runtimeStatus.effectiveState,
      error: runtimeStatus.error,
    };
  }

  const rows = await db.execute<OfficePreviewCandidateRow>(sql`
    SELECT
      d.id AS document_id,
      dv.id AS document_version_id,
      dv.vault_id,
      dv.original_name,
      dv.original_storage_key,
      dv.original_sha256_hash,
      dv.mime_type,
      dv.file_encryption_key_wrapped,
      dv.file_encryption_kek_version
    FROM document_versions dv
    INNER JOIN documents d
      ON d.id = dv.document_id
      AND d.vault_id = dv.vault_id
    WHERE dv.deleted_at IS NULL
      AND d.is_deleted = false
      AND dv.preview_pdf_storage_key IS NULL
      AND (
        lower(dv.mime_type) IN (
          'application/msword',
          'application/vnd.ms-excel',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.oasis.opendocument.text',
          'application/vnd.oasis.opendocument.spreadsheet',
          'application/vnd.oasis.opendocument.presentation'
        )
        OR lower(dv.original_name) ~ '\\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$'
      )
    ORDER BY dv.uploaded_at ASC
    LIMIT ${limit}
  `);

  let convertedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of rows.rows) {
    if (!isOfficeDocumentConvertible({ fileName: row.original_name, mimeType: row.mime_type })) {
      skippedCount += 1;
      continue;
    }

    try {
      const rawData = await storage.read(row.original_storage_key);
      const originalData =
        row.file_encryption_key_wrapped !== null && row.file_encryption_kek_version !== null
          ? encryption.decrypt({
              encryptedData: rawData,
              wrappedDek: row.file_encryption_key_wrapped,
              kekVersion: row.file_encryption_kek_version,
            })
          : rawData;

      const actualSha256Hash = sha256Hex(originalData);
      if (actualSha256Hash !== row.original_sha256_hash) {
        throw new Error(
          `Document source integrity check failed for version ${row.document_version_id}: expected ${row.original_sha256_hash}, got ${actualSha256Hash}`,
        );
      }

      const converted = await documentConverter.convertToPdf({
        fileName: row.original_name,
        mimeType: row.mime_type,
        fileData: originalData,
      });
      const previewStorageKey = documentVersionPreviewPdfStorageKey({
        documentVersionId: row.document_version_id,
      });
      const previewSha256Hash = sha256Hex(converted.fileData);
      let dataToStore = converted.fileData;
      let wrappedDek: string | null = null;
      let kekVersion: string | null = null;
      let algorithm: string | null = null;

      if (encryption.isEnabled()) {
        const encrypted = encryption.encrypt(converted.fileData);
        dataToStore = encrypted.encryptedData;
        wrappedDek = encrypted.wrappedDek;
        kekVersion = encrypted.kekVersion;
        algorithm = encrypted.algorithm;
      }

      await storage.write(previewStorageKey, dataToStore);

      const parsed = await parsePipeline.run({
        documentId: row.document_id,
        documentVersionId: row.document_version_id,
        fileName: converted.fileName,
        displayFileName: row.original_name,
        mimeType: converted.mimeType,
        fileData: converted.fileData,
      });

      const affectedEmbeddingIndexIds = await prepareEmbeddingReparse({
        db,
        documentVersionId: row.document_version_id,
      });
      await storage.removePrefix?.(documentVersionChunkAssetStoragePrefix(row.document_version_id));

      await persistParsedDocument({
        db,
        storage,
        encryption,
        documentId: row.document_id,
        documentVersionId: row.document_version_id,
        vaultId: row.vault_id,
        parsed,
        expectedOriginalSha256Hash: row.original_sha256_hash,
      });
      await refreshEmbeddingIndexCounts({ db, embeddingIndexIds: affectedEmbeddingIndexIds });

      const previewFields = {
        previewPdfStorageKey: previewStorageKey,
        previewPdfSize: converted.fileData.length,
        previewPdfSha256Hash: previewSha256Hash,
        previewPdfConverter: converted.converter,
        previewPdfConverterVersion: converted.converterVersion,
        previewPdfCreatedAt: sql`now()`,
        previewPdfEncryptionKeyWrapped: wrappedDek,
        previewPdfEncryptionKekVersion: kekVersion,
        previewPdfEncryptionAlgorithm: algorithm,
        derivedPreviewStatus: 'ready',
        derivedPreviewErrorCode: null,
        derivedPreviewErrorMessage: null,
        derivedPreviewFailedAt: null,
        updatedAt: sql`now()`,
      };

      await db.execute(sql`
        UPDATE document_versions
        SET
          preview_pdf_storage_key = ${previewFields.previewPdfStorageKey},
          preview_pdf_size = ${previewFields.previewPdfSize},
          preview_pdf_sha256_hash = ${previewFields.previewPdfSha256Hash},
          preview_pdf_converter = ${previewFields.previewPdfConverter},
          preview_pdf_converter_version = ${previewFields.previewPdfConverterVersion},
          preview_pdf_created_at = now(),
          preview_pdf_encryption_key_wrapped = ${previewFields.previewPdfEncryptionKeyWrapped},
          preview_pdf_encryption_kek_version = ${previewFields.previewPdfEncryptionKekVersion},
          preview_pdf_encryption_algorithm = ${previewFields.previewPdfEncryptionAlgorithm},
          derived_preview_status = ${previewFields.derivedPreviewStatus},
          derived_preview_error_code = ${previewFields.derivedPreviewErrorCode},
          derived_preview_error_message = ${previewFields.derivedPreviewErrorMessage},
          derived_preview_failed_at = ${previewFields.derivedPreviewFailedAt},
          updated_at = now()
        WHERE id = ${row.document_version_id}
          AND document_id = ${row.document_id}
          AND vault_id = ${row.vault_id}
      `);
      await db.execute(sql`
        UPDATE documents
        SET
          preview_pdf_storage_key = ${previewFields.previewPdfStorageKey},
          preview_pdf_size = ${previewFields.previewPdfSize},
          preview_pdf_sha256_hash = ${previewFields.previewPdfSha256Hash},
          preview_pdf_converter = ${previewFields.previewPdfConverter},
          preview_pdf_converter_version = ${previewFields.previewPdfConverterVersion},
          preview_pdf_created_at = now(),
          preview_pdf_encryption_key_wrapped = ${previewFields.previewPdfEncryptionKeyWrapped},
          preview_pdf_encryption_kek_version = ${previewFields.previewPdfEncryptionKekVersion},
          preview_pdf_encryption_algorithm = ${previewFields.previewPdfEncryptionAlgorithm},
          derived_preview_status = ${previewFields.derivedPreviewStatus},
          derived_preview_error_code = ${previewFields.derivedPreviewErrorCode},
          derived_preview_error_message = ${previewFields.derivedPreviewErrorMessage},
          derived_preview_failed_at = ${previewFields.derivedPreviewFailedAt},
          updated_at = now()
        WHERE id = ${row.document_id}
          AND vault_id = ${row.vault_id}
          AND current_version_id = ${row.document_version_id}
      `);

      if (adminAiServices !== undefined && embeddingIndexQueue !== undefined) {
        const settings = await adminAiServices.getSettings();
        if (settings.aiFeaturesEnabled) {
          const activeIndex = await createEmbeddingIndexServices({ db }).getActiveEmbeddingIndex();
          if (activeIndex !== null) {
            await embeddingIndexQueue.enqueueDocumentIndexing({
              embeddingIndexId: activeIndex.id,
              documentVersionId: row.document_version_id,
            });
          }
        }
      }

      convertedCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(
        `Office preview conversion failed for ${row.document_id}/${row.document_version_id}:`,
        error instanceof Error ? error.message : error,
      );
      await db.execute(sql`
        UPDATE document_versions
        SET
          derived_preview_status = 'failed',
          derived_preview_error_code = 'document.preview_generation_failed',
          derived_preview_error_message = 'Preview generation failed.',
          derived_preview_failed_at = now(),
          updated_at = now()
        WHERE id = ${row.document_version_id}
          AND document_id = ${row.document_id}
          AND vault_id = ${row.vault_id}
      `);
      await db.execute(sql`
        UPDATE documents
        SET
          derived_preview_status = 'failed',
          derived_preview_error_code = 'document.preview_generation_failed',
          derived_preview_error_message = 'Preview generation failed.',
          derived_preview_failed_at = now(),
          updated_at = now()
        WHERE id = ${row.document_id}
          AND vault_id = ${row.vault_id}
          AND current_version_id = ${row.document_version_id}
      `);
    }
  }

  return { convertedCount, skippedCount, failedCount, reason: null };
}

export function createMaintenanceWorker({
  db,
  defaultRetentionDays,
  encryption,
  parsePipeline,
  storage,
  appInstance,
  startPolling = true,
  pauseWhen,
  documentConverter,
  resolveOfficeDocumentConversionRuntimeStatus,
  adminAiServices,
  embeddingIndexQueue,
  auditServices,
}: MaintenanceWorkerDeps) {
  async function processMaintenanceJob(job: AsyncJob<MaintenanceJobData>) {
    if (job.name === HARD_DELETE_EXPIRED_DOCUMENTS_JOB) {
      const retentionDays =
        'retentionDays' in job.data ? job.data.retentionDays ?? defaultRetentionDays : defaultRetentionDays;
      const result = await hardDeleteExpiredDocuments({
        db,
        retentionDays,
        storage,
        auditServices,
      });

      console.info(
        `Hard-deleted ${result.deletedCount} expired documents older than ${retentionDays} day(s)`,
      );

      return result;
    }

    if (job.name === GENERATE_OFFICE_PREVIEW_PDFS_JOB) {
      if (encryption === undefined || parsePipeline === undefined) {
        throw new Error('Office preview PDF maintenance requires encryption and parse pipeline services.');
      }

      const result = await generateOfficePreviewPdfs({
        db,
        storage,
        encryption,
        parsePipeline,
        documentConverter,
        resolveOfficeDocumentConversionRuntimeStatus,
        adminAiServices,
        embeddingIndexQueue,
        limit: job.data.type === 'generate-office-preview-pdfs' ? job.data.limit : undefined,
      });

      console.info(
        `Generated ${result.convertedCount} Office preview PDF(s); skipped=${result.skippedCount} failed=${result.failedCount}`,
      );

      return result;
    }

    throw new Error(`Unknown maintenance job: ${job.name}`);
  }

  const worker = createPostgresWorker<MaintenanceJobData>({
    db,
    queueName: getScopedQueueName(MAINTENANCE_QUEUE, appInstance),
    concurrency: 1,
    autorun: startPolling,
    pauseWhen,
    handler: async (job) => processMaintenanceJob(job),
  });

  worker.on('failed', (job, error) => {
    console.error(
      `Maintenance job failed for ${job?.name ?? 'unknown'} (${job?.id ?? 'unknown'}):`,
      error.message,
    );
  });

  worker.on('completed', (job) => {
    console.info(`Maintenance job completed for ${job.name} (${job.id})`);
  });

  async function close() {
    await worker.close();
  }

  return { close, processMaintenanceJob, worker };
}
