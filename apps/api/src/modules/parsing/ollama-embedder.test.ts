import { describe, expect, test, vi } from 'vitest';
import { createRuntimeConfiguredOllamaEmbedder } from './ollama-embedder.js';

describe('ollama embedder', () => {
  test('skips when embedding is disabled', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const embedder = createRuntimeConfiguredOllamaEmbedder({
      resolveSettings: async () => ({
        enabled: false,
        host: 'http://ollama.local',
        model: 'nomic-embed-text',
        dimensions: 3,
        logRequests: false,
      }),
      fetchImpl,
    });

    await expect(embedder.embed(['alpha', 'beta'])).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('posts batched input to /api/embed', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embeddings: [[1, 0, 0], [0, 1, 0]] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embeddings: [[0, 0, 1]] }), { status: 200 }),
      );

    const embedder = createRuntimeConfiguredOllamaEmbedder({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://ollama.local/',
        model: 'nomic-embed-text',
        dimensions: 3,
        logRequests: false,
      }),
      fetchImpl,
      batchSize: 2,
    });

    const vectors = await embedder.embed(['alpha', 'beta', 'gamma']);

    expect(vectors).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://ollama.local/api/embed',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const firstCallBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const secondCallBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(firstCallBody).toEqual({
      model: 'nomic-embed-text',
      input: ['alpha', 'beta'],
    });
    expect(secondCallBody).toEqual({
      model: 'nomic-embed-text',
      input: ['gamma'],
    });
  });

  test('falls back once to /api/embeddings when /api/embed is unavailable', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embedding: [1, 0, 0] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embedding: [0, 1, 0] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embedding: [0, 0, 1] }), { status: 200 }),
      );

    const embedder = createRuntimeConfiguredOllamaEmbedder({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://ollama.local',
        model: 'nomic-embed-text',
        dimensions: 3,
        logRequests: false,
      }),
      fetchImpl,
      batchSize: 2,
    });

    await expect(embedder.embed(['alpha', 'beta'])).resolves.toEqual([[1, 0, 0], [0, 1, 0]]);
    await expect(embedder.embed(['gamma'])).resolves.toEqual([[0, 0, 1]]);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://ollama.local/api/embed',
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://ollama.local/api/embeddings',
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'http://ollama.local/api/embeddings',
      expect.any(Object),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      'http://ollama.local/api/embeddings',
      expect.any(Object),
    );
  });

  test('throws when Ollama returns a non-404 error', async () => {
    const embedder = createRuntimeConfiguredOllamaEmbedder({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://ollama.local',
        model: 'nomic-embed-text',
        dimensions: 3,
        logRequests: false,
      }),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: 'bad gateway' }), { status: 502 }),
      ),
    });

    await expect(embedder.embed(['alpha'])).rejects.toThrow('bad gateway');
  });

  test('throws when vector dimensions do not match settings', async () => {
    const embedder = createRuntimeConfiguredOllamaEmbedder({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://ollama.local',
        model: 'nomic-embed-text',
        dimensions: 3,
        logRequests: false,
      }),
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ embeddings: [[1, 0]] }), { status: 200 }),
      ),
    });

    await expect(embedder.embed(['alpha'])).rejects.toThrow('expected 3, received 2');
  });
});
