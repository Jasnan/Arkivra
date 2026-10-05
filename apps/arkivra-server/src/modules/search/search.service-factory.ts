import type { Database } from '../database/database.js';
import type {
  EmbeddingProvider,
  EmbeddingProviderRegistry,
} from '../ai/providers/types.js';
import type { ActiveEmbeddingIndex } from '../ai/indexing/index.js';
import type { DocumentSearchServices } from './search.types.js';
import { createSearchDocuments } from './search.documents.js';
import { createSearchHybrid } from './search.hybrid.js';

export function createDocumentSearchServices({
  db,
  embeddingProvider,
  embeddingProviders,
  resolveActiveEmbeddingIndex,
}: {
  db: Database;
  embeddingProvider?: EmbeddingProvider;
  embeddingProviders?: EmbeddingProviderRegistry;
  resolveActiveEmbeddingIndex?: () => Promise<ActiveEmbeddingIndex | null>;
}): DocumentSearchServices {
  async function embedQuery(trimmedQuery: string) {
    try {
      const config =
        resolveActiveEmbeddingIndex !== undefined ? await resolveActiveEmbeddingIndex() : null;
      if (config === null) {
        return null;
      }
      const provider = embeddingProviders?.[config.provider] ?? embeddingProvider;
      if (provider === undefined) {
        return null;
      }

      const vectors = await provider.embed({
        texts: [trimmedQuery],
        purpose: 'query',
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
