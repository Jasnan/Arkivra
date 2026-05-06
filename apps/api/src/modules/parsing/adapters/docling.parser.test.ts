import type { DoclingClient } from '../../docling/docling.client.js';
import type { DoclingConvertResponse } from './docling.schema.js';
import { describe, expect, test, vi } from 'vitest';
import { createDoclingParser } from './docling.parser.js';

function makeDoclingResponse(
  overrides: Partial<DoclingConvertResponse> = {},
): DoclingConvertResponse {
  return {
    document: {
      md_content: '# Title\n\nParagraph one.\n\n## Section\n\nParagraph two.',
      text_content: 'Title\nParagraph one.\nSection\nParagraph two.',
      json_content: {},
      html_content: '',
      doctags_content: '',
    },
    status: 'success',
    processing_time: 1.5,
    errors: [],
    ...overrides,
  };
}

function makeDoclingClient(response: DoclingConvertResponse): DoclingClient {
  return {
    convertFile: vi.fn(async () => response),
  };
}

describe('docling parser adapter', () => {
  test('maps Docling response to internal ParserOutput', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(makeDoclingResponse()),
    });

    const output = await parser.parse({
      documentId: 'doc_1',
      fileName: 'file.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('bytes'),
    });

    expect(output.engine).toBe('docling');
    expect(output.engineVersion).toBe('v1');
    expect(output.markdown).toContain('Title');
    expect(output.text).toContain('Paragraph one');
    expect(output).not.toHaveProperty('chunks');
    expect(output).not.toHaveProperty('documentId');
  });

  test('strips data URIs and markdown images from extracted text', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeDoclingResponse({
          document: {
            md_content:
              '# Title\n\n![Preview](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)\n\nParagraph one.',
            text_content:
              'Title\n![Preview](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)\nParagraph one.',
            json_content: {},
            html_content: '',
            doctags_content: '',
          },
        }),
      ),
    });

    const output = await parser.parse({
      documentId: 'doc_i',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.text).not.toContain('data:image');
    expect(output.text).not.toContain('![Preview]');
    expect(output.markdown).not.toContain('data:image');
    expect(output.markdown).not.toContain('![Preview]');
    expect(output.embeddedImages).toHaveLength(1);
    expect(output.embeddedImages?.[0]?.mimeType).toBe('image/png');
  });

  test('collects Docling partial_success into warnings', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeDoclingResponse({ status: 'partial_success', errors: ['ocr warning'] }),
      ),
    });

    const output = await parser.parse({
      documentId: 'doc_w',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.warnings).toContain('docling.partial_success');
    expect(output.warnings).toContain('ocr warning');
  });

  test('tolerates Docling returning null for unrequested format fields', async () => {
    const rawResponse = {
      document: {
        md_content: null,
        text_content: 'plain text only',
        json_content: {},
        html_content: null,
        doctags_content: null,
      },
      status: 'success',
      processing_time: 0.1,
      errors: [],
    };

    const parser = createDoclingParser({
      doclingClient: {
        convertFile: vi.fn(async () => rawResponse),
      } as unknown as DoclingClient,
    });

    const output = await parser.parse({
      documentId: 'doc_null',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.text).toBe('plain text only');
    expect(output.markdown).toBe('');
  });

  test('falls back to markdown-derived text when text_content is empty', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeDoclingResponse({
          document: {
            md_content: '# Title\n\nParagraph one.\n\n- Bullet item',
            text_content: '',
            json_content: {},
            html_content: '',
            doctags_content: '',
          },
        }),
      ),
    });

    const output = await parser.parse({
      documentId: 'doc_md_only',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.markdown).toContain('# Title');
    expect(output.text).toBe('Title\n\nParagraph one.\n\nBullet item');
  });

  test('reports engine-version from adapter options', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(makeDoclingResponse()),
      engineVersion: 'v1.7.0',
    });

    const output = await parser.parse({
      documentId: 'doc_v',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.engineVersion).toBe('v1.7.0');
  });
});
