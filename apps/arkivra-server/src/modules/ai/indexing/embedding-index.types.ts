import type { EmbeddingModelConfig, EmbeddingProviderKind } from '../providers/types.js';

export type ActiveEmbeddingIndex = EmbeddingModelConfig & {
  id: string;
  providerConfigId: string;
  distanceMetric: 'cosine';
  name: string;
  isEnabled: boolean;
};

export type ChunkEmbeddingWrite = {
  id?: string;
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  vaultId: string;
  content: string;
  embedding: number[];
};

export type EmbeddingIndexConfig = ActiveEmbeddingIndex & {
  status: 'building' | 'ready' | 'active' | 'failed' | 'retiring' | 'retired';
};

export type CreateEmbeddingIndexInput = {
  provider: EmbeddingProviderKind;
  model: string;
  dimensions: number;
  name?: string;
  baseUrl?: string;
  apiKeySecretRef?: string;
  options?: Record<string, unknown>;
};

export type DiscoveredIndexDocument = {
  documentId: string;
  documentVersionId: string;
  vaultId: string;
  expectedChunkCount: number;
};

export type ActiveEmbeddingIndexRow = {
  id: string;
  provider_config_id: string;
  provider: string;
  model: string;
  dimensions: number;
  distance_metric: string;
  name: string;
  base_url: string | null;
  api_key_secret_ref: string | null;
  config: Record<string, unknown> | null;
  is_enabled: boolean;
};

export type EmbeddingIndexConfigRow = ActiveEmbeddingIndexRow & {
  status: EmbeddingIndexConfig['status'];
};

export type DiscoveredIndexDocumentRow = {
  document_id: string;
  document_version_id: string;
  vault_id: string;
  expected_chunk_count: number;
};

export type DocumentIndexingWorkRow = {
  document_id: string;
  document_version_id: string;
  vault_id: string;
  expected_chunk_count: number;
};

export type DocumentStatusCountRow = {
  expected_chunk_count: number;
  failed_chunk_count: number;
};

export type EmbeddedCountRow = {
  embedded_chunk_count: number;
};

export type RetiredIndexRow = {
  id: string;
};

export type CopiedVersionEmbeddingRow = {
  embedding_index_id: string;
  copied_chunk_count: number;
};

export type VersionChunkCountRow = {
  chunk_count: number;
};
