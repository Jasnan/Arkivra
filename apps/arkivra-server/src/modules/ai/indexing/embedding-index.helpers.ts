import { createHash } from 'node:crypto';
import type { EmbeddingProviderKind } from '../providers/types.js';
import type { ActiveEmbeddingIndex, ActiveEmbeddingIndexRow } from './embedding-index.types.js';

function normalizeProvider(provider: string): EmbeddingProviderKind | null {
  switch (provider) {
    case 'ollama':
    case 'openrouter':
    case 'gemini':
    case 'voyage':
    case 'custom':
      return provider;
    default:
      return null;
  }
}

export function buildVectorLiteral(vector: number[]) {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding vectors must contain at least one finite number.');
  }

  return `[${vector.join(',')}]`;
}

export function sqlIdentifier(identifier: string) {
  if (!/^[a-z_]\w*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

export function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function hnswIndexName(embeddingIndexId: string) {
  const normalized = embeddingIndexId.replace(/\W/g, '_');
  return `dce_hnsw_${normalized}`.slice(0, 63);
}

export function mapEmbeddingIndexConfig(row: ActiveEmbeddingIndexRow): ActiveEmbeddingIndex | null {
  const provider = normalizeProvider(row.provider);
  if (provider === null || row.distance_metric !== 'cosine') {
    return null;
  }

  return {
    id: row.id,
    providerConfigId: row.provider_config_id,
    provider,
    model: row.model,
    dimensions: row.dimensions,
    distanceMetric: row.distance_metric,
    name: row.name,
    baseUrl: row.base_url ?? undefined,
    apiKeySecretRef: row.api_key_secret_ref ?? undefined,
    options: row.config ?? {},
    isEnabled: row.is_enabled,
  };
}

export function hashEmbeddingContent(content: string) {
  return createHash('sha256').update(content).digest('hex');
}
