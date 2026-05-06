import type { ParsedChunk } from './parsed-document.schema.js';
import { describe, expect, test, vi } from 'vitest';
import { createRuntimeConfiguredOllamaChunkSummariser } from './ollama-chunk-summariser.js';

function makeChunk(overrides: Partial<ParsedChunk> = {}): ParsedChunk {
  return {
    id: 'doc_1:0',
    text: 'Original text',
    section: 'Methods',
    pageNumber: 1,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    sourceElementIds: ['el-1'],
    parentElementId: null,
    originalText: 'Original text',
    tablesHtml: [],
    images: [],
    citationPrecision: 'page',
    enhancedContent: null,
    type: 'paragraph',
    metadata: { index: 0, tokenCount: 3 },
    ...overrides,
  };
}

describe('ollama chunk summariser', () => {
  test('skips text-only chunks without resolving settings', async () => {
    const resolveSettings = vi.fn();
    const summariser = createRuntimeConfiguredOllamaChunkSummariser({
      resolveSettings,
    });

    const result = await summariser.summarise(makeChunk());

    expect(result).toEqual({
      enhancedContent: null,
      warnings: [],
    });
    expect(resolveSettings).not.toHaveBeenCalled();
  });

  test('sends multimodal Ollama chat request with prompt, tables, and capped images', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('gemma4:e4b');
      expect(body.messages[0]?.content).toContain('TEXT CONTENT:\nRevenue increased to 20.');
      expect(body.messages[0]?.content).toContain('TABLES:\nTable 1:\nRow 1: 20');
      expect(body.messages[0]?.images).toEqual([
        Buffer.from('image-1').toString('base64'),
      ]);

      return new Response(JSON.stringify({
        message: { content: 'Searchable summary' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const summariser = createRuntimeConfiguredOllamaChunkSummariser({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
        maxImagesPerChunk: 1,
        logRequests: false,
      }),
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await summariser.summarise(makeChunk({
      originalText: 'Revenue increased to 20.',
      tablesHtml: ['<table><tr><td>20</td></tr></table>'],
      images: [
        { mimeType: 'image/png', data: Buffer.from('image-1') },
        { mimeType: 'image/png', data: Buffer.from('image-2') },
      ],
    }));

    expect(result.enhancedContent).toBe('Searchable summary');
    expect(result.warnings).toEqual(['ollama_chunk_summariser.image_limit:1/2']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('skips multimodal chunks when summarisation is disabled', async () => {
    const fetchMock = vi.fn();
    const summariser = createRuntimeConfiguredOllamaChunkSummariser({
      resolveSettings: async () => ({
        enabled: false,
        host: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
        maxImagesPerChunk: 4,
        logRequests: false,
      }),
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await summariser.summarise(makeChunk({
      tablesHtml: ['<table></table>'],
    }));

    expect(result).toEqual({
      enhancedContent: null,
      warnings: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('returns warnings instead of throwing when settings resolution fails', async () => {
    const summariser = createRuntimeConfiguredOllamaChunkSummariser({
      resolveSettings: async () => {
        throw new Error('db unavailable');
      },
    });

    await expect(summariser.summarise(makeChunk({
      tablesHtml: ['<table></table>'],
    }))).resolves.toEqual({
      enhancedContent: null,
      warnings: ['ollama_chunk_summariser.settings_failed:db unavailable'],
    });
  });

  test('returns warnings instead of throwing when Ollama fails', async () => {
    const fetchMock = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    const summariser = createRuntimeConfiguredOllamaChunkSummariser({
      resolveSettings: async () => ({
        enabled: true,
        host: 'http://127.0.0.1:11434',
        model: 'gemma4:e4b',
        maxImagesPerChunk: 4,
        logRequests: false,
      }),
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(summariser.summarise(makeChunk({
      images: [{ mimeType: 'image/png', data: Buffer.from('image') }],
    }))).resolves.toEqual({
      enhancedContent: null,
      warnings: ['ollama_chunk_summariser.failed:bad gateway'],
    });
  });
});
