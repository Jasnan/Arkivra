import type { ServerContext } from '../../server/server.types.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerAdminAiRoutes } from './ai.routes.js';
import { createAdminAiServices } from './ai.services.js';

function createMockAiServices() {
  return {
    getSettings: vi.fn(async () => ({
      aiFeaturesEnabled: true,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      translation: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      embedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'bge-m3',
        dimensions: 1024,
      },
      ollamaHost: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
    })),
    getStatus: vi.fn(async () => ({
      aiFeaturesEnabled: true,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
      },
      embedding: {
        activeIndex: null,
        candidateIndexes: [],
        recentIndexes: [],
        chunkCoverage: {
          indexedChunkCount: 0,
          totalChunkCount: 0,
        },
        semanticSearchAvailable: false,
      },
    })),
    updateSettings: vi.fn(async (settings) => settings),
    listModels: vi.fn(async () => [
      {
        name: 'gemma4:e4b',
        size: 1000,
        modifiedAt: '2026-04-23T12:00:00.000Z',
        capabilities: ['completion'],
      },
    ]),
    listChatModels: vi.fn(async () => [
      {
        name: 'gemma4:e4b',
        size: 1000,
        modifiedAt: '2026-04-23T12:00:00.000Z',
        capabilities: ['completion'],
      },
    ]),
    checkModelAvailability: vi.fn(async () => ({
      host: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
      reachable: true,
      modelAvailable: true,
      models: [
        {
          name: 'gemma4:e4b',
          size: 1000,
          modifiedAt: '2026-04-23T12:00:00.000Z',
          capabilities: ['completion'],
        },
      ],
      responseTimeMs: 42,
      error: null,
    })),
  };
}

function createTestApp({
  isAuthenticated = true,
  isAdmin = true,
  aiServices = createMockAiServices(),
  auditServices,
}: {
  isAuthenticated?: boolean;
  isAdmin?: boolean;
  aiServices?: ReturnType<typeof createMockAiServices>;
  auditServices?: { emitAuditEvent: ReturnType<typeof vi.fn> };
}) {
  const app = new Hono<ServerContext>();

  app.use('*', async (context, next) => {
    context.set('userId', isAuthenticated ? 'usr_test' : null);
    context.set(
      'session',
      isAuthenticated
        ? {
            id: 'ses_test',
            createdAt: new Date(),
            updatedAt: new Date(),
            userId: 'usr_test',
            expiresAt: new Date(Date.now() + 3600_000),
            token: 'tok_test',
          }
        : null,
    );
    context.set('userDisabled', false);
    context.set('isAdmin', isAdmin);
    context.set('canCreateVault', true);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    await next();
  });

  registerAdminAiRoutes({
    app,
    aiServices: aiServices as any,
    auditServices: auditServices as any,
  });

  return { app, aiServices };
}

