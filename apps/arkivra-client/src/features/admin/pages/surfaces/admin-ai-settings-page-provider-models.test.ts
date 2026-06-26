import { describe, expect, it } from 'vitest';
import {
  buildEmbeddingModelOptions,
  isSameOllamaModel,
} from './admin-ai-settings-page-provider-models';

describe('admin AI settings provider models', () => {
  it('matches Ollama latest tags to stored untagged model names', () => {
    expect(isSameOllamaModel('bge-m3:latest', 'bge-m3')).toBe(true);
    expect(isSameOllamaModel('bge-m3:v1', 'bge-m3')).toBe(false);
  });

  it('uses discovered embedding capabilities for stored untagged Ollama models', () => {
    const options = buildEmbeddingModelOptions({
      activeIndex: null,
      baseUrl: 'http://127.0.0.1:11434',
      providerModels: [
        {
          provider: 'ollama',
          model: 'bge-m3:latest',
          capabilities: ['embedding'],
          embeddingDimensions: 1024,
        },
      ],
      model: 'bge-m3',
      provider: 'ollama',
      savedEmbedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'bge-m3',
        dimensions: 1024,
      },
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      model: 'bge-m3',
      isConfigured: true,
      isDiscovered: true,
      capabilities: ['embedding'],
    });
  });

  it('uses discovered embedding dimensions for embedding picker options', () => {
    const options = buildEmbeddingModelOptions({
      activeIndex: null,
      baseUrl: 'http://127.0.0.1:11434',
      providerModels: [
        {
          provider: 'ollama',
          model: 'embed:latest',
          capabilities: ['embedding'],
          embeddingDimensions: 1536,
        },
      ],
      model: 'embed:latest',
      provider: 'ollama',
      savedEmbedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'embed:latest',
        dimensions: 768,
      },
    });

    expect(options.filter((option) => option.isDiscovered)).toHaveLength(1);
    expect(options[0]?.dimensions).toBe(1536);
  });
});
