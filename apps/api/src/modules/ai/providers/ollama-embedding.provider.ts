import type { EmbeddingProvider } from './types.js';
import { createOllamaProvider } from './ollama.provider.js';

export function createOllamaEmbeddingProvider({
  fetchImpl = fetch,
  batchSize = 16,
}: {
  fetchImpl?: typeof fetch;
  batchSize?: number;
} = {}): EmbeddingProvider {
  const ollama = createOllamaProvider({ fetchImpl, embeddingBatchSize: batchSize });

  return {
    kind: 'ollama',
    async embed({ texts, config, signal }) {
      if (texts.length === 0) {
        return [];
      }

      const result = await ollama.embed({
        host: config.baseUrl,
        model: config.model,
        texts,
        dimensions: config.dimensions,
        signal,
      });

      if (config.options?.logRequests === true) {
        console.info(
          `[ollama-embedding-provider] embedded ${texts.length} texts with model=${config.model} via /api/${result.endpoint}`,
        );
      }

      return result.embeddings;
    },
  };
}
