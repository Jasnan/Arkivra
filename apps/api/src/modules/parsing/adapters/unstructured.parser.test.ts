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

  test('emits provenance-rich structuredElements alongside markdown without changing text/markdown outputs', async () => {
    const tableHtml =
      '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    const imageBase64 = Buffer.from('image-bytes').toString('base64');

    const parser = createUnstructuredParser({
      unstructuredClient: makeUnstructuredClient([
        {
          type: 'Title',
          element_id: 'title_1',
          text: 'Methods',
          metadata: {
            page_number: 1,
            coordinates: {
              points: [
                [10, 20],
                [110, 20],
                [110, 60],
                [10, 60],
              ],
              system: 'PixelSpace',
              layout_width: 612,
              layout_height: 792,
            },
          },
        },
        {
          type: 'NarrativeText',
          element_id: 'para_1',
          text: 'We trained models on translation tasks.',
          metadata: {
            page_number: 1,
            parent_id: 'title_1',
            coordinates: {
              points: [
                [10, 80],
                [510, 80],
                [510, 200],
                [10, 200],
              ],
              system: 'PixelSpace',
              layout_width: 612,
              layout_height: 792,
            },
          },
        },
        {
          type: 'Table',
          element_id: 'table_1',
          text: 'A B 1 2',
          metadata: {
            page_number: 2,
            parent_id: 'title_1',
            text_as_html: tableHtml,
          },
        },
        {
          type: 'Image',
          element_id: 'image_1',
          text: '',
          metadata: {
            page_number: 2,
            parent_id: 'title_1',
            image_base64: imageBase64,
            image_mime_type: 'image/png',
          },
        },
      ]),
    });

    const output = await parser.parse({
      documentId: 'doc_struct',
      fileName: 'paper.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    // Back-compat snapshot: existing outputs are byte-identical to the
    // pre-Phase-1 mapping rules.
    expect(output.markdown).toBe(
      [
        '# Methods',
        'We trained models on translation tasks.',
        tableHtml,
      ].join('\n\n'),
    );
    expect(output.text).toBe(
      'Methods\n\nWe trained models on translation tasks.\n\nA B 1 2',
    );
    expect(output.embeddedImages).toHaveLength(1);
    expect(output.embeddedImages?.[0]?.mimeType).toBe('image/png');

    // New: every element surfaces with the page/bbox/parent provenance.
    expect(output.structuredElements).toHaveLength(4);

    const structuredElements = output.structuredElements ?? [];
    const [title, narrative, table, image] = structuredElements;
    if (title === undefined || narrative === undefined || table === undefined || image === undefined) {
      throw new Error('expected four structured elements');
    }

    expect(title).toMatchObject({
      elementId: 'title_1',
      parentId: null,
      type: 'title',
      text: 'Methods',
      tableHtml: null,
      image: null,
      pageNumber: 1,
      section: 'Methods',
    });
    expect(title.bbox).toEqual({
      x0: 10,
      y0: 20,
      x1: 110,
      y1: 60,
      layoutWidth: 612,
      layoutHeight: 792,
      system: 'PixelSpace',
    });

    expect(narrative).toMatchObject({
      elementId: 'para_1',
      parentId: 'title_1',
      type: 'narrative',
      text: 'We trained models on translation tasks.',
      pageNumber: 1,
      section: 'Methods',
    });

    expect(table).toMatchObject({
      elementId: 'table_1',
      type: 'table',
      tableHtml,
      pageNumber: 2,
      section: 'Methods',
      bbox: null,
    });

    expect(image.type).toBe('image');
    expect(image.image?.mimeType).toBe('image/png');
    expect(image.image?.data.toString()).toBe('image-bytes');
    expect(image.pageNumber).toBe(2);
    expect(image.section).toBe('Methods');
  });

  test('synthesises element ids when Unstructured omits element_id', async () => {
    const parser = createUnstructuredParser({
      unstructuredClient: makeUnstructuredClient([
        {
          type: 'NarrativeText',
          text: 'No id provided.',
          metadata: { page_number: 1 },
        },
      ]),
    });

    const output = await parser.parse({
      documentId: 'doc_no_id',
      fileName: 'noid.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.structuredElements).toHaveLength(1);
    expect(output.structuredElements?.[0]?.elementId).toMatch(/^unstructured-/);
  });

  test('emits an empty structuredElements array on empty partition results', async () => {
    const parser = createUnstructuredParser({
      unstructuredClient: makeUnstructuredClient([]),
    });

    const output = await parser.parse({
      documentId: 'doc_struct_empty',
      fileName: 'empty.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.structuredElements).toEqual([]);
    expect(output.warnings).toEqual(['unstructured.no_elements']);
  });
});
