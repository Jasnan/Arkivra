import type { AdminAiServices } from '../admin/ai/ai.services.js';
import type { EmbeddingIndexQueue } from '../ai/indexing/index.js';
import { createEmbeddingIndexServices } from '../ai/indexing/index.js';
import type { Database } from '../database/database.js';
import type { DocumentsServices } from './documents.services.js';

export async function enqueueSemanticReindexForRestoredDocument({
  db,
  adminAiServices,
  embeddingIndexQueue,
  documentsServices,
  documentId,
  vaultId,
}: {
  db: Database;
  adminAiServices?: AdminAiServices;
  embeddingIndexQueue?: EmbeddingIndexQueue;
  documentsServices: DocumentsServices;
  documentId: string;
  vaultId: string;
}) {
  if (adminAiServices === undefined || embeddingIndexQueue === undefined) {
    return;
  }

  try {
    const settings = await adminAiServices.getSettings();
    if (!settings.aiFeaturesEnabled) {
      return;
    }

    const activeIndex = await createEmbeddingIndexServices({
      db,
    }).getActiveEmbeddingIndex();
    if (activeIndex === null) {
      return;
    }

    const version = await documentsServices.resolveLatestDocumentVersion({
      documentId,
      vaultId,
    });

    if (version === null) {
      throw new Error(`No current version found for restored document ${documentId}`);
    }

    await embeddingIndexQueue.enqueueDocumentIndexing({
      embeddingIndexId: activeIndex.id,
      documentVersionId: version.id,
    });
  } catch (error) {
    console.error(
      `Could not enqueue semantic reindex after restoring document ${documentId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
