import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { generateText, streamText } from 'ai';
import {
  createPrivatemodeEmbeddingProvider,
  listPrivatemodeModels,
  privatemodeProxyBaseUrl,
} from './privatemode.provider.js';
import { createChatModel } from '../../chat/chat-ai-sdk.js';
import { createRuntimeConfiguredOllamaTranslationProvider } from '../../translations/translations.services.js';
import { createAdminAiServices } from '../../admin/ai/ai.services.js';
import { normalizeSettings, parseChatModelSelection } from '../../admin/ai/ai.settings.js';

const vector = Array.from<number>({ length: 1024 }).fill(0.1);
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function completion(text: string) {
  return json({
    id: 'completion-1',
    created: 1,
    model: 'glm-flash-latest',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
}

beforeEach(() => {
  vi.stubEnv('ARKIVRA_PRIVATEMODE_PROXY_URL', 'http://127.0.0.1:8080');
  vi.stubEnv('PRIVATEMODE_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('privatemode provider through the encryption proxy', () => {
  test('requires a proxy and rejects the remote API or credentials in URLs', () => {
    for (const url of [
      '',
      'https://api.privatemode.ai/v1',
      'http://user:secret@proxy:8080',
      'file:///tmp/proxy',
    ]) {
      vi.stubEnv('ARKIVRA_PRIVATEMODE_PROXY_URL', url);
      expect(() => privatemodeProxyBaseUrl()).toThrow();
    }
  });

  test('discovers capabilities from live tasks, excluding OCR from answer models', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({
        data: [
          { id: 'glm-flash-latest', tasks: ['generate', 'vision', 'tool_calling'] },
          { id: 'qwen3-embedding-4b', tasks: ['embed'] },
          { id: 'deepseek-ocr-2', tasks: ['generate', 'vision'] },
        ],
      }),
    );
    const models = await listPrivatemodeModels(fetchMock);
    expect(models.map((model) => model.capabilities)).toEqual([
      ['chat', 'vision'],
      ['embedding'],
      ['vision'],
    ]);
    expect(models[1]?.embeddingDimensions).toBe(1024);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/v1/models',
      expect.objectContaining({
        redirect: 'error',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
  });

  test('batches document embeddings and restores response ordering', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return json({
        data: body.input
          .map((_: string, index: number) => ({
            index,
            embedding: vector.map((value) => value + index),
          }))
          .reverse(),
      });
    });
    const provider = createPrivatemodeEmbeddingProvider({ fetchImpl: fetchMock, batchSize: 2 });
    const result = await provider.embed({
      texts: ['first', 'second', 'third'],
      config: {
        provider: 'privatemode',
        model: 'qwen3-embedding-4b',
        dimensions: 1024,
        baseUrl: 'https://untrusted.test',
      },
    });
    expect(result.map((item) => item[0])).toEqual([0.1, 1.1, 0.1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.input).toEqual(['first', 'second']);
    expect(body.dimensions).toBe(1024);
    expect(
      fetchMock.mock.calls.every(([url]) => url === 'http://127.0.0.1:8080/v1/embeddings'),
    ).toBe(true);
  });

  test('adds retrieval instructions only to query embeddings', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ data: [{ index: 0, embedding: vector }] }),
    );
    await createPrivatemodeEmbeddingProvider({ fetchImpl: fetchMock }).embed({
      texts: ['notice period'],
      purpose: 'query',
      config: { provider: 'privatemode', model: 'qwen3-embedding-4b', dimensions: 1024 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.input[0]).toContain('Query: notice period');
    expect(body.input[0]).toMatch(/^Instruct:/);
  });

  test.each([
    { data: [{ index: 0, embedding: [1] }] },
    { data: [{ index: 1, embedding: vector }] },
    { data: [] },
  ])('rejects malformed vector responses', async ({ data }) => {
    const provider = createPrivatemodeEmbeddingProvider({ fetchImpl: async () => json({ data }) });
    await expect(
      provider.embed({
        texts: ['document'],
        config: { provider: 'privatemode', model: 'qwen3-embedding-4b', dimensions: 1024 },
      }),
    ).rejects.toThrow();
  });

  test('fails without credentials, rejects unsupported dimensions, and redacts provider errors', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ error: { message: 'secret document text' } }, 429),
    );
    const provider = createPrivatemodeEmbeddingProvider({ fetchImpl: fetchMock });
    const config = {
      provider: 'privatemode' as const,
      model: 'qwen3-embedding-4b',
      dimensions: 1024,
    };
    await expect(
      provider.embed({ texts: ['document'], config: { ...config, dimensions: 2560 } }),
    ).rejects.toThrow('1024');
    vi.stubEnv('PRIVATEMODE_API_KEY', '');
    await expect(provider.embed({ texts: ['document'], config })).rejects.toThrow('API key');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('PRIVATEMODE_API_KEY', 'test-key');
    await expect(provider.embed({ texts: ['document'], config })).rejects.toThrow('HTTP 429');
  });

  test('retains Privatemode selections and uses operator-configured transport and secret references', () => {
    const settings = normalizeSettings({
      aiFeaturesEnabled: true,
      chat: {
        provider: 'privatemode',
        baseUrl: 'https://untrusted.test',
        apiKeySecretRef: 'GEMINI_API_KEY',
        model: 'privatemode:glm-latest',
        allowedModels: ['gemini:gemini-test', 'privatemode:glm-latest'],
      },
      translation: {
        provider: 'privatemode',
        baseUrl: 'https://untrusted.test',
        apiKeySecretRef: null,
        model: 'glm-flash-latest',
      },
      embedding: {
        provider: 'privatemode',
        baseUrl: 'https://untrusted.test',
        apiKeySecretRef: null,
        model: 'qwen3-embedding-4b',
        dimensions: 1024,
      },
      ollamaHost: '',
      model: '',
    });
    expect(settings.chat.provider).toBe('privatemode');
    expect(settings.translation.provider).toBe('privatemode');
    expect(settings.embedding.provider).toBe('privatemode');
    expect(settings.chat.baseUrl).toBe('http://127.0.0.1:8080/v1');
    expect(settings.chat.apiKeySecretRef).toBe('PRIVATEMODE_API_KEY');
    expect(settings.chat.allowedModels).toContain('gemini:gemini-test');
    expect(
      parseChatModelSelection({ value: 'privatemode:glm-latest', fallbackProvider: 'ollama' })
        .provider,
    ).toBe('privatemode');
  });

  test('persists provider settings, creates an index, and reloads selections without new database columns', async () => {
    let stored: Record<string, unknown> | undefined;
    const enqueueOrchestrateIndex = vi.fn();
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ chunk_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => (stored ? [stored] : []) }) }),
      }),
      insert: () => ({
        values: (value: Record<string, unknown>) => ({
          onConflictDoUpdate: async () => {
            stored = value;
          },
        }),
      }),
      execute,
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ execute: vi.fn(async () => ({ rows: [] })) }),
    };
    const services = createAdminAiServices({
      db: db as any,
      config: { ollama: { configured: false, host: '', logRequests: false } } as any,
      embeddingIndexQueue: { enqueueOrchestrateIndex } as any,
      fetchImpl: async () => json({ data: [{ index: 0, embedding: vector }] }),
    });
    await services.updateSettings({
      aiFeaturesEnabled: true,
      chat: {
        provider: 'privatemode',
        baseUrl: 'http://proxy:8080/v1',
        apiKeySecretRef: null,
        model: 'glm-latest',
        allowedModels: ['privatemode:glm-latest', 'gemini:gemini-test'],
      },
      translation: {
        provider: 'privatemode',
        baseUrl: 'http://proxy:8080/v1',
        apiKeySecretRef: null,
        model: 'glm-flash-latest',
      },
      embedding: {
        provider: 'privatemode',
        baseUrl: 'http://proxy:8080/v1',
        apiKeySecretRef: null,
        model: 'qwen3-embedding-4b',
        dimensions: null,
      },
      ollamaHost: '',
      model: '',
    });
    expect(stored).toMatchObject({
      chatProvider: 'privatemode',
      translationProvider: 'privatemode',
      embeddingProvider: 'privatemode',
      embeddingDimensions: 1024,
      embeddingApiKeySecretRef: 'PRIVATEMODE_API_KEY',
    });
    expect(JSON.stringify(stored)).not.toContain('test-key');
    expect(enqueueOrchestrateIndex).toHaveBeenCalled();
    const reloaded = await services.getSettings();
    expect(reloaded.chat.provider).toBe('privatemode');
    expect(reloaded.translation.model).toBe('glm-flash-latest');
    expect(reloaded.embedding.dimensions).toBe(1024);
    expect(reloaded.providers?.privatemode?.configured).toBe(true);
    vi.stubEnv('ARKIVRA_PRIVATEMODE_PROXY_URL', '');
    expect((await services.getSettings()).providers?.privatemode?.configured).toBe(false);
  });

  test('generates through the proxy without Ollama-specific request fields', async () => {
    vi.stubEnv('ARKIVRA_PRIVATEMODE_CACHE_SECRET', 'a'.repeat(64));
    const fetchMock = vi.fn<typeof fetch>(async () => completion('Answer'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await generateText({
      model: createChatModel({
        settings: { provider: 'privatemode', baseUrl: 'https://untrusted.test', cacheScope: ['chat', 'user_a', 'vault_a'] },
        model: 'glm-flash-latest',
      }),
      prompt: 'Question',
    });
    expect(result.text).toBe('Answer');
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'http://127.0.0.1:8080/v1/chat/completions',
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.think).toBeUndefined();
    expect(body.cache_salt).toMatch(/^[a-f\d]{64}$/);
    expect(body.cache_salt).not.toContain('user_a');
  });

  test('streams answers through the proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            `${[
              `data: ${JSON.stringify({ id: 'stream-1', created: 1, model: 'glm-flash-latest', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }] })}`,
              `data: ${JSON.stringify({ id: 'stream-1', created: 1, model: 'glm-flash-latest', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}`,
              'data: [DONE]',
            ].join('\n\n')}\n\n`,
            { headers: { 'content-type': 'text/event-stream' } },
          ),
      ),
    );
    const result = streamText({
      model: createChatModel({
        settings: { provider: 'privatemode', baseUrl: '' },
        model: 'glm-flash-latest',
      }),
      prompt: 'Question',
    });
    expect(await result.text).toBe('Hello');
  });

  test.each(['text', 'page-image', 'area-image'] as const)(
    'translates %s input through Privatemode',
    async (type) => {
      const fetchMock = vi.fn<typeof fetch>(async () => completion('Hello world'));
      vi.stubGlobal('fetch', fetchMock);
      const provider = createRuntimeConfiguredOllamaTranslationProvider({
        resolveSettings: async () => ({
          enabled: true,
          provider: 'privatemode',
          host: 'http://127.0.0.1:8080/v1',
          model: 'gpt-oss-120b',
        }),
      });
      const source =
        type === 'text'
          ? { type, text: 'Hallo Welt' }
          : {
              type,
              pageNumber: 1,
              imageBase64: 'cG5n',
              mimeType: 'image/png' as const,
              rect: { x: 0, y: 0, width: 1, height: 1 },
            };
      const result = await provider.translate({ targetLanguage: 'en', source });
      expect(result).toMatchObject({ text: 'Hello world', provider: 'privatemode', model: type === 'text' ? 'gpt-oss-120b' : 'glm-5.3-flash' });
      const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
      expect(body.messages[0].content).toContain('translation, not transcription');
      if (type !== 'text')
        expect(body.messages[1].content).toContainEqual(
          expect.objectContaining({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,cG5n' },
          }),
        );
    },
  );
});
