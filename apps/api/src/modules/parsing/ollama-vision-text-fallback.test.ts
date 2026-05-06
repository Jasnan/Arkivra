import type { ParseInput } from './parser.types.js';
import type { ParserOutput } from './parsed-document.schema.js';
import { describe, expect, test, vi } from 'vitest';
import { createRuntimeConfiguredOllamaVisionTextFallback } from './ollama-vision-text-fallback.js';

const input: ParseInput = {
  documentId: 'doc_vision',
  fileName: 'scan.pdf',
  mimeType: 'application/pdf',
  fileData: Buffer.from('pdf'),
};

function makeRaw(overrides: Partial<ParserOutput> = {}): ParserOutput {
  return {
    engine: 'docling',
    engineVersion: 'v1',
    text: '',
    markdown: '',
    embeddedImages: [{ mimeType: 'image/png', data: Buffer.from('image-bytes') }],
    warnings: [],
    ...overrides,
  };
}

describe('ollama vision text fallback', () => {
  test('transcribes embedded images through Ollama chat image input', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('gemma4:e4b');
      expect(body.messages[0]?.images).toEqual([Buffer.from('image-bytes').toString('base64')]);
      return new Response(JSON.stringify({
        message: { content: 'Recovered page text' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const fallback = createRuntimeConfiguredOllamaVisionTextFallback({
      resolveSettings: async () => ({
        host: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
        logRequests: false,
      }),
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await fallback.run(input, makeRaw());

    expect(result.output?.text).toBe('Recovered page text');
    expect(result.output?.markdown).toBe('');
    expect(result.warnings).toContain('ollama_vision_fallback.used:1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Phase 1: synthesise one narrative StructuredElement per
    // transcribed page so the chunker can attribute fallback chunks to
    // a specific page.
    expect(result.output?.structuredElements).toEqual([
      {
        elementId: 'ollama-vision-page-1',
        parentId: null,
        type: 'narrative',
        text: 'Recovered page text',
        tableHtml: null,
        image: null,
        pageNumber: 1,
        bbox: null,
        section: null,
        sectionPath: [],
      },
    ]);
  });

  test('uses the original file bytes when the empty parser output came from an image upload', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0]?.images).toEqual([Buffer.from('image-file').toString('base64')]);
      return new Response(JSON.stringify({
        message: { content: 'Recovered image upload text' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const fallback = createRuntimeConfiguredOllamaVisionTextFallback({
      resolveSettings: async () => ({
        host: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
        logRequests: false,
      }),
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await fallback.run({
      documentId: 'doc_image',
      fileName: 'scan.png',
      mimeType: 'image/png',
      fileData: Buffer.from('image-file'),
    }, makeRaw({ embeddedImages: [] }));

    expect(result.output?.text).toBe('Recovered image upload text');
    expect(result.output?.markdown).toBe('');
    expect(result.output?.structuredElements?.[0]?.pageNumber).toBe(1);
    expect(result.warnings).toContain('ollama_vision_fallback.used:1');
  });

  test('loads fallback images when the parser returned empty PDF output without images', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0]?.images).toEqual([Buffer.from('docling-image').toString('base64')]);
      return new Response(JSON.stringify({
        message: { content: 'Recovered PDF page text' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const loadImages = vi.fn(async () => [{
      mimeType: 'image/png',
      data: Buffer.from('docling-image'),
    }]);

    const fallback = createRuntimeConfiguredOllamaVisionTextFallback({
      resolveSettings: async () => ({
        host: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
        logRequests: false,
      }),
      loadImages,
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await fallback.run(input, makeRaw({
      engine: 'docling',
      embeddedImages: [],
    }));

    expect(loadImages).toHaveBeenCalledTimes(1);
    expect(result.output?.text).toBe('Recovered PDF page text');
    expect(result.warnings).toContain('ollama_vision_fallback.loaded_images:1');
    expect(result.warnings).toContain('ollama_vision_fallback.used:1');
  });

  test('returns warnings without output when no images are available', async () => {
    const fallback = createRuntimeConfiguredOllamaVisionTextFallback({
      resolveSettings: async () => ({
        host: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
        logRequests: false,
      }),
    });

    const result = await fallback.run(input, makeRaw({ embeddedImages: [] }));

    expect(result.output).toBeNull();
    expect(result.warnings).toEqual(['ollama_vision_fallback.no_images']);
  });
});
