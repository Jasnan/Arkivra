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

    expect(result).toEqual({ text: 'Hello world', model: 'gemma4:e4b' });
    expect(fetchMock).toHaveBeenCalledWith('http://ollama.test/api/chat', expect.objectContaining({
      method: 'POST',
    }));

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('gemma4:e4b');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('translation, not transcription');
    expect(body.messages[1].content).toContain('English');
    expect(body.messages[1].content).toContain('Hallo Welt');
    expect(body.messages[1].images).toBeUndefined();
  });

  test('sends rendered page images with a strict page-translation prompt', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ message: { content: 'Translated page' } }));
    const provider = createRuntimeConfiguredOllamaTranslationProvider({
      resolveSettings: async () => ({ host: 'http://ollama.test', model: 'gemma4:e4b' }),
      fetchImpl: fetchMock,
    });

    await provider.translate({
      targetLanguage: 'de',
      source: {
        type: 'page-image',
        pageNumber: 1,
        imageBase64: 'cG5n',
        mimeType: 'image/png',
      },
    });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0].content).toContain('translation, not transcription');
    expect(body.messages[1].content).toContain('TASK: Translate the rendered PDF page image into German');
    expect(body.messages[1].content).toContain('FINAL OUTPUT LANGUAGE: German');
    expect(body.messages[1].content).toContain('The source language is unknown');
    expect(body.messages[1].content).toContain('Identify the source language or languages');
    expect(body.messages[1].content).toContain('Read/OCR all visible text on the page silently');
    expect(body.messages[1].content).toContain('not already in German');
    expect(body.messages[1].content).toContain('Return only the translated page content');
    expect(body.messages[1].content).toContain('Do not output the OCR transcript in the detected source language');
    expect(body.messages[1].content).toContain('Do not copy source-language sentences');
    expect(body.messages[1].content).toContain('if any translated sentence is still in a detected source language instead of German');
    expect(body.messages[1].images).toEqual(['cG5n']);
  });

  test('sends selected visual areas to Ollama image inputs', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ message: { content: 'Translated area' } }));
    const provider = createRuntimeConfiguredOllamaTranslationProvider({
      resolveSettings: async () => ({ host: 'http://ollama.test', model: 'gemma4:e4b' }),
      fetchImpl: fetchMock,
    });

    await provider.translate({
      targetLanguage: 'en',
      source: {
        type: 'area-image',
        pageNumber: 3,
        imageBase64: 'YXJlYQ==',
        mimeType: 'image/png',
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
    });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].content).toContain('selected visual region');
    expect(body.messages[1].content).toContain('Only translate content inside the selected region');
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
