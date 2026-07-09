import { describe, expect, test, vi } from 'vitest';
import {
  createDocumentTranslationServices,
  createRuntimeConfiguredOllamaTranslationProvider,
} from './translations.services.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('translation services', () => {
  test('sends selected text to Ollama without image attachments', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ message: { content: 'Hello world' } }));
    const provider = createRuntimeConfiguredOllamaTranslationProvider({
      resolveSettings: async () => ({ host: 'http://ollama.test/', model: 'gemma4:e4b' }),
      fetchImpl: fetchMock,
    });

    const result = await provider.translate({
      targetLanguage: 'en',
      source: {
        type: 'text',
        pageNumber: 2,
        text: 'Hallo Welt',
      },
    });

    expect(result).toEqual({ text: 'Hello world', model: 'gemma4:e4b', provider: 'ollama' });
    expect(fetchMock).toHaveBeenCalledWith('http://ollama.test/api/chat', expect.objectContaining({
      method: 'POST',
    }));

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('gemma4:e4b');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('translation, not transcription');
    expect(body.messages[1].content).toContain('professional German (de) to English (en) translator');
    expect(body.messages[1].content).toContain('Produce only the English translation');
    expect(body.messages[1].content).toContain('Please translate the following German text into English');
    expect(body.messages[1].content).toContain('Hallo Welt');
    expect(body.messages[1].images).toBeUndefined();
  });

  test('sends rendered page images with the professional translator prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ message: { content: 'This is a page.' } }));
    const provider = createRuntimeConfiguredOllamaTranslationProvider({
      resolveSettings: async () => ({ host: 'http://ollama.test', model: 'gemma4:e4b' }),
      fetchImpl: fetchMock,
    });

    const result = await provider.translate({
      targetLanguage: 'en',
      source: {
        type: 'page-image',
        pageNumber: 1,
        imageBase64: 'cG5n',
        mimeType: 'image/png',
      },
    });

    expect(result.text).toBe('This is a page.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain('translation, not transcription');
    expect(body.messages[1].content).toContain('professional German (de) to English (en) translator');
    expect(body.messages[1].content).toContain('Produce only the English translation');
    expect(body.messages[1].content).toContain('Please translate the following German text into English');
    expect(body.messages[1].content).toContain('{IMAGE}');
    expect(body.messages[1].images).toEqual(['cG5n']);
  });

  test('sends selected visual areas with the professional translator prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ message: { content: 'This sheet is for your information only.' } }));
    const provider = createRuntimeConfiguredOllamaTranslationProvider({
      resolveSettings: async () => ({ host: 'http://ollama.test', model: 'gemma4:e4b' }),
      fetchImpl: fetchMock,
    });

    const result = await provider.translate({
      targetLanguage: 'en',
      source: {
        type: 'area-image',
        pageNumber: 3,
        imageBase64: 'YXJlYQ==',
        mimeType: 'image/png',
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
    });

    expect(result.text).toBe('This sheet is for your information only.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain('translation, not transcription');
    expect(body.messages[1].content).toContain('professional German (de) to English (en) translator');
    expect(body.messages[1].content).toContain('Please translate the following German text into English');
    expect(body.messages[1].content).toContain('{IMAGE}');
    expect(body.messages[1].images).toEqual(['YXJlYQ==']);
  });

  test('wraps provider output in the public translation response shape', async () => {
    const services = createDocumentTranslationServices({
      provider: {
        name: 'test-provider',
        translate: vi.fn(async () => ({ text: 'Translation', model: 'model-a' })),
      },
    });

    await expect(services.translate({
      targetLanguage: 'de',
      source: { type: 'text', text: 'Translation' },
    })).resolves.toEqual({
      targetLanguage: 'de',
      text: 'Translation',
      provider: 'test-provider',
      model: 'model-a',
      sourceType: 'text',
    });
  });
});
