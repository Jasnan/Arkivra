import { describe, expect, test, vi } from 'vitest';
import { createRuntimeConfiguredOllamaImageCaptioner } from './image-captioner.js';

describe('create runtime configured ollama image captioner', () => {
  test('returns captioner even when disabled (caption method returns null)', async () => {
    const captioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => ({
        enabled: false,
        host: 'http://localhost:11434',
        model: 'llava',
        logRequests: false,
      }),
    });

    expect(captioner).not.toBeNull();
    expect(captioner?.name).toBe('ollama-image-captioner');

    const result = await captioner!.caption({
      mimeType: 'image/jpeg',
      data: Buffer.from('fake-image-data'),
    });

    expect(result).toBeNull();
  });

  test('calls Ollama chat API when caption is invoked', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        message: {
          content: 'A beautiful landscape with mountains',
        },
      }),
    })) as unknown as ReturnType<typeof vi.fn>;

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const captioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://localhost:11434',
        model: 'llava',
        logRequests: false,
      }),
    });

    const result = await captioner!.caption({
      mimeType: 'image/jpeg',
      data: Buffer.from('fake-image-data'),
    });

    expect(result).toBe('A beautiful landscape with mountains');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
        }),
      }),
    );
  });

  test('returns null when Ollama returns empty response', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        message: {
          content: '',
        },
      }),
    })) as unknown as ReturnType<typeof vi.fn>;

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const captioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://localhost:11434',
        model: 'llava',
        logRequests: false,
      }),
    });

    const result = await captioner!.caption({
      mimeType: 'image/jpeg',
      data: Buffer.from('fake-image-data'),
    });

    expect(result).toBeNull();
  });

  test('returns null when Ollama API fails', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })) as unknown as ReturnType<typeof vi.fn>;

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const captioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://localhost:11434',
        model: 'llava',
        logRequests: false,
      }),
    });

    const result = await captioner!.caption({
      mimeType: 'image/jpeg',
      data: Buffer.from('fake-image-data'),
    });

    expect(result).toBeNull();
  });

  test('converts image data to base64 for API request', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        message: {
          content: 'Test caption',
        },
      }),
    })) as unknown as ReturnType<typeof vi.fn>;

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const captioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://localhost:11434',
        model: 'llava',
        logRequests: false,
      }),
    });

    const imageData = Buffer.from('test-image-bytes');
    await captioner!.caption({
      mimeType: 'image/png',
      data: imageData,
    });

    expect(mockFetch).toHaveBeenCalled();
    const callArgs = mockFetch.mock.calls[0] as any[];
    const requestBody = JSON.parse(callArgs[1]?.body as string);
    expect(requestBody.messages).toHaveLength(1);
    expect(requestBody.messages[0].images).toHaveLength(1);
    expect(requestBody.messages[0].images[0]).toBe('dGVzdC1pbWFnZS1ieXRlcw==');
  });

  test('uses custom model from settings', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        message: {
          content: 'Caption',
        },
      }),
    })) as unknown as ReturnType<typeof vi.fn>;

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const captioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://localhost:11434',
        model: 'custom-model',
        logRequests: false,
      }),
    });

    await captioner!.caption({
      mimeType: 'image/jpeg',
      data: Buffer.from('data'),
    });

    const callArgs = mockFetch.mock.calls[0] as any[];
    const requestBody = JSON.parse(callArgs[1]?.body as string);
    expect(requestBody.model).toBe('custom-model');
  });

  test('logs requests when logRequests is enabled', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        message: {
          content: 'Caption',
        },
      }),
    })) as unknown as ReturnType<typeof vi.fn>;

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const captioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://localhost:11434',
        model: 'llava',
        logRequests: true,
      }),
    });

    await captioner!.caption({
      mimeType: 'image/jpeg',
      data: Buffer.from('data'),
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('captioning image with model'),
    );
    consoleSpy.mockRestore();
  });

  test('handles network errors gracefully', async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error('Network error');
    }) as unknown as ReturnType<typeof vi.fn>;

    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const captioner = createRuntimeConfiguredOllamaImageCaptioner({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://localhost:11434',
        model: 'llava',
        logRequests: false,
      }),
    });

    const result = await captioner!.caption({
      mimeType: 'image/jpeg',
      data: Buffer.from('data'),
    });

    expect(result).toBeNull();
  });
});
