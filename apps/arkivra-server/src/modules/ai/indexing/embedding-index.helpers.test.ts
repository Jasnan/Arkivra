import { describe, expect, it } from 'vitest';
import { mapEmbeddingIndexConfig } from './embedding-index.helpers.js';
import { createEmbeddingProviderRegistry } from '../providers/embedding-provider-registry.js';

describe('remote embedding index configuration', () => {
  it('resolves persisted Privatemode indexes for indexing and query retrieval', () => {
    expect(
      mapEmbeddingIndexConfig({
        id: 'eix_remote',
        provider_config_id: 'aip_remote',
        provider: 'privatemode',
        model: 'qwen3-embedding-4b',
        dimensions: 1024,
        distance_metric: 'cosine',
        name: 'remote',
        base_url: 'http://trusted-proxy/v1',
        api_key_secret_ref: 'PRIVATEMODE_API_KEY',
        config: {},
        is_enabled: true,
      }),
    ).toMatchObject({ provider: 'privatemode', dimensions: 1024, model: 'qwen3-embedding-4b' });
  });
  it('registers only the remote provider in remote ingestion mode', () => {
    const providers = createEmbeddingProviderRegistry({ remoteOnly: true });
    expect(Object.keys(providers)).toEqual(['privatemode']);
    expect(providers.ollama).toBeUndefined();
    expect(providers.gemini).toBeUndefined();
  });
});
