import { PDFDocument } from 'pdf-lib';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';
import {
  createPrivatemodeParser,
  parseGroundedOcr,
  prepareOcrImage,
} from './privatemode.parser.js';
import { mapRemoteLayoutOutput, remoteLayoutResponseSchema } from './remote-layout.mapper.js';
import { createParsePipeline } from '../parse-pipeline.js';
import { createParserRegistry } from '../parser.registry.js';
import { createNoopTextCleaner } from '../text-cleaner.js';

const grounding = '<|ref|>text<|/ref|><|det|>[[100,200,900,300]]<|/det|>Reference ZX987654';

const input = {
  documentId: 'doc_remote',
  fileName: 'source.txt',
  mimeType: 'text/plain',
  fileData: Buffer.from('Reference\nZX987654'),
};
it('uses isolated, stable request caching for OCR and chunking without changing text', async () => {
  vi.stubEnv('ARKIVRA_PRIVATEMODE_CACHE_SECRET', 'a'.repeat(64));
  try {
    const fetchImpl = mockProvider();
    const adapter = parser(fetchImpl);
    const source = { ...input, vaultId: 'vault_a', fileName: 'source.pdf', mimeType: 'application/pdf', fileData: await pdf(1) };
    const first = await adapter.parse(source);
    const requests = () => fetchImpl.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    const salt = requests()[0].cache_salt;
    expect(salt).toMatch(/^[a-f\d]{64}$/);
    expect(requests().map((body) => body.model)).toContain('deepseek-ocr-2');
    expect(requests().map((body) => body.model)).toContain('gpt-oss-120b');
    expect(requests().filter((body) => body.model === 'gpt-oss-120b').every((body) => body.response_format.type === 'json_schema' && body.response_format.json_schema.strict)).toBe(true);
    expect(requests().every((body) => body.cache_salt === salt)).toBe(true);
    fetchImpl.mockClear();
    expect((await adapter.parse(source)).text).toBe(first.text);
    expect(requests()[0].cache_salt).toBe(salt);
    fetchImpl.mockClear();
    await adapter.parse({ ...source, vaultId: 'vault_b' });
    expect(requests()[0].cache_salt).not.toBe(salt);
  } finally {
    vi.unstubAllEnvs();
  }
});
function response(content: string, finish_reason = 'stop') {
  return Response.json({ choices: [{ finish_reason, message: { content } }] });
}
function mockProvider(ocr = grounding) {
  return vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    const body = JSON.parse(options!.body as string);
    const content = body.messages[0].content;
    if (body.model === 'deepseek-ocr-2') return response(ocr);
    if (typeof content !== 'string') return response('A chart showing annual revenue.');
    if (content.includes('Units: ')) {
      const units = JSON.parse(content.split('Units: ')[1]!);
      return response(
        JSON.stringify({
          blocks: units.map((unit: { id: number }) => ({
            start: unit.id,
            end: unit.id + 1,
            label: 'text',
          })),
        }),
      );
    }
    const blocks = JSON.parse(content.split('Blocks: ')[1]!);
    return response(JSON.stringify({ chunks: [blocks.map((block: { id: string }) => block.id)] }));
  });
}
function parser(fetchImpl = mockProvider(), options = {}) {
  return createPrivatemodeParser({
    baseUrl: 'http://127.0.0.1:8080/v1',
    apiKey: 'fixture',
    fetchImpl,
    ...options,
  });
}
function pipeline(fetchImpl = mockProvider()) {
  const adapter = parser(fetchImpl);
  return createParsePipeline({
    parserRegistry: createParserRegistry({ parsers: [adapter], defaultEngine: 'privatemode' }),
    cleaner: createNoopTextCleaner(),
  });
}
async function pdf(pageCount: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++)
    doc.addPage([100, 100]).drawText(`Digital page ${i + 1}`, { x: 5, y: 50, size: 8 });
  return Buffer.from(await doc.save());
}

