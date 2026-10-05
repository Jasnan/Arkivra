export type EmbeddingProviderKind =
  | 'ollama'
  | 'openrouter'
  | 'gemini'
  | 'voyage'
  | 'privatemode'
  | 'custom';

export type EmbeddingProviderRegistry = Partial<Record<EmbeddingProviderKind, EmbeddingProvider>>;

export type EmbeddingModelConfig = {
  provider: EmbeddingProviderKind;
  model: string;
  dimensions: number;
  baseUrl?: string;
  apiKeySecretRef?: string;
  options?: Record<string, unknown>;
};

export interface EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  embed: (input: {
    texts: string[];
    config: EmbeddingModelConfig;
    signal?: AbortSignal;
    purpose?: 'document' | 'query';
  }) => Promise<number[][]>;
  listModels?: (config: Partial<EmbeddingModelConfig>) => Promise<string[]>;
  validate?: (config: EmbeddingModelConfig) => Promise<void>;
}
