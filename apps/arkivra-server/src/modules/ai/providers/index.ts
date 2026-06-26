export type {
  EmbeddingModelConfig,
  EmbeddingProvider,
  EmbeddingProviderKind,
  EmbeddingProviderRegistry,
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
export { createGeminiEmbeddingProvider } from './gemini-embedding.provider.js';
export { createEmbeddingProviderRegistry } from './embedding-provider-registry.js';
export {
  GEMINI_OPENAI_COMPATIBLE_BASE_URL,
  GEMINI_NATIVE_MODELS_BASE_URL,
  createGeminiProvider,
  normalizeGeminiModel,
} from './gemini.provider.js';
export type {
  GeminiModel,
  GeminiProvider,
} from './gemini.provider.js';
