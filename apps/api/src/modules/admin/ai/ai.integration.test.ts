import type { ServerContext } from '../../server/server.types.js';
import { Hono } from 'hono';
import { describe, expect, test, vi } from 'vitest';
import { registerAdminAiRoutes } from './ai.routes.js';
import { createAdminAiServices } from './ai.services.js';

function createMockAiServices() {
  return {
    getSettings: vi.fn(async () => ({
      enabled: true,
      ollamaHost: 'http://127.0.0.1:11434',
      model: 'gemma4:e2b',
      minTokenLength: 8,
      maxCandidates: 100,
      batchSize: 10,
    })),
    updateSettings: vi.fn(async settings => settings),
    listModels: vi.fn(async () => [
      { name: 'gemma4:e2b', size: 1000, modifiedAt: '2026-04-23T12:00:00.000Z' },
    ]),
    checkModelAvailability: vi.fn(async () => ({
      host: 'http://127.0.0.1:11434',
      model: 'gemma4:e2b',
      reachable: true,
      modelAvailable: true,
      models: [{ name: 'gemma4:e2b', size: 1000, modifiedAt: '2026-04-23T12:00:00.000Z' }],
      error: null,
    })),
  };
}

function createTestApp({
  isAuthenticated = true,
  isGlobalAdmin = true,
  aiServices = createMockAiServices(),
}: {
  isAuthenticated?: boolean;
  isGlobalAdmin?: boolean;
  aiServices?: ReturnType<typeof createMockAiServices>;
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
    context.set('isGlobalAdmin', isGlobalAdmin);
    context.set('canCreateVault', true);
    context.set('vaultId', null);
    context.set('vaultRole', null);
    context.set('vaultPermissions', []);
    await next();
  });

  registerAdminAiRoutes({
    app,
    aiServices: aiServices as any,
  });

  return { app, aiServices };
}

describe('admin ai routes integration', () => {
  test('returns current AI settings for a global admin', async () => {
    const { app } = createTestApp({});
    const response = await app.request('/api/admin/ai/settings');
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.settings.model).toBe('gemma4:e2b');
  });

  test('updates AI settings', async () => {
    const { app, aiServices } = createTestApp({});
    const response = await app.request('/api/admin/ai/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enabled: false,
        ollamaHost: 'http://192.168.1.20:11434',
        model: 'qwen2.5:7b',
        minTokenLength: 10,
        maxCandidates: 50,
        batchSize: 5,
      }),
    });

    expect(response.status).toBe(200);
    expect(aiServices.updateSettings).toHaveBeenCalledWith({
      enabled: false,
      ollamaHost: 'http://192.168.1.20:11434',
      model: 'qwen2.5:7b',
      minTokenLength: 10,
      maxCandidates: 50,
      batchSize: 5,
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

  test('marks a listed model unavailable when Ollama cannot load it', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        models: [
          { name: 'gemma4:e2b', size: 1000, modified_at: '2026-04-23T12:00:00.000Z' },
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
        parsers: { gluedWordNormalization: 'ollama' },
        ollama: {
          host: 'http://127.0.0.1:11434',
          model: 'gemma4:e2b',
          gluedWordMinTokenLength: 8,
          gluedWordMaxCandidates: 100,
          gluedWordBatchSize: 10,
          logRequests: false,
        },
      } as any,
      fetchImpl: fetchImpl as any,
    });

    const availability = await aiServices.checkModelAvailability({
      host: 'http://127.0.0.1:11434',
      model: 'gemma4:e2b',
    });

    expect(availability.reachable).toBe(true);
    expect(availability.modelAvailable).toBe(false);
    expect(availability.error).toMatch(/listed but could not be loaded/i);
  });
});
