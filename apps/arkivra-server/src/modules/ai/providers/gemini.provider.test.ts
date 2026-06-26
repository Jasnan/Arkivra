import { describe, expect, test, vi } from 'vitest';
import { createGeminiProvider, normalizeGeminiModel } from './gemini.provider.js';

describe('gemini provider', () => {
  test('normalizes Google Models API metadata into Arkivra model capabilities', () => {
    const model = normalizeGeminiModel({
      name: 'models/gemini-live-vision',
      version: '001',
      displayName: 'Gemini Live Vision',
      description: 'Multimodal image and text model',
      inputTokenLimit: 128000,
      outputTokenLimit: 8192,
      supportedGenerationMethods: ['countTokens', 'generateContent'],
    });

    expect(model).toEqual({
      name: 'gemini-live-vision',
      displayName: 'Gemini Live Vision',
      description: 'Multimodal image and text model',
      supportedGenerationMethods: ['countTokens', 'generateContent'],
      inputTokenLimit: 128000,
      outputTokenLimit: 8192,
      version: '001',
      capabilities: ['chat', 'vision'],
      contextWindow: 128000,
      maxOutputTokens: 8192,
      providerMetadata: {
        name: 'models/gemini-live-vision',
        version: '001',
        displayName: 'Gemini Live Vision',
        description: 'Multimodal image and text model',
        inputTokenLimit: 128000,
        outputTokenLimit: 8192,
        supportedGenerationMethods: ['countTokens', 'generateContent'],
      },
    });
  });

  test('discovers Gemini models from the native paginated Models API', async () => {
    const fetchImpl = vi.fn(async (input: URL | string) => {
      const url = input.toString();

      if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/models') {
        return Response.json({
          data: [
            { id: 'gemini-text-test' },
            { id: 'text-embedding-test' },
          ],
        });
      }

      if (url === 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000') {
        return Response.json({
          models: [
            {
              name: 'models/text-embedding-test',
              displayName: 'Embedding Test',
              supportedGenerationMethods: ['embedContent', 'batchEmbedContents'],
              inputTokenLimit: 2048,
            },
          ],
          nextPageToken: 'next',
        });
      }

      if (
        url ===
        'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=next'
      ) {
        return Response.json({
          models: [
            {
              name: 'models/gemini-text-test',
              displayName: 'Gemini Text Test',
              supportedGenerationMethods: ['generateContent'],
              inputTokenLimit: 32768,
              outputTokenLimit: 2048,
            },
          ],
        });
      }

      throw new Error(`Unexpected request ${url}`);
    });
    const provider = createGeminiProvider({ fetchImpl: fetchImpl as any });

    await expect(provider.listModels({ apiKey: 'test-key' })).resolves.toEqual([
      expect.objectContaining({
        name: 'gemini-text-test',
        capabilities: ['chat'],
        contextWindow: 32768,
        maxOutputTokens: 2048,
      }),
      expect.objectContaining({
        name: 'text-embedding-test',
        capabilities: ['embedding'],
        contextWindow: 2048,
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-key',
        },
      }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: {
          'x-goog-api-key': 'test-key',
        },
      }),
    );
  });

  test('uses OpenAI-compatible models as source of truth and enriches native metadata', async () => {
    const provider = createGeminiProvider({
      fetchImpl: vi.fn(async (input: URL | string) => {
        const url = input.toString();

        if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/models') {
          return Response.json({
            data: [
              { id: 'gemini-chat-compatible' },
              { id: 'gemini-embedding-compatible' },
              { id: 'gemini-live-compatible' },
              { id: 'imagen-compatible' },
            ],
          });
        }

        if (url === 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000') {
          return Response.json({
            models: [
              {
                name: 'models/gemini-chat-compatible',
                supportedGenerationMethods: ['generateContent', 'countTokens'],
              },
              {
                name: 'models/gemini-embedding-compatible',
                supportedGenerationMethods: ['embedContent', 'countTokens'],
              },
              {
                name: 'models/gemini-native-only',
                supportedGenerationMethods: ['generateContent', 'countTokens'],
              },
              {
                name: 'models/gemini-live-compatible',
                supportedGenerationMethods: ['bidiGenerateContent'],
              },
              {
                name: 'models/imagen-compatible',
                supportedGenerationMethods: ['predict'],
              },
            ],
          });
        }

        throw new Error(`Unexpected request ${url}`);
      }) as any,
    });

    await expect(provider.listModels({ apiKey: 'test-key' })).resolves.toEqual([
      expect.objectContaining({
        name: 'gemini-chat-compatible',
        capabilities: ['chat'],
      }),
      expect.objectContaining({
        name: 'gemini-embedding-compatible',
        capabilities: ['embedding'],
      }),
      expect.objectContaining({
        name: 'gemini-live-compatible',
        capabilities: [],
      }),
      expect.objectContaining({
        name: 'imagen-compatible',
        capabilities: [],
      }),
    ]);
  });

  test('includes OpenAI-compatible embedding models that are not exact native model IDs', async () => {
    const provider = createGeminiProvider({
      fetchImpl: vi.fn(async (input: URL | string) => {
        const url = input.toString();

        if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/models') {
          return Response.json({
            data: [
              { id: 'gemini-embedding-2-preview' },
              { id: 'gemini-chat-compatible' },
            ],
          });
        }

        if (url === 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000') {
          return Response.json({
            models: [
              {
                name: 'models/gemini-embedding-2',
                supportedGenerationMethods: ['embedContent', 'countTokens'],
              },
              {
                name: 'models/gemini-chat-compatible',
                supportedGenerationMethods: ['generateContent', 'countTokens'],
              },
            ],
          });
        }

        throw new Error(`Unexpected request ${url}`);
      }) as any,
    });

    await expect(provider.listModels({ apiKey: 'test-key' })).resolves.toEqual([
      expect.objectContaining({
        name: 'gemini-chat-compatible',
        capabilities: ['chat'],
      }),
      expect.objectContaining({
        name: 'gemini-embedding-2-preview',
        capabilities: ['embedding'],
      }),
    ]);
  });

  test('keeps OpenAI-compatible models when native metadata is unavailable', async () => {
    const provider = createGeminiProvider({
      fetchImpl: vi.fn(async (input: URL | string) => {
        const url = input.toString();

        if (url === 'https://generativelanguage.googleapis.com/v1beta/openai/models') {
          return Response.json({
            data: [
              { id: 'gemini-3.5-flash' },
              { id: 'gemini-embedding-2-preview' },
            ],
          });
        }

        return Response.json(
          { error: { message: 'API key not valid', status: 'UNAUTHENTICATED' } },
          { status: 401 },
        );
      }) as any,
    });

    await expect(provider.listModels({ apiKey: 'test-key' })).resolves.toEqual([
      expect.objectContaining({
        name: 'gemini-3.5-flash',
        capabilities: ['chat'],
        contextWindow: null,
      }),
      expect.objectContaining({
        name: 'gemini-embedding-2-preview',
        capabilities: ['embedding'],
        contextWindow: null,
      }),
    ]);
  });

  test('surfaces OpenAI compatibility model discovery failures without fallback models', async () => {
    const provider = createGeminiProvider({
      fetchImpl: vi.fn(async () =>
        Response.json(
          { error: { message: 'API key not valid', status: 'UNAUTHENTICATED' } },
          { status: 401 },
        ),
      ) as any,
    });

    await expect(provider.listModels({ apiKey: 'bad-key' })).rejects.toThrow(
      'Could not query Gemini OpenAI-compatible models: API key not valid (UNAUTHENTICATED)',
    );
  });
});
