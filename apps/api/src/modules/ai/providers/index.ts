export type {
  EmbeddingModelConfig,
  EmbeddingProvider,
  EmbeddingProviderKind,
} from './types.js';
export {
  createOllamaProvider,
  normalizeOllamaHost,
} from './ollama.provider.js';
export type {
  OllamaChatMessage,
  OllamaEmbeddingEndpointMode,
  OllamaModel,
  OllamaProvider,
} from './ollama.provider.js';
export { createOllamaEmbeddingProvider } from './ollama-embedding.provider.js';