describe('privatemode remote ingestion', () => {
  it.each([
    ['source.txt', 'text/plain'],
    ['source.md', 'text/markdown'],
    ['source.json', 'application/json'],
    ['source.csv', 'text/csv'],
    ['source.xml', 'application/xml'],
  ])(
    'remotely parses and chunks %s, without rewriting exact source values',
    async (fileName, mimeType) => {
      const fetchImpl = mockProvider();
      const output = await pipeline(fetchImpl).run({ ...input, fileName, mimeType });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(output.engine).toBe('privatemode');
      expect(output.chunks[0]?.text).toContain('ZX987654');
      expect(output.chunks[0]?.sourceElementIds).toHaveLength(2);
      expect(output.chunks[0]?.pageStart).toBeNull();
      expect(output.chunks[0]?.boundingBoxes).toEqual([]);
      if (/txt|md|json/.test(fileName))
        expect(output.chunks[0]?.metadata.textLocator).toMatchObject({
          startOffset: 0,
          endOffset: input.fileData.toString().length,
        });
      const body = JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string);
      expect(body.reasoning_effort).toBe('low');
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema.strict).toBe(true);
    },
  );
  it('sends every digital PDF page to remote OCR, including pages beyond the former sample limit', async () => {
    const fetchImpl = mockProvider();
    const output = await parser(fetchImpl).parse({
      ...input,
      fileName: 'digital.pdf',
      mimeType: 'application/pdf',
      fileData: await pdf(9),
    });
    const calls = fetchImpl.mock.calls.map((call) => JSON.parse(call[1]!.body as string));
    const ocrCalls = calls.filter((call) => call.model === 'deepseek-ocr-2');
    expect(ocrCalls).toHaveLength(9);
    expect(
      ocrCalls.every((call) =>
        call.messages[0].content[0].image_url.url.startsWith('data:image/png;base64,'),
      ),
    ).toBe(true);
    expect(ocrCalls[0].messages[0].content[1].text).toBe(
      '<|grounding|>Convert the document to markdown.',
    );
    expect(ocrCalls[0].reasoning_effort).toBeUndefined();
    expect(output.chunks?.map((chunk) => chunk.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(output.chunks?.[8]?.boundingBoxes[0]).toMatchObject({
      pageNumber: 9,
      layoutWidth: 1000,
    });
  });
  it('reads image text remotely and preserves figure crops with remote descriptions', async () => {
    const canvas = createCanvas(100, 100);
    const fetchImpl = mockProvider(
      `${grounding}\n<|ref|>image<|/ref|><|det|>[[100,400,900,900]]<|/det|>`,
    );
    const output = await parser(fetchImpl).parse({
      ...input,
      fileName: 'image.png',
      mimeType: 'image/png',
      fileData: Buffer.from(await canvas.encode('png')),
    });
    expect(output.chunks?.[0]?.images[0]?.data.length).toBeGreaterThan(0);
    expect(output.chunks?.[0]?.text).toContain('ZX987654');
    expect(output.chunks?.[0]?.text).toContain('annual revenue');
    expect(output.chunks?.[0]?.boundingBoxes).toHaveLength(2);
    expect(output.structuredElements?.[1]?.image).not.toBeNull();
  });
  it('preserves original-image coordinates after removing white margins', async () => {
    const canvas = createCanvas(400, 600);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 400, 600);
    ctx.fillStyle = 'black';
    ctx.fillRect(100, 200, 50, 20);
    const prepared = await prepareOcrImage({
      mimeType: 'image/png',
      data: Buffer.from(await canvas.encode('png')),
    });
    expect(prepared).toMatchObject({
      x: 52,
      y: 152,
      width: 146,
      height: 116,
      originalWidth: 400,
      originalHeight: 600,
    });
    const output = await parser(
      mockProvider('<|ref|>text<|/ref|><|det|>[[0,0,1000,1000]]<|/det|>Example'),
    ).parse({
      ...input,
      fileName: 'margin.png',
      mimeType: 'image/png',
      fileData: Buffer.from(await canvas.encode('png')),
    });
    expect(output.chunks?.[0]?.boundingBoxes[0]).toMatchObject({
      x0: 130,
      y0: (152 * 1000) / 600,
      x1: 495,
      y1: (268 * 1000) / 600,
    });
  });
  it('rejects ambiguous multi-frame image inputs rather than dropping pages', async () => {
    const fetchImpl = mockProvider();
    await expect(
      parser(fetchImpl).parse({ ...input, fileName: 'scan.tiff', mimeType: 'image/tiff' }),
    ).rejects.toThrow('multi-frame');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('accepts empty OCR only when remote vision confirms a blank page', async () => {
    const canvas = createCanvas(100, 100);
    const image = Buffer.from(await canvas.encode('png'));
    for (const blank of [true, false]) {
      const fetchImpl = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
        const body = JSON.parse(options!.body as string);
        return response(body.model === 'deepseek-ocr-2' ? '' : JSON.stringify({ blank }));
      });
      const parsing = parser(fetchImpl).parse({
        ...input,
        fileName: 'blank.png',
        mimeType: 'image/png',
        fileData: image,
      });
      if (blank) expect((await parsing).chunks).toEqual([]);
      else await expect(parsing).rejects.toThrow('missed visible page content');
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });
  it('does not silently bypass remote processing for empty text', async () => {
    const fetchImpl = mockProvider();
    const output = await parser(fetchImpl).parse({ ...input, fileData: Buffer.alloc(0) });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(output.chunks).toEqual([]);
  });
  it('rejects missing text, unknown chunk IDs, duplicated IDs and reordered source blocks', async () => {
    const base = mockProvider();
    for (const invalid of [
      { chunks: [] },
      { chunks: [['unknown']] },
      { chunks: [['remote:p1:r1:0', 'remote:p1:r0:0']] },
      { chunks: [['remote:p1:r0:0', 'remote:p1:r0:0']] },
    ]) {
      const fetchImpl = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
        const body = JSON.parse(options!.body as string);
        return body.messages[0].content.includes('Blocks: ')
          ? response(JSON.stringify(invalid))
          : base(url, options);
      });
      await expect(parser(fetchImpl).parse(input)).rejects.toThrow('Remote chunk plan');
    }
  });
  it('rejects source partitions that omit or duplicate text', async () => {
    for (const blocks of [
      [],
      [{ start: 1, end: 2, label: 'text' }],
      [
        { start: 0, end: 1, label: 'text' },
        { start: 0, end: 2, label: 'text' },
      ],
    ]) {
      const fetchImpl = vi.fn(async () => response(JSON.stringify({ blocks })));
      await expect(parser(fetchImpl).parse(input)).rejects.toThrow(/source content/);
    }
  });
  it('rejects truncated completions and redacts provider error bodies', async () => {
    for (const result of [
      response('sensitive extracted content', 'length'),
      new Response('sensitive extracted content', { status: 429 }),
    ]) {
      const fetchImpl = vi.fn(async () => result);
      try {
        await parser(fetchImpl).parse(input);
        throw new Error('Expected rejection');
      } catch (error) {
        expect((error as Error).message).toMatch(/incomplete|429/);
        expect((error as Error).message).not.toContain('sensitive');
      }
    }
  });
  it('fails unsupported binary files instead of accepting incomplete local extraction', async () => {
    const fetchImpl = mockProvider();
    await expect(
      parser(fetchImpl).parse({
        ...input,
        fileName: 'source.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).rejects.toThrow('Office conversion');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('grounding and source mapping', () => {
  it('keeps label/value regions, multiple-box extents and literal unboxed prefixes', () => {
    const regions = parseGroundedOcr(
      `Preface\n${grounding}\n<|ref|>text<|/ref|><|det|>[[10,20,30,40],[50,60,70,80]]<|/det|>Ada Example`,
    );
    expect(regions[0]).toMatchObject({ content: 'Preface', bbox_2d: null });
    expect(regions[2]?.bbox_2d).toEqual([10, 20, 70, 80]);
    expect(regions[1]?.content).toBe('Reference ZX987654');
  });
  it.each([
    'No boxes',
    '<|ref|>text<|/ref|><|det|>invalid<|/det|>value',
    '<|ref|>text<|/ref|><|det|>[[0,0,1001,20]]<|/det|>value',
    `${grounding}<|ref|>broken`,
  ])('fails malformed grounding without discarding evidence', (content) => {
    expect(() => parseGroundedOcr(content)).toThrow();
  });
  it('preserves safe table HTML and rejects invalid geometry', () => {
    const output = mapRemoteLayoutOutput({
      documentId: 'doc',
      response: remoteLayoutResponseSchema.parse({
        json_result: [
          [
            {
              index: 0,
              label: 'table',
              content: '| <script> |\n| --- |',
              bbox_2d: [10, 10, 90, 90],
            },
          ],
        ],
      }),
    });
    expect(output.chunks?.[0]?.tablesHtml[0]).not.toContain('<script>');
    expect(output.chunks?.[0]?.citationPrecision).toBe('box');
    expect(output.chunks?.[0]?.metadata.retrievalRepresentation).toBe('remote_block');
  });
});
