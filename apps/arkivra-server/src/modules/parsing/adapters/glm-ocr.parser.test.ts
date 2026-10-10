import { describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { createGlmOcrParser } from './glm-ocr.parser.js';
import { glmOcrResponseSchema, mapGlmOcrOutput } from './glm-ocr.mapper.js';
import { createParsePipeline } from '../parse-pipeline.js';
import { createParserRegistry } from '../parser.registry.js';
import { createNoopTextCleaner } from '../text-cleaner.js';

const fixture = {
  json_result: [
    [
      {
        index: 1,
        label: 'text',
        content: 'Revenue grew to EUR 42 million.',
        bbox_2d: [100, 200, 900, 300],
      },
      { index: 0, label: 'title', content: '# Results', bbox_2d: [100, 50, 900, 100] },
    ],
    [
      {
        index: 0,
        label: 'table',
        content: '| Year | Revenue |\n| --- | --- |\n| 2026 | 42 |',
        bbox_2d: [100, 100, 900, 500],
      },
    ],
  ],
  markdown_result: '# Results\n\nRevenue grew to EUR 42 million.',
};
const input = {
  documentId: 'doc_1',
  fileName: 'results.pdf',
  mimeType: 'application/pdf',
  fileData: Buffer.from('%PDF-fixture'),
};

describe('gLM SDK adapter', () => {
  it('preserves page order, region identity, boxes, headings and tables without reparsing', () => {
    const output = mapGlmOcrOutput({
      response: glmOcrResponseSchema.parse(fixture),
      documentId: input.documentId,
    });
    expect(output.chunks?.map((c) => c.sourceElementIds)).toEqual([
      ['glm:p1:r0'],
      ['glm:p1:r1'],
      ['glm:p2:r0'],
    ]);
    expect(output.chunks?.[1]?.boundingBoxes[0]).toMatchObject({
      pageNumber: 1,
      x0: 100,
      y0: 200,
      layoutWidth: 1000,
      layoutHeight: 1000,
    });
    expect(output.chunks?.[2]).toMatchObject({
      section: 'Results',
      pageStart: 2,
      type: 'table',
      citationPrecision: 'box',
    });
    expect(output.chunks?.[2]?.tablesHtml[0]).toContain('<td>2026</td>');
    expect(output.rawStructuredOutput?.json_result).toEqual(fixture.json_result);
  });
  it('splits large regions without inventing narrower boxes or losing text', () => {
    const response = glmOcrResponseSchema.parse({
      json_result: [[{ index: 0, label: 'text', content: 'abcdefghij', bbox_2d: [1, 2, 3, 4] }]],
    });
    const output = mapGlmOcrOutput({ response, documentId: 'doc', maxChunkCharacters: 4 });
    expect(output.chunks?.map((c) => c.originalText).join('')).toBe('abcdefghij');
    expect(output.chunks).toHaveLength(3);
    expect(
      output.chunks?.every(
        (c) => c.sourceElementIds[0] === 'glm:p1:r0' && c.boundingBoxes[0]?.x1 === 3,
      ),
    ).toBe(true);
  });
  it('rejects malformed coordinates and duplicate region IDs', () => {
    for (const bbox_2d of [
      [0, 0, 2000, 20],
      [20, 0, 10, 20],
    ]) {
      const response = glmOcrResponseSchema.parse({
        json_result: [[{ index: 0, label: 'text', content: 'x', bbox_2d }]],
      });
      expect(() => mapGlmOcrOutput({ response, documentId: 'doc' })).toThrow('normalized');
    }
    const response = glmOcrResponseSchema.parse({
      json_result: [
        [
          { index: 0, label: 'text', content: 'a' },
          { index: 0, label: 'text', content: 'b' },
        ],
      ],
    });
    expect(() => mapGlmOcrOutput({ response, documentId: 'doc' })).toThrow('Duplicate');
  });
  it('escapes untrusted table markup', () => {
    const response = glmOcrResponseSchema.parse({
      json_result: [
        [{ index: 0, label: 'table', content: '| <script>alert(1)</script> |\n| --- |' }],
      ],
    });
    expect(
      mapGlmOcrOutput({ response, documentId: 'doc' }).chunks?.[0]?.tablesHtml[0],
    ).not.toContain('<script>');
  });
  it('uses the SDK HTTP contract and preserves provenance through the parse pipeline', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(fixture));
    const parser = createGlmOcrParser({ baseUrl: 'http://sdk', fetchImpl });
    const pipeline = createParsePipeline({
      parserRegistry: createParserRegistry({ parsers: [parser], defaultEngine: 'glm-ocr' }),
      cleaner: createNoopTextCleaner(),
    });
    const parsed = await pipeline.run(input);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://sdk/glmocr/parse');
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1].body).images[0]).toMatch(
      /^data:application\/pdf;base64,/,
    );
    expect(parsed.engine).toBe('glm-ocr');
    expect(parsed.structuredElements?.[1]?.bbox?.y0).toBe(200);
    expect(parsed.chunks[1]?.sourceElementIds).toEqual(['glm:p1:r1']);
  });
  it('bypasses OCR for text and preserves literal punctuation and source offsets', async () => {
    const fetchImpl = vi.fn();
    const parser = createGlmOcrParser({ baseUrl: 'http://sdk', fetchImpl });
    const pipeline = createParsePipeline({
      parserRegistry: createParserRegistry({ parsers: [parser], defaultEngine: 'glm-ocr' }),
      cleaner: createNoopTextCleaner(),
    });
    const source = '# literal | value > 42';
    const parsed = await pipeline.run({
      ...input,
      fileName: 'test.txt',
      mimeType: 'text/plain',
      fileData: Buffer.from(source),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(parsed.chunks[0]?.originalText).toBe(source);
    expect(parsed.chunks[0]?.pageStart).toBeNull();
    expect(parsed.chunks[0]?.metadata.textLocator).toMatchObject({
      sourceType: 'rawText',
      startOffset: 0,
      endOffset: source.length,
    });
  });
  it('crops image regions locally and preserves their source link', async () => {
    const canvas = createCanvas(100, 100);
    canvas.getContext('2d').fillRect(0, 0, 100, 100);
    const image = Buffer.from(await canvas.encode('png'));
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        json_result: [[{ index: 0, label: 'image', content: '', bbox_2d: [100, 100, 500, 500] }]],
      }),
    );
    const parser = createGlmOcrParser({
      baseUrl: 'http://sdk',
      fetchImpl,
      imageCaptioner: { name: 'fixture', caption: async () => 'A revenue chart' },
    });
    const parsed = await parser.parse({
      ...input,
      fileName: 'chart.png',
      mimeType: 'image/png',
      fileData: image,
    });
    expect(parsed.chunks?.[0]?.images[0]?.data.length).toBeGreaterThan(0);
    expect(parsed.chunks?.[0]?.text).toBe('A revenue chart');
    expect(parsed.chunks?.[0]?.sourceElementIds).toEqual(['glm:p1:r0']);
  });
  it('does not include upstream document content in failures', async () => {
    const parser = createGlmOcrParser({
      baseUrl: 'http://sdk',
      fetchImpl: vi.fn().mockResolvedValue(new Response('secret document', { status: 500 })),
    });
    await expect(parser.parse(input)).rejects.toThrow('GLM SDK request failed (500)');
  });
  it('cancels a timed-out SDK request using the same request ID', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      if (url.endsWith('/glmocr/parse')) {
        await new Promise<void>((resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          });
        });
      }
      return Response.json({ ok: true });
    });
    const parser = createGlmOcrParser({ baseUrl: 'http://sdk', timeoutMs: 10, fetchImpl });
    await expect(parser.parse(input)).rejects.toThrow(/timeout/i);
    const requestId = fetchImpl.mock.calls[0]?.[1].headers['x-arkivra-request-id'];
    expect(fetchImpl.mock.calls[0]?.[1].headers['x-arkivra-lease']).toBe('1');
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(`http://sdk/glmocr/cancel/${requestId}`);
  });
});
