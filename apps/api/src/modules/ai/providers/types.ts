export type EmbeddingProviderKind =
  | 'ollama'
  | 'openrouter'
  | 'gemini'
  | 'voyage'
  | 'custom';

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
  }) => Promise<number[][]>;
  listModels?: (config: Partial<EmbeddingModelConfig>) => Promise<string[]>;
  validate?: (config: EmbeddingModelConfig) => Promise<void>;
}

export type ChatProviderKind =
  | 'ollama'
  | 'openrouter'
  | 'gemini'
  | 'custom';

export type ChatModelConfig = {
  provider: ChatProviderKind;
  model: string;
  baseUrl?: string;
  apiKeySecretRef?: string;
  supportsImages?: boolean;
  options?: Record<string, unknown>;
};

export type ChatProviderMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
};

export type ChatProviderMetrics = {
  promptEvalCount?: number | null;
  promptEvalDurationNs?: number | null;
  evalCount?: number | null;
  evalDurationNs?: number | null;
  totalDurationNs?: number | null;
  loadDurationNs?: number | null;
};

export type ChatProviderStreamChunk = {
  token?: string;
  metrics?: ChatProviderMetrics;
};

export interface ChatProvider {
  readonly kind: ChatProviderKind;
  streamChat: (input: {
    messages: ChatProviderMessage[];
    config: ChatModelConfig;
    signal?: AbortSignal;
  }) => AsyncIterable<ChatProviderStreamChunk>;
  completeJson?: <T>(input: {
    messages: ChatProviderMessage[];
    config: ChatModelConfig;
    schema: unknown;
    signal?: AbortSignal;
  }) => Promise<T>;
  listModels?: (config: Partial<ChatModelConfig>) => Promise<string[]>;
  validate?: (config: ChatModelConfig) => Promise<void>;
}
