import type { Database } from '../database/database.js';
import type { EmbeddingProvider } from '../ai/providers/types.js';
import type { ActiveEmbeddingIndex } from '../ai/indexing/index.js';
import type { DocumentSearchServices } from './search.types.js';
import { createSearchDocuments } from './search.documents.js';
import { createSearchHybrid } from './search.hybrid.js';

export function createDocumentSearchServices({
  db,
  embeddingProvider,
  resolveActiveEmbeddingIndex,
}: {
  db: Database;
  embeddingProvider?: EmbeddingProvider;
  resolveActiveEmbeddingIndex?: () => Promise<ActiveEmbeddingIndex | null>;
}): DocumentSearchServices {
  async function embedQuery(trimmedQuery: string) {
    if (embeddingProvider === undefined) {
      return null;
    }

    try {
      const config =
        resolveActiveEmbeddingIndex !== undefined ? await resolveActiveEmbeddingIndex() : null;
      if (config === null) {
        return null;
      }

      const vectors = await embeddingProvider.embed({
        texts: [trimmedQuery],
        config,
      });
      const vector = vectors[0] ?? null;

      return vector === null ? null : { vector, index: config };
    } catch {
      return null;
    }
  }

  return {
    name: 'database-pg-tsvector',
    searchDocuments: createSearchDocuments({ db, embedQuery }),
    searchHybrid: createSearchHybrid({ db, embedQuery }),
  };
}
