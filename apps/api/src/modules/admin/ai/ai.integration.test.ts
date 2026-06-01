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
    updateSettings: vi.fn(async settings => settings),
    listModels: vi.fn(async () => [
      { name: 'gemma4:e4b', size: 1000, modifiedAt: '2026-04-23T12:00:00.000Z' },
    ]),
    checkModelAvailability: vi.fn(async () => ({
      host: 'http://127.0.0.1:11434',
      model: 'gemma4:e4b',
      reachable: true,
      modelAvailable: true,
      models: [{ name: 'gemma4:e4b', size: 1000, modifiedAt: '2026-04-23T12:00:00.000Z' }],
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

function createEmbeddingProbeFetch(dimensions: number) {
  return vi.fn(async () =>
    new Response(JSON.stringify({
      embeddings: [Array.from({ length: dimensions }, () => 0.1)],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
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
          logRequests: false,
        },
      } as any,
    });

    const settings = await aiServices.getIngestionSettings();

    expect(settings.summarisationEnabled).toBe(false);
    expect(settings.embeddingEnabled).toBe(false);
    expect(settings.captioningEnabled).toBe(false);
    expect(settings.embeddingModel).toBe('bge-m3');
    expect(settings.embeddingDimensions).toBe(1024);
  });

  test('returns current AI settings for an admin', async () => {
    const { app } = createTestApp({});
    const response = await app.request('/api/admin/ai/settings');
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.settings.model).toBe('gemma4:e4b');
  });

  test('returns provider-neutral AI status for an admin', async () => {
    const { app } = createTestApp({});
    const response = await app.request('/api/admin/ai/status');
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.status.chat.provider).toBe('ollama');
    expect(body.status.embedding.semanticSearchAvailable).toBe(false);
  });

  test('reports active index progress against the current document chunk corpus', async () => {
    const aiServices = createAdminAiServices({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                aiFeaturesEnabled: false,
                ollamaHost: 'http://127.0.0.1:11434',
                ollamaModel: 'gemma4:e4b',
                ollamaEmbeddingHost: 'http://127.0.0.1:11434',
                ollamaEmbeddingModel: 'bge-m3',
                ollamaEmbeddingDimensions: 1024,
              }],
            }),
          }),
        }),
        execute: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
          .mockResolvedValueOnce({
            rows: [{
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
            }],
          })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ embedding_index_id: 'eix_active', embedded_chunk_count: 1 }] }),
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
              limit: async () => [{
                aiFeaturesEnabled: false,
                ollamaHost: 'http://127.0.0.1:11434',
                ollamaModel: 'gemma4:e4b',
                ollamaEmbeddingHost: 'http://127.0.0.1:11434',
                ollamaEmbeddingModel: 'bge-m3',
                ollamaEmbeddingDimensions: 1024,
              }],
            }),
          }),
        }),
        execute: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ chunk_count: 2 }] })
          .mockResolvedValueOnce({
            rows: [{
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
            }],
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
    aiServices.updateSettings = vi.fn(async settings => ({
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
    expect(auditServices.emitAuditEvent).toHaveBeenCalledTimes(3);
    expect(auditServices.emitAuditEvent).toHaveBeenNthCalledWith(1, expect.objectContaining({
      eventType: 'ai.features_toggled',
      eventCategory: 'system',
      metadata: { enabled: true },
      before: { aiFeaturesEnabled: false },
      after: { aiFeaturesEnabled: true },
    }));
    expect(auditServices.emitAuditEvent).toHaveBeenNthCalledWith(2, expect.objectContaining({
      eventType: 'ai.chat_model_changed',
      eventCategory: 'system',
      metadata: {
        provider: 'ollama',
        model: 'qwen3:5b',
      },
      before: expect.objectContaining({ model: 'gemma4:e4b' }),
      after: expect.objectContaining({ model: 'qwen3:5b' }),
    }));
    expect(auditServices.emitAuditEvent).toHaveBeenNthCalledWith(3, expect.objectContaining({
      eventType: 'ai.embedding_model_changed',
      eventCategory: 'system',
      metadata: {
        provider: 'ollama',
        model: 'embeddinggemma:300m',
        dimensions: 768,
      },
      before: expect.objectContaining({ model: 'bge-m3', dimensions: 1024 }),
      after: expect.objectContaining({ model: 'embeddinggemma:300m', dimensions: 768 }),
    }));
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
          limit: async () => [{
            aiFeaturesEnabled: false,
            ollamaHost: 'http://127.0.0.1:11434',
            ollamaModel: 'gemma4:e4b',
            ollamaEmbeddingHost: 'http://127.0.0.1:11434',
            ollamaEmbeddingModel: 'bge-m3',
            ollamaEmbeddingDimensions: 1024,
          }],
        }),
      }),
    }));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'eix_active' }] });
    const txExecute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(async (callback: (tx: { execute: typeof txExecute }) => Promise<void>) =>
      callback({ execute: txExecute }),
    );
    const fetchImpl = createEmbeddingProbeFetch(1024);
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
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:11434/api/embed', expect.objectContaining({
      method: 'POST',
    }));
  });

  test('re-enabling AI creates a candidate index when embedding config changed', async () => {
    const enqueueOrchestrateIndex = vi.fn();
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{
            aiFeaturesEnabled: false,
            ollamaHost: 'http://127.0.0.1:11434',
            ollamaModel: 'gemma4:e4b',
            ollamaEmbeddingHost: 'http://127.0.0.1:11434',
            ollamaEmbeddingModel: 'bge-m3',
            ollamaEmbeddingDimensions: 1024,
          }],
        }),
      }),
    }));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const txExecute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(async (callback: (tx: { execute: typeof txExecute }) => Promise<void>) =>
      callback({ execute: txExecute }),
    );
    const fetchImpl = createEmbeddingProbeFetch(768);
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
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      ollamaEmbeddingDimensions: 768,
    }));
    expect(enqueueOrchestrateIndex).toHaveBeenCalledWith({
      embeddingIndexId: expect.stringMatching(/^eix_/),
    });
  });

  test('re-enabling AI corrects stale stored embedding dimensions before indexing', async () => {
    const enqueueOrchestrateIndex = vi.fn();
    const onConflictDoUpdate = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{
            aiFeaturesEnabled: false,
            ollamaHost: 'http://127.0.0.1:11434',
            ollamaModel: 'gemma4:e4b',
            ollamaEmbeddingHost: 'http://127.0.0.1:11434',
            ollamaEmbeddingModel: 'embeddinggemma:latest',
            ollamaEmbeddingDimensions: 1024,
          }],
        }),
      }),
    }));
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ chunk_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const txExecute = vi.fn(async () => ({ rows: [] }));
    const transaction = vi.fn(async (callback: (tx: { execute: typeof txExecute }) => Promise<void>) =>
      callback({ execute: txExecute }),
    );
    const fetchImpl = createEmbeddingProbeFetch(768);
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

    expect(settings.embedding.dimensions).toBe(768);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      ollamaEmbeddingDimensions: 768,
    }));
    expect(transaction).toHaveBeenCalled();
    expect(enqueueOrchestrateIndex).toHaveBeenCalledWith({
      embeddingIndexId: expect.stringMatching(/^eix_/),
    });
  });

  test('lists available Ollama models', async () => {
    const { app, aiServices } = createTestApp({});
    const response = await app.request('/api/admin/ai/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ host: 'http://127.0.0.1:11434' }),
    });

    expect(response.status).toBe(200);
    expect(aiServices.listModels).toHaveBeenCalledWith({ host: 'http://127.0.0.1:11434' });
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
    const body = await response.json() as any;
    expect(body.availability.reachable).toBe(false);
    expect(body.availability.modelAvailable).toBe(false);
  });

  test('checks explicit Ollama availability without reading stored AI settings', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: [
          { name: 'llama3.2:1b', size: 1000, modified_at: '2026-04-23T12:00:00.000Z' },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        response: 'ok',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
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

  test('marks a listed model unavailable when Ollama cannot load it', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: [
          { name: 'gemma4:e4b', size: 1000, modified_at: '2026-04-23T12:00:00.000Z' },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'unable to load model: corrupted blob',
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }));

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