describe('admin ai routes integration', () => {
  test('defaults ingestion AI settings to disabled when no instance settings row exists', async () => {
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          imageCaptioningEnabled: false,
          imageCaptioningModel: '',
          logRequests: false,
        },
      } as any,
    });

    const settings = await aiServices.getIngestionSettings();

    expect(settings.embeddingEnabled).toBe(false);
    expect(settings.captioningEnabled).toBe(false);
    expect(settings.captioningModel).toBe('');
    expect(settings.embeddingModel).toBeNull();
    expect(settings.embeddingDimensions).toBeNull();
  });

  test('reports no configured AI providers when provider environment variables are unset', async () => {
    const previousGeminiKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      } as any,
      config: {
        ai: {
        },
        ollama: {
          host: 'http://127.0.0.1:11434',
          configured: false,
          imageCaptioningEnabled: false,
          imageCaptioningModel: '',
          logRequests: false,
        },
      } as any,
    });

    try {
      const settings = await aiServices.getSettings();
      const availability = await aiServices.checkModelAvailability({
        provider: 'ollama',
        host: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
      });

      expect(settings.aiFeaturesEnabled).toBe(false);
      expect(settings.ollamaHost).toBe('');
      expect(settings.chat.baseUrl).toBe('');
      expect(settings.embedding.baseUrl).toBe('');
      expect(settings.embedding.provider).toBeNull();
      expect(settings.embedding.model).toBeNull();
      expect(settings.embedding.dimensions).toBeNull();
      expect(settings.providers?.gemini?.configured).toBe(false);
      expect(availability).toMatchObject({
        host: '',
        reachable: false,
        modelAvailable: false,
        models: [],
        error: 'Ollama provider is not configured on the API server.',
      });
    } finally {
      if (previousGeminiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previousGeminiKey;
      }
    }
  });

  test('resolves Ollama connection settings from server config instead of stored admin values', async () => {
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  aiFeaturesEnabled: true,
                  chatProvider: 'ollama',
                  chatBaseUrl: 'http://stored-ollama.invalid:11434',
                  chatApiKeySecretRef: null,
                  chatModel: 'llama3.2:1b',
                  chatAllowedModels: ['ollama:llama3.2:1b'],
                  geminiApiKeySecretRef: null,
                  ollamaHost: 'http://stored-ollama.invalid:11434',
                  ollamaModel: 'llama3.2:1b',
                  ollamaTranslationModel: 'llama3.2:1b',
                  translationProvider: 'ollama',
                  translationBaseUrl: 'http://stored-ollama.invalid:11434',
                  translationApiKeySecretRef: null,
                  ollamaEmbeddingEnabled: true,
                  ollamaEmbeddingHost: 'http://stored-ollama.invalid:11434',
                  ollamaEmbeddingModel: 'bge-m3',
                  ollamaEmbeddingDimensions: 1024,
                },
              ],
            }),
          }),
        }),
      } as any,
      config: {
        ollama: {
          host: 'http://env-ollama.local:11434',
          model: 'gemma4:e4b',
          imageCaptioningEnabled: true,
          imageCaptioningModel: 'granite4.1:3b',
          logRequests: false,
        },
      } as any,
    });

    const settings = await aiServices.getSettings();
    const ingestionSettings = await aiServices.getIngestionSettings();

    expect(settings.ollamaHost).toBe('http://env-ollama.local:11434');
    expect(settings.chat.baseUrl).toBe('http://env-ollama.local:11434');
    expect(settings.translation.baseUrl).toBe('http://env-ollama.local:11434');
    expect(settings.embedding.baseUrl).toBe('http://env-ollama.local:11434');
    expect(ingestionSettings.embeddingHost).toBe('http://env-ollama.local:11434');
    expect(ingestionSettings.captioningHost).toBe('http://env-ollama.local:11434');
    expect(ingestionSettings.captioningEnabled).toBe(true);
    expect(ingestionSettings.captioningModel).toBe('granite4.1:3b');
  });

  test('returns current AI settings for an admin', async () => {
    const { app } = createTestApp({});
    const response = await app.request('/api/admin/ai/settings');
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.settings.model).toBe('gemma4:e4b');
  });

  test('returns provider-neutral AI status for an admin', async () => {
    const { app } = createTestApp({});
    const response = await app.request('/api/admin/ai/status');
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.status.chat.provider).toBe('ollama');
    expect(body.status.embedding.semanticSearchAvailable).toBe(false);
  });

  test('reports active index progress against the current document chunk corpus', async () => {
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  aiFeaturesEnabled: false,
                  ollamaHost: 'http://127.0.0.1:11434',
                  ollamaModel: 'gemma4:e4b',
                  ollamaEmbeddingHost: 'http://127.0.0.1:11434',
                  ollamaEmbeddingModel: 'bge-m3',
                  ollamaEmbeddingDimensions: 1024,
                },
              ],
            }),
          }),
        }),
        execute: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'eix_active',
                provider_config_id: 'aip_embedding',
                provider: 'ollama',
                model: 'bge-m3',
                dimensions: 1024,
                distance_metric: 'cosine',
                status: 'active',
                is_active: true,
                expected_chunk_count: 1,
                embedded_chunk_count: 1,
                failed_chunk_count: 0,
                failure_message: null,
                build_started_at: '2026-05-31T21:36:48.791Z',
                build_completed_at: '2026-05-31T21:36:51.599Z',
                activated_at: '2026-05-31T21:36:51.602Z',
                created_at: '2026-05-31T21:36:48.791Z',
                updated_at: '2026-05-31T21:36:51.602Z',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [{ embedding_index_id: 'eix_active', embedded_chunk_count: 1 }],
          }),
      } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
    });

    const status = await aiServices.getStatus();

    expect(status.aiFeaturesEnabled).toBe(false);
    expect(status.embedding.activeIndex).toMatchObject({
      id: 'eix_active',
      expectedChunkCount: 3,
      embeddedChunkCount: 1,
    });
    expect(status.embedding.chunkCoverage).toEqual({
      indexedChunkCount: 1,
      totalChunkCount: 3,
    });
  });

  test('excludes trashed document embeddings from active index progress', async () => {
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  aiFeaturesEnabled: false,
                  ollamaHost: 'http://127.0.0.1:11434',
                  ollamaModel: 'gemma4:e4b',
                  ollamaEmbeddingHost: 'http://127.0.0.1:11434',
                  ollamaEmbeddingModel: 'bge-m3',
                  ollamaEmbeddingDimensions: 1024,
                },
              ],
            }),
          }),
        }),
        execute: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ chunk_count: 2 }] })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'eix_active',
                provider_config_id: 'aip_embedding',
                provider: 'ollama',
                model: 'bge-m3',
                dimensions: 1024,
                distance_metric: 'cosine',
                status: 'active',
                is_active: true,
                expected_chunk_count: 1,
                embedded_chunk_count: 1,
                failed_chunk_count: 0,
                failure_message: null,
                build_started_at: '2026-05-31T21:36:48.791Z',
                build_completed_at: '2026-05-31T21:36:51.599Z',
                activated_at: '2026-05-31T21:36:51.602Z',
                created_at: '2026-05-31T21:36:48.791Z',
                updated_at: '2026-05-31T21:36:51.602Z',
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
    });

    const status = await aiServices.getStatus();

    expect(status.embedding.activeIndex).toMatchObject({
      id: 'eix_active',
      expectedChunkCount: 2,
      embeddedChunkCount: 0,
    });
    expect(status.embedding.chunkCoverage).toEqual({
      indexedChunkCount: 0,
      totalChunkCount: 2,
    });
  });

  test('updates AI settings', async () => {
    const { app, aiServices } = createTestApp({});
    const response = await app.request('/api/admin/ai/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        aiFeaturesEnabled: true,
        chat: {
          provider: 'ollama',
          baseUrl: 'http://192.168.1.20:11434',
          apiKeySecretRef: null,
          model: 'qwen2.5:7b',
        },
        translation: {
          provider: 'ollama',
          baseUrl: 'http://192.168.1.20:11434',
          apiKeySecretRef: null,
          model: 'qwen2.5:7b',
        },
        embedding: {
          provider: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          apiKeySecretRef: null,
          model: 'bge-m3',
          dimensions: 1024,
        },
        ollamaHost: 'http://192.168.1.20:11434',
        model: 'qwen2.5:7b',
      }),
    });

    expect(response.status).toBe(200);
    expect(aiServices.updateSettings).toHaveBeenCalledWith({
      aiFeaturesEnabled: true,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://192.168.1.20:11434',
        apiKeySecretRef: null,
        model: 'qwen2.5:7b',
      },
      translation: {
        provider: 'ollama',
        baseUrl: 'http://192.168.1.20:11434',
        apiKeySecretRef: null,
        model: 'qwen2.5:7b',
      },
      embedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'bge-m3',
        dimensions: 1024,
      },
      ollamaHost: 'http://192.168.1.20:11434',
      model: 'qwen2.5:7b',
    });
  });

  test('audits AI feature toggles and model changes', async () => {
    const aiServices = createMockAiServices();
    aiServices.getSettings = vi.fn(async () => ({
      aiFeaturesEnabled: false,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      translation: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      embedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'bge-m3',
        dimensions: 1024,
      },
      ollamaHost: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
    }));
    aiServices.updateSettings = vi.fn(async (settings) => ({
      ...settings,
      embedding: {
        ...settings.embedding,
        dimensions: 768,
      },
    }));
    const auditServices = { emitAuditEvent: vi.fn(async () => ({ id: 'aud_1' })) };
    const { app } = createTestApp({ aiServices, auditServices });

    const response = await app.request('/api/admin/ai/settings', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'vitest',
        'x-request-id': 'req_ai_audit',
      },
      body: JSON.stringify({
        aiFeaturesEnabled: true,
        chat: {
          provider: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          apiKeySecretRef: null,
          model: 'qwen3:5b',
        },
        translation: {
          provider: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          apiKeySecretRef: null,
          model: 'qwen3:5b',
        },
        embedding: {
          provider: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          apiKeySecretRef: null,
          model: 'embeddinggemma:300m',
          dimensions: 1024,
        },
        ollamaHost: 'http://127.0.0.1:11434',
        model: 'qwen3:5b',
      }),
    });

    expect(response.status).toBe(200);
    expect(auditServices.emitAuditEvent).toHaveBeenCalledTimes(4);
    expect(auditServices.emitAuditEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        eventType: 'ai.features_toggled',
        eventCategory: 'system',
        metadata: { enabled: true },
        before: { aiFeaturesEnabled: false },
        after: { aiFeaturesEnabled: true },
      }),
    );
    expect(auditServices.emitAuditEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: 'ai.chat_model_changed',
        eventCategory: 'system',
        metadata: {
          provider: 'ollama',
          model: 'qwen3:5b',
        },
        before: expect.objectContaining({ model: 'gemma4:e4b' }),
        after: expect.objectContaining({ model: 'qwen3:5b' }),
      }),
    );
    expect(auditServices.emitAuditEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        eventType: 'ai.translation_model_changed',
        eventCategory: 'system',
        metadata: {
          provider: 'ollama',
          model: 'qwen3:5b',
        },
        before: expect.objectContaining({ model: 'gemma4:e4b' }),
        after: expect.objectContaining({ model: 'qwen3:5b' }),
      }),
    );
    expect(auditServices.emitAuditEvent).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        eventType: 'ai.embedding_model_changed',
        eventCategory: 'system',
        metadata: {
          provider: 'ollama',
          model: 'embeddinggemma:300m',
          dimensions: 768,
        },
        before: expect.objectContaining({ model: 'bge-m3', dimensions: 1024 }),
        after: expect.objectContaining({ model: 'embeddinggemma:300m', dimensions: 768 }),
      }),
    );
  });

  test('does not audit AI settings updates without relevant changes', async () => {
    const aiServices = createMockAiServices();
    const auditServices = { emitAuditEvent: vi.fn(async () => ({ id: 'aud_1' })) };
    const { app } = createTestApp({ aiServices, auditServices });

    const response = await app.request('/api/admin/ai/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await aiServices.getSettings()),
    });

    expect(response.status).toBe(200);
    expect(auditServices.emitAuditEvent).not.toHaveBeenCalled();
  });

  test('updating chat settings does not enqueue embedding indexing', async () => {
    const enqueueOrchestrateIndex = vi.fn();
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }));
    const aiServices = createAdminAiServices({
      db: { insert, select } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      embeddingIndexQueue: {
        enqueueOrchestrateIndex,
      } as any,
    });

    await aiServices.updateSettings({
      aiFeaturesEnabled: false,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://192.168.1.20:11434',
        apiKeySecretRef: null,
        model: 'qwen2.5:7b',
      },
      translation: {
        provider: 'ollama',
        baseUrl: 'http://192.168.1.20:11434',
        apiKeySecretRef: null,
        model: 'qwen2.5:7b',
      },
      embedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'bge-m3',
        dimensions: 1024,
      },
      ollamaHost: 'http://192.168.1.20:11434',
      model: 'qwen2.5:7b',
    });

    expect(enqueueOrchestrateIndex).not.toHaveBeenCalled();
  });

  test('re-enabling AI appends missing chunks to the matching active index when embedding config is unchanged', async () => {
    const enqueueOrchestrateIndex = vi.fn();
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              aiFeaturesEnabled: false,
              ollamaHost: 'http://127.0.0.1:11434',
              ollamaModel: 'gemma4:e4b',
              ollamaEmbeddingHost: 'http://127.0.0.1:11434',
              ollamaEmbeddingModel: 'bge-m3',
              ollamaEmbeddingDimensions: 1024,
            },
          ],
        }),
      }),
    }));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'eix_active' }] });
    const txExecute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(
      async (callback: (tx: { execute: typeof txExecute }) => Promise<void>) =>
        callback({ execute: txExecute }),
    );
    const fetchImpl = vi.fn();
    const aiServices = createAdminAiServices({
      db: { execute, insert, select, transaction } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      embeddingIndexQueue: {
        enqueueOrchestrateIndex,
      } as any,
      fetchImpl: fetchImpl as any,
    });

    await aiServices.updateSettings({
      aiFeaturesEnabled: true,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      translation: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      embedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'bge-m3',
        dimensions: 1024,
      },
      ollamaHost: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
    });

    expect(transaction).not.toHaveBeenCalled();
    expect(enqueueOrchestrateIndex).toHaveBeenCalledWith({
      embeddingIndexId: 'eix_active',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('re-enabling AI creates a candidate index when embedding config changed', async () => {
    const enqueueOrchestrateIndex = vi.fn();
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              aiFeaturesEnabled: false,
              ollamaHost: 'http://127.0.0.1:11434',
              ollamaModel: 'gemma4:e4b',
              ollamaEmbeddingHost: 'http://127.0.0.1:11434',
              ollamaEmbeddingModel: 'bge-m3',
              ollamaEmbeddingDimensions: 1024,
            },
          ],
        }),
      }),
    }));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const txExecute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(
      async (callback: (tx: { execute: typeof txExecute }) => Promise<void>) =>
        callback({ execute: txExecute }),
    );
    const fetchImpl = vi.fn();
    const aiServices = createAdminAiServices({
      db: { execute, insert, select, transaction } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      embeddingIndexQueue: {
        enqueueOrchestrateIndex,
      } as any,
      fetchImpl: fetchImpl as any,
    });

    await aiServices.updateSettings({
      aiFeaturesEnabled: true,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      translation: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      embedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'nomic-embed-text',
        dimensions: 768,
      },
      ollamaHost: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
    });

    expect(transaction).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        ollamaEmbeddingDimensions: 768,
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(enqueueOrchestrateIndex).toHaveBeenCalledWith({
      embeddingIndexId: expect.stringMatching(/^eix_/),
    });
  });

  test('resolves missing Gemini embedding dimensions before creating an index', async () => {
    const previousKey = process.env.ARKIVRA_TEST_GEMINI_PROVIDER_KEY;
    process.env.ARKIVRA_TEST_GEMINI_PROVIDER_KEY = 'configured';
    const enqueueOrchestrateIndex = vi.fn();
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              aiFeaturesEnabled: false,
              ollamaHost: 'http://127.0.0.1:11434',
              ollamaModel: 'gemma4:e4b',
              ollamaEmbeddingHost: 'http://127.0.0.1:11434',
              ollamaEmbeddingModel: null,
              ollamaEmbeddingDimensions: null,
            },
          ],
        }),
      }),
    }));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const txExecute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(
      async (callback: (tx: { execute: typeof txExecute }) => Promise<void>) =>
        callback({ execute: txExecute }),
    );
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = input.toString();
      if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/embeddings') {
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'gemini-embedding-2-preview',
          input: ['dimension probe'],
        });
        return Response.json({
          data: [{ index: 0, embedding: Array.from({ length: 3072 }, () => 0.1) }],
        });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const aiServices = createAdminAiServices({
      db: { execute, insert, select, transaction } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      embeddingIndexQueue: {
        enqueueOrchestrateIndex,
      } as any,
      fetchImpl: fetchImpl as any,
    });

    try {
      await aiServices.updateSettings({
        aiFeaturesEnabled: true,
        chat: {
          provider: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          apiKeySecretRef: 'ARKIVRA_TEST_GEMINI_PROVIDER_KEY',
          model: 'gemini-3.5-flash',
        },
        translation: {
          provider: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          apiKeySecretRef: 'ARKIVRA_TEST_GEMINI_PROVIDER_KEY',
          model: 'gemini-3.5-flash',
        },
        embedding: {
          provider: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          apiKeySecretRef: 'ARKIVRA_TEST_GEMINI_PROVIDER_KEY',
          model: 'gemini-embedding-2-preview',
          dimensions: null,
        },
        providers: {
          gemini: {
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
            apiKeySecretRef: 'ARKIVRA_TEST_GEMINI_PROVIDER_KEY',
          },
        },
        ollamaHost: 'http://127.0.0.1:11434',
        model: 'gemini-3.5-flash',
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          embeddingProvider: 'gemini',
          embeddingModel: 'gemini-embedding-2-preview',
          embeddingDimensions: 3072,
          ollamaEmbeddingModel: null,
          ollamaEmbeddingDimensions: null,
        }),
      );
      expect(transaction).toHaveBeenCalled();
      expect(enqueueOrchestrateIndex).toHaveBeenCalledWith({
        embeddingIndexId: expect.stringMatching(/^eix_/),
      });
    } finally {
      if (previousKey === undefined) {
        delete process.env.ARKIVRA_TEST_GEMINI_PROVIDER_KEY;
      } else {
        process.env.ARKIVRA_TEST_GEMINI_PROVIDER_KEY = previousKey;
      }
    }
  });

  test('re-enabling AI preserves selected Ollama embedding dimensions before indexing', async () => {
    const enqueueOrchestrateIndex = vi.fn();
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              aiFeaturesEnabled: false,
              ollamaHost: 'http://127.0.0.1:11434',
              ollamaModel: 'gemma4:e4b',
              ollamaEmbeddingHost: 'http://127.0.0.1:11434',
              ollamaEmbeddingModel: 'embeddinggemma:latest',
              ollamaEmbeddingDimensions: 1024,
            },
          ],
        }),
      }),
    }));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const txExecute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(
      async (callback: (tx: { execute: typeof txExecute }) => Promise<void>) =>
        callback({ execute: txExecute }),
    );
    const fetchImpl = vi.fn();
    const aiServices = createAdminAiServices({
      db: { execute, insert, select, transaction } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      embeddingIndexQueue: {
        enqueueOrchestrateIndex,
      } as any,
      fetchImpl: fetchImpl as any,
    });

    const settings = await aiServices.updateSettings({
      aiFeaturesEnabled: true,
      chat: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      translation: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'gemma4:e4b',
      },
      embedding: {
        provider: 'ollama',
        baseUrl: 'http://127.0.0.1:11434',
        apiKeySecretRef: null,
        model: 'embeddinggemma:latest',
        dimensions: 1024,
      },
      ollamaHost: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
    });

    expect(settings.embedding.dimensions).toBe(1024);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        ollamaEmbeddingDimensions: 1024,
      }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalled();
    expect(enqueueOrchestrateIndex).toHaveBeenCalledWith({
      embeddingIndexId: expect.stringMatching(/^eix_/),
    });
  });

  test('lists discovered AI models for a provider host', async () => {
    const { app, aiServices } = createTestApp({});
    const response = await app.request('/api/admin/ai/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ host: 'http://127.0.0.1:11434' }),
    });

    expect(response.status).toBe(200);
    expect(aiServices.listChatModels).toHaveBeenCalledWith({
      provider: undefined,
      baseUrl: 'http://127.0.0.1:11434',
    });
  });

  test('discovers Gemini chat models through the native Models API without reading stored settings', async () => {
    const previousDefaultKey = process.env.GEMINI_API_KEY;
    const previousMissingKey = process.env.ARKIVRA_TEST_MISSING_GEMINI_KEY;
    process.env.GEMINI_API_KEY = 'configured';
    delete process.env.ARKIVRA_TEST_MISSING_GEMINI_KEY;

    const select = vi.fn(() => {
      throw new Error('stored settings should not be read');
    });
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = input.toString();

      if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/models') {
        return Response.json({ data: [{ id: 'gemini-live-test' }] });
      }

      return Response.json({
        models: [
          {
            name: 'models/gemini-live-test',
            displayName: 'Gemini Live Test',
            description: 'Multimodal image and text model',
            inputTokenLimit: 128000,
            outputTokenLimit: 8192,
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
        ],
      });
    });
    const aiServices = createAdminAiServices({
      db: { select } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    try {
      const models = await aiServices.listChatModels({ provider: 'gemini' });
      expect(models).toEqual([
        expect.objectContaining({
          name: 'gemini-live-test',
          capabilities: ['chat', 'vision'],
          contextWindow: 128000,
          maxOutputTokens: 8192,
          supportedGenerationMethods: ['countTokens', 'generateContent'],
        }),
      ]);

      const availability = await aiServices.checkModelAvailability({
        provider: 'gemini',
        host: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-live-test',
        apiKeySecretRef: 'ARKIVRA_TEST_MISSING_GEMINI_KEY',
      });

      expect(availability).toMatchObject({
        reachable: true,
        modelAvailable: true,
        error: null,
      });
      expect(select).not.toHaveBeenCalled();
    } finally {
      if (previousDefaultKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previousDefaultKey;
      }

      if (previousMissingKey === undefined) {
        delete process.env.ARKIVRA_TEST_MISSING_GEMINI_KEY;
      } else {
        process.env.ARKIVRA_TEST_MISSING_GEMINI_KEY = previousMissingKey;
      }
    }
  });

  test('discovers Gemini OpenAI-compatible embedding models with probed dimensions', async () => {
    const previousDefaultKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'configured';
    const select = vi.fn(() => {
      throw new Error('stored settings should not be read');
    });
    const fetchImpl = vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = input.toString();

      if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/models') {
        return Response.json({
          data: [
            { id: 'gemini-embedding-2-preview' },
            { id: 'gemini-3.5-flash' },
          ],
        });
      }

      if (url === 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000') {
        return Response.json({
          models: [
            {
              name: 'models/gemini-embedding-2',
              displayName: 'Gemini Embedding 2',
              supportedGenerationMethods: ['embedContent'],
            },
            {
              name: 'models/gemini-3.5-flash',
              displayName: 'Gemini 3.5 Flash',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        });
      }

      if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/embeddings') {
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'gemini-embedding-2-preview',
          input: ['dimension probe'],
        });
        return Response.json({
          data: [{ index: 0, embedding: Array.from({ length: 3072 }, () => 0.1) }],
        });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const aiServices = createAdminAiServices({
      db: { select } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    try {
      const models = await aiServices.listChatModels({
        provider: 'gemini',
        includeEmbeddingModels: true,
      });

      expect(models).toEqual([
        expect.objectContaining({
          name: 'gemini-3.5-flash',
          capabilities: ['chat'],
        }),
        expect.objectContaining({
          name: 'gemini-embedding-2-preview',
          capabilities: ['embedding'],
          embeddingDimensions: 3072,
        }),
      ]);
      expect(select).not.toHaveBeenCalled();
    } finally {
      if (previousDefaultKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previousDefaultKey;
      }
    }
  });

  test('filters Ollama chat models by discovered Ollama capabilities', async () => {
    const fetchImpl = vi.fn();
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'plain-text-model:latest',
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    fetchImpl.mockImplementation(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = input.toString();

        if (url === 'http://127.0.0.1:11434/api/tags') {
          return Response.json({
            models: [
              { name: 'plain-text-model:latest', size: 1000 },
              { name: 'vector-only-local:latest', size: 2000 },
              { name: 'vision-model:latest', size: 3000 },
            ],
          });
        }

        if (url === 'http://127.0.0.1:11434/api/show') {
          const body = JSON.parse(init?.body?.toString() ?? '{}') as { model?: string };
          if (body.model === 'vector-only-local:latest') {
            return Response.json({
              capabilities: ['embedding'],
              model_info: { 'bert.embedding_length': 768 },
            });
          }
          if (body.model === 'vision-model:latest') {
            return Response.json({
              capabilities: ['completion', 'vision'],
              model_info: {},
            });
          }
          return Response.json({
            capabilities: ['completion'],
            model_info: {},
          });
        }

        throw new Error(`Unexpected Ollama request ${url}`);
      },
    );

    const models = await aiServices.listChatModels({ provider: 'ollama' });

    expect(models.map((model) => model.name)).toContain('plain-text-model:latest');
    expect(models.map((model) => model.name)).toContain('vision-model:latest');
    expect(models.map((model) => model.name)).not.toContain('vector-only-local:latest');
    expect(models.find((model) => model.name === 'vision-model:latest')?.capabilities).toEqual([
      'chat',
      'vision',
    ]);
  });

  test('checks Gemini availability with the stored provider secret ref', async () => {
    const previousKey = process.env.ARKIVRA_TEST_GEMINI_PROVIDER_KEY;
    process.env.ARKIVRA_TEST_GEMINI_PROVIDER_KEY = 'configured';
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = input.toString();

      if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/models') {
        return Response.json({ data: [{ id: 'gemini-3.5-flash' }] });
      }

      return Response.json({
        models: [
          {
            name: 'models/gemini-3.5-flash',
            displayName: 'Gemini 3.5 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      });
    });
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  aiFeaturesEnabled: true,
                  chatProvider: 'gemini',
                  chatBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                  chatApiKeySecretRef: 'ARKIVRA_TEST_MISSING_GEMINI_KEY',
                  chatModel: 'gemini-3.5-flash',
                  chatAllowedModels: ['gemini-3.5-flash'],
                  geminiApiKeySecretRef: 'ARKIVRA_TEST_GEMINI_PROVIDER_KEY',
                  ollamaHost: 'http://127.0.0.1:11434',
                  ollamaModel: 'gemma4:e4b',
                  ollamaTranslationModel: 'gemma4:e4b',
                  ollamaEmbeddingHost: 'http://127.0.0.1:11434',
                  ollamaEmbeddingModel: 'bge-m3',
                  ollamaEmbeddingDimensions: 1024,
                },
              ],
            }),
          }),
        }),
      } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    try {
      const availability = await aiServices.checkModelAvailability();

      expect(availability).toMatchObject({
        reachable: true,
        modelAvailable: true,
        error: null,
      });
    } finally {
      if (previousKey === undefined) {
        delete process.env.ARKIVRA_TEST_GEMINI_PROVIDER_KEY;
      } else {
        process.env.ARKIVRA_TEST_GEMINI_PROVIDER_KEY = previousKey;
      }
    }
  });

  test('ignores raw-looking Gemini keys stored as secret refs and falls back to GEMINI_API_KEY', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'configured';
    const rawLookingKey = `AIza${'x'.repeat(32)}`;
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = input.toString();

      if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/models') {
        return Response.json({ data: [{ id: 'gemini-3.5-flash' }] });
      }

      return Response.json({
        models: [
          {
            name: 'models/gemini-3.5-flash',
            displayName: 'Gemini 3.5 Flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      });
    });
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  aiFeaturesEnabled: true,
                  chatProvider: 'gemini',
                  chatBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                  chatApiKeySecretRef: rawLookingKey,
                  chatModel: 'gemini-3.5-flash',
                  chatAllowedModels: ['gemini-3.5-flash'],
                  geminiApiKeySecretRef: rawLookingKey,
                  ollamaHost: 'http://127.0.0.1:11434',
                  ollamaModel: 'gemma4:e4b',
                  ollamaTranslationModel: 'gemma4:e4b',
                  ollamaEmbeddingHost: 'http://127.0.0.1:11434',
                  ollamaEmbeddingModel: 'bge-m3',
                  ollamaEmbeddingDimensions: 1024,
                },
              ],
            }),
          }),
        }),
      } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    try {
      const settings = await aiServices.getSettings();
      const availability = await aiServices.checkModelAvailability();

      expect(settings.chat.apiKeySecretRef).toBeNull();
      expect(settings.providers?.gemini?.apiKeySecretRef).toBeNull();
      expect(availability).toMatchObject({
        reachable: true,
        modelAvailable: true,
        error: null,
      });
    } finally {
      if (previousKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previousKey;
      }
    }
  });

  test('returns availability details without failing the request when Ollama is unreachable', async () => {
    const aiServices = createMockAiServices() as any;
    aiServices.checkModelAvailability = vi.fn(async () => ({
      host: 'http://127.0.0.1:11434',
      model: 'missing-model',
      reachable: false,
      modelAvailable: false,
      models: [],
      responseTimeMs: null,
      error: 'Connection refused',
    }));

    const { app } = createTestApp({ aiServices });
    const response = await app.request('/api/admin/ai/availability', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ host: 'http://127.0.0.1:11434', model: 'missing-model' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.availability.reachable).toBe(false);
    expect(body.availability.modelAvailable).toBe(false);
  });

  test('maps AI availability probe failures to structured 502 responses', async () => {
    const aiServices = createMockAiServices() as any;
    aiServices.checkModelAvailability = vi.fn(async () => {
      throw new Error('unexpected provider probe failure');
    });

    const { app } = createTestApp({ aiServices });
    const response = await app.request('/api/admin/ai/availability', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'ollama',
        host: 'http://127.0.0.1:11434',
        model: 'glm-ocr:q8_0',
      }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'admin.ai_availability_check_failed',
        message: 'unexpected provider probe failure',
      },
    });
  });

  test('checks explicit Ollama availability without reading stored AI settings', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [{ name: 'llama3.2:1b', size: 1000, modified_at: '2026-04-23T12:00:00.000Z' }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            capabilities: ['completion'],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: 'ok',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    const select = vi.fn(() => {
      throw new Error('stored settings should not be read');
    });
    const aiServices = createAdminAiServices({
      db: { select } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    const availability = await aiServices.checkModelAvailability({
      host: 'http://127.0.0.1:11434',
      model: 'llama3.2:1b',
    });

    expect(select).not.toHaveBeenCalled();
    expect(availability.reachable).toBe(true);
    expect(availability.modelAvailable).toBe(true);
  });

  test('keeps Ollama reachable and returns available alternatives when the configured model is missing', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { name: 'granite4.1:3b', size: 1000, modified_at: '2026-04-23T12:00:00.000Z' },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            capabilities: ['completion', 'vision'],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
    const select = vi.fn(() => {
      throw new Error('stored settings should not be read');
    });
    const aiServices = createAdminAiServices({
      db: { select } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    const availability = await aiServices.checkModelAvailability({
      host: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
    });

    expect(select).not.toHaveBeenCalled();
    expect(availability.reachable).toBe(true);
    expect(availability.modelAvailable).toBe(false);
    expect(availability.error).toContain('Available chat-capable models: granite4.1:3b');
    expect(availability.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'granite4.1:3b',
          available: true,
          source: 'live',
          capabilities: ['chat', 'vision'],
        }),
      ]),
    );
  });

  test('marks a listed model unavailable when Ollama cannot load it', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [{ name: 'gemma4:e4b', size: 1000, modified_at: '2026-04-23T12:00:00.000Z' }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            capabilities: ['completion'],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'unable to load model: corrupted blob',
          }),
          {
            status: 500,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [],
            }),
          }),
        }),
      } as any,
      config: {
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e4b',
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    const availability = await aiServices.checkModelAvailability({
      host: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
    });

    expect(availability.reachable).toBe(true);
    expect(availability.modelAvailable).toBe(false);
    expect(availability.error).toMatch(/listed but could not be loaded/i);
  });
});
