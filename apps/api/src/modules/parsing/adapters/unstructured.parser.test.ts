import type { UnstructuredClient, UnstructuredElement } from '../../unstructured/unstructured.client.js';
import { describe, expect, test, vi } from 'vitest';
import { createUnstructuredParser } from './unstructured.parser.js';

function makeUnstructuredClient(elements: UnstructuredElement[]): UnstructuredClient {
  return {
    partitionFile: vi.fn(async () => elements),
  };
}

describe('unstructured parser adapter', () => {
  test('maps Unstructured elements to internal ParserOutput without chunking', async () => {
    const parser = createUnstructuredParser({
      unstructuredClient: makeUnstructuredClient([
        {
          type: 'Title',
          element_id: 'title_1',
          text: 'Attention Is All You Need',
          metadata: { page_number: 1 },
        },
        {
          type: 'NarrativeText',
          element_id: 'para_1',
          text: 'The dominant sequence transduction models are based on recurrence.',
          metadata: { page_number: 1 },
        },
      ]),
    });

    const output = await parser.parse({
      documentId: 'doc_1',
      fileName: 'paper.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('bytes'),
    });

    expect(output.engine).toBe('unstructured');
    expect(output.engineVersion).toBe('api-v1');
    expect(output.markdown).toContain('# Attention Is All You Need');
    expect(output.text).toContain('dominant sequence transduction models');
    expect(output).not.toHaveProperty('chunks');
    expect(output).not.toHaveProperty('documentId');
  });

  test('preserves inferred table HTML in markdown while keeping plain table text', async () => {
    const parser = createUnstructuredParser({
      unstructuredClient: makeUnstructuredClient([
        {
          type: 'Table',
          element_id: 'table_1',
          text: 'A B 1 2',
          metadata: {
            text_as_html: '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
          },
        },
      ]),
    });

    const output = await parser.parse({
      documentId: 'doc_t',
      fileName: 'table.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.text).toBe('A B 1 2');
    expect(output.markdown).toContain('<table>');
  });

  test('extracts image payloads from element metadata for empty-text fallback', async () => {
    const parser = createUnstructuredParser({
      unstructuredClient: makeUnstructuredClient([
        {
          type: 'Image',
          element_id: 'image_1',
          text: '',
          metadata: {
            image_base64: Buffer.from('image-bytes').toString('base64'),
            image_mime_type: 'image/png',
          },
        },
      ]),
    });

    const output = await parser.parse({
      documentId: 'doc_img',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.embeddedImages).toHaveLength(1);
    expect(output.embeddedImages?.[0]?.mimeType).toBe('image/png');
    expect(output.embeddedImages?.[0]?.data.toString()).toBe('image-bytes');
  });

  test('reports an empty partition result as a parser warning', async () => {
    const parser = createUnstructuredParser({
      unstructuredClient: makeUnstructuredClient([]),
    });

    const output = await parser.parse({
      documentId: 'doc_empty',
      fileName: 'empty.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.warnings).toEqual(['unstructured.no_elements']);
  });

  test('reports engine-version from adapter options', async () => {
    const parser = createUnstructuredParser({
      unstructuredClient: makeUnstructuredClient([]),
      engineVersion: 'unstructured-api:0.1.2',
    });

    const output = await parser.parse({
      documentId: 'doc_v',
      fileName: 'empty.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.engineVersion).toBe('unstructured-api:0.1.2');
  });
});
