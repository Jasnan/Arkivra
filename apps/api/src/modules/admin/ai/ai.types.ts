export type AdminAiProviderKind = 'ollama';

export type AdminAiProviderSettings = {
  provider: AdminAiProviderKind;
  baseUrl: string;
  apiKeySecretRef: string | null;
  model: string;
  dimensions?: number;
};

export type AdminAiSettings = {
  aiFeaturesEnabled: boolean;
  chat: AdminAiProviderSettings;
  translation: AdminAiProviderSettings;
  embedding: AdminAiProviderSettings & {
    dimensions: number;
  };
  // Legacy fields retained for runtime callers during the provider split.
  ollamaHost: string;
  model: string;
};

export type AdminAiChatSettings = {
  provider: 'ollama' | 'openrouter' | 'gemini' | 'custom';
  baseUrl: string | null;
  model: string;
};

export type AdminAiModel = {
  name: string;
  size: number | null;
  modifiedAt: string | null;
};

export type AdminAiModelAvailability = {
  host: string;
  model: string;
  reachable: boolean;
  modelAvailable: boolean;
  models: AdminAiModel[];
  responseTimeMs: number | null;
  error: string | null;
};

export type AdminStartEmbeddingIndexInput = {
  provider: 'ollama' | 'openrouter' | 'gemini' | 'voyage' | 'custom';
  model: string;
  dimensions: number;
  name?: string;
  baseUrl?: string;
  apiKeySecretRef?: string;
  options?: Record<string, unknown>;
};

export type AdminEmbeddingIndexActionResult = {
  embeddingIndexId: string;
  enqueued: boolean;
};

export type AdminEmbeddingIndexSummary = {
  id: string;
  providerConfigId: string;
  provider: 'ollama' | 'openrouter' | 'gemini' | 'voyage' | 'custom';
  model: string;
  dimensions: number;
  distanceMetric: string;
  status: 'building' | 'ready' | 'active' | 'failed' | 'retiring' | 'retired';
  isActive: boolean;
  expectedChunkCount: number;
  embeddedChunkCount: number;
  failedChunkCount: number;
  failureMessage: string | null;
  buildStartedAt: string | null;
  buildCompletedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  documentStatuses: {
    pending: number;
    indexing: number;
    ready: number;
    failed: number;
    stale: number;
    skipped: number;
  };
};

export type AdminAiStatus = {
  aiFeaturesEnabled: boolean;
  chat: AdminAiChatSettings;
  embedding: {
    activeIndex: AdminEmbeddingIndexSummary | null;
    candidateIndexes: AdminEmbeddingIndexSummary[];
    recentIndexes: AdminEmbeddingIndexSummary[];
    chunkCoverage: {
      indexedChunkCount: number;
      totalChunkCount: number;
    };
    semanticSearchAvailable: boolean;
  };
};
