import { describe, expect, it } from 'vitest';
import {
  buildEmbeddingModelOptions,
  isCatalogChatModel,
  isCatalogEmbeddingModel,
  isCatalogTranslationModel,
  isSameOllamaModel,
} from './admin-ai-settings-page-model-catalog';

describe('admin AI settings model catalog', () => {
  it('matches Ollama latest tags to stored untagged model names', () => {
    expect(isSameOllamaModel('bge-m3:latest', 'bge-m3')).toBe(true);
    expect(isSameOllamaModel('bge-m3:v1', 'bge-m3')).toBe(false);
  });

  it('uses catalog embedding capabilities for stored untagged Ollama models', () => {
    const options = buildEmbeddingModelOptions({
      activeIndex: null,
      baseUrl: 'http://127.0.0.1:11434',
      catalogModels: [
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
      isInCatalog: true,
      capabilities: ['embedding'],
    });
  });

  it('filters chat models to catalog entries with chat capability', () => {
    const catalog = [
      { provider: 'ollama' as const, model: 'chat:latest', capabilities: ['chat' as const] },
      {
        provider: 'ollama' as const,
        model: 'embed:latest',
        capabilities: ['embedding' as const],
        embeddingDimensions: 768,
      },
    ];

    expect(catalog.filter(isCatalogChatModel).map((model) => model.model)).toEqual([
      'chat:latest',
    ]);
  });

  it('filters translation models to catalog entries with chat and vision capabilities', () => {
    const catalog = [
      { provider: 'ollama' as const, model: 'chat:latest', capabilities: ['chat' as const] },
      {
        provider: 'ollama' as const,
        model: 'vision:latest',
        capabilities: ['chat' as const, 'vision' as const],
      },
      {
        provider: 'ollama' as const,
        model: 'embed:latest',
        capabilities: ['embedding' as const],
        embeddingDimensions: 768,
      },
    ];

    expect(catalog.filter(isCatalogTranslationModel).map((model) => model.model)).toEqual([
      'vision:latest',
    ]);
  });

  it('uses catalog embedding dimensions for embedding picker options', () => {
    const options = buildEmbeddingModelOptions({
      activeIndex: null,
      baseUrl: 'http://127.0.0.1:11434',
      catalogModels: [
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

    expect(options.filter((option) => isCatalogEmbeddingModel({
      provider: option.provider,
      model: option.model,
      capabilities: option.capabilities as Array<'chat' | 'vision' | 'embedding'>,
      embeddingDimensions: option.dimensions,
    }))).toHaveLength(1);
    expect(options[0]?.dimensions).toBe(1536);
  });
});
