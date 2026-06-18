import { describe, expect, it } from 'vitest';
import {
  buildEmbeddingModelOptions,
  isSameOllamaModel,
} from './admin-ai-settings-page-model-catalog';

describe('admin AI settings model catalog', () => {
  it('matches Ollama latest tags to stored untagged model names', () => {
    expect(isSameOllamaModel('bge-m3:latest', 'bge-m3')).toBe(true);
    expect(isSameOllamaModel('bge-m3:v1', 'bge-m3')).toBe(false);
  });

  it('uses provider-reported embedding capabilities for stored untagged Ollama models', () => {
    const options = buildEmbeddingModelOptions({
      activeIndex: null,
      baseUrl: 'http://127.0.0.1:11434',
      dimensions: 1024,
      discoveredModels: [
        {
          name: 'bge-m3:latest',
          size: 512,
          modifiedAt: '2026-04-14T19:45:00.000Z',
          capabilities: ['embedding'],
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
});
