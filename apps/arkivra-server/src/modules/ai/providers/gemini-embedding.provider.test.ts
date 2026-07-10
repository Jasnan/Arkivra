import { afterEach, describe, expect, test, vi } from 'vitest';
import { createGeminiEmbeddingProvider } from './gemini-embedding.provider.js';

describe('gemini embedding provider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('posts batched input to the OpenAI-compatible embeddings endpoint', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 0, embedding: [1, 0, 0] },
            { index: 1, embedding: [0, 1, 0] },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = createGeminiEmbeddingProvider({ fetchImpl, batchSize: 2 });

    await expect(
      provider.embed({
        texts: ['alpha', 'beta'],
        config: {
          provider: 'gemini',
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
          model: 'text-embedding-004',
          dimensions: 3,
        },
      }),
    ).resolves.toEqual([[1, 0, 0], [0, 1, 0]]);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-key',
          'content-type': 'application/json',
        },
      }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'text-embedding-004',
      input: ['alpha', 'beta'],
    });
  });
});
