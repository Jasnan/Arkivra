import type { EmbeddingProviderRegistry } from './types.js';
import { createGeminiEmbeddingProvider } from './gemini-embedding.provider.js';
import { createOllamaEmbeddingProvider } from './ollama-embedding.provider.js';

export function createEmbeddingProviderRegistry({
  fetchImpl = fetch,
  ollamaBatchSize,
  geminiBatchSize,
}: {
  fetchImpl?: typeof fetch;
  ollamaBatchSize?: number;
  geminiBatchSize?: number;
} = {}): EmbeddingProviderRegistry {
  return {
    ollama: createOllamaEmbeddingProvider({
      fetchImpl,
      batchSize: ollamaBatchSize,
    }),
    gemini: createGeminiEmbeddingProvider({
      fetchImpl,
      batchSize: geminiBatchSize,
    }),
  };
}
