import { createOllamaEmbeddingProvider } from '../ai/providers/ollama-embedding.provider.js';

export type RuntimeOllamaEmbeddingSettings = {
  enabled: boolean;
  host: string;
  model: string;
  dimensions: number;
  logRequests: boolean;
};

export interface ChunkEmbedder {
  readonly name: string;
  embed: (texts: string[]) => Promise<number[][]>;
}

export function createRuntimeConfiguredOllamaEmbedder({
  resolveSettings,
  fetchImpl = fetch,
  batchSize = 16,
}: {
  resolveSettings: () => Promise<RuntimeOllamaEmbeddingSettings>;
  fetchImpl?: typeof fetch;
  batchSize?: number;
}): ChunkEmbedder {
  const provider = createOllamaEmbeddingProvider({ fetchImpl, batchSize });

  return {
    name: 'runtime-configured-ollama-embedder',
    embed: async (texts) => {
      if (texts.length === 0) {
        return [];
      }

      const settings = await resolveSettings();
      if (!settings.enabled) {
        return [];
      }

      return await provider.embed({
        texts,
        config: {
          provider: 'ollama',
          model: settings.model,
          dimensions: settings.dimensions,
          baseUrl: settings.host,
          options: {
            logRequests: settings.logRequests,
          },
        },
      });
    },
  };
}
