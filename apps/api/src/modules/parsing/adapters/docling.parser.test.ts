import type { DoclingChunkResponse, DoclingClient } from '../../docling/docling.client.js';
import type { DoclingConvertResponse } from './docling.schema.js';
import type { ImageCaptioner } from '../image-captioner.js';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, test, vi } from 'vitest';
import { createDoclingParser } from './docling.parser.js';

const DOCILING_JSON_FIXTURE = {
  schema_name: 'DoclingDocument',
  body: {
    children: [
      { cref: '#/texts/0' },
    ],
  },
  pages: {
    1: {
      size: { width: 612, height: 792 },
    },
    2: {
      size: { width: 612, height: 792 },
    },
  },
  texts: [
    {
      self_ref: '#/texts/0',
      label: 'section_header',
      text: 'Balance Sheet',
      parent: { cref: '#/body' },
      children: [
        { cref: '#/tables/0' },
        { cref: '#/pictures/0' },
      ],
      prov: [
        {
          page_no: 1,
          bbox: {
            l: 72,
            t: 54,
            r: 220,
            b: 90,
            coord_origin: 'TOPLEFT',
          },
        },
      ],
    },
    {
      self_ref: '#/texts/1',
      label: 'caption',
      text: 'Table 1. Asset breakdown',
      parent: { cref: '#/tables/0' },
      children: [],
      prov: [
        {
          page_no: 1,
          bbox: {
            l: 72,
            t: 320,
            r: 260,
            b: 340,
            coord_origin: 'TOPLEFT',
          },
        },
      ],
    },
    {
      self_ref: '#/texts/2',
      label: 'caption',
      text: 'Figure 1. Consolidated totals',
      parent: { cref: '#/pictures/0' },
      children: [],
      prov: [
        {
          page_no: 2,
          bbox: {
            l: 80,
            t: 420,
            r: 280,
            b: 440,
            coord_origin: 'TOPLEFT',
          },
        },
      ],
    },
  ],
  tables: [
    {
      self_ref: '#/tables/0',
      parent: { cref: '#/texts/0' },
      children: [],
      captions: [{ cref: '#/texts/1' }],
      data: {
        table_cells: [
          {
            start_row_offset_idx: 0,
            end_row_offset_idx: 1,
            start_col_offset_idx: 0,
            end_col_offset_idx: 1,
            text: 'Asset',
            column_header: true,
          },
          {
            start_row_offset_idx: 0,
            end_row_offset_idx: 1,
            start_col_offset_idx: 1,
            end_col_offset_idx: 2,
            text: 'Value',
            column_header: true,
          },
          {
            start_row_offset_idx: 1,
            end_row_offset_idx: 2,
            start_col_offset_idx: 0,
            end_col_offset_idx: 1,
            text: 'Cash',
          },
          {
            start_row_offset_idx: 1,
            end_row_offset_idx: 2,
            start_col_offset_idx: 1,
            end_col_offset_idx: 2,
            text: '100',
          },
        ],
      },
      prov: [
        {
          page_no: 1,
          bbox: {
            l: 72,
            t: 180,
            r: 340,
            b: 300,
            coord_origin: 'TOPLEFT',
          },
        },
      ],
    },
  ],
  pictures: [
    {
      self_ref: '#/pictures/0',
      parent: { cref: '#/texts/0' },
      children: [],
      captions: [{ cref: '#/texts/2' }],
      image: {
        mimetype: 'image/png',
        uri: 'data:image/png;base64,aW1hZ2UtYnl0ZXM=',
      },
      prov: [
        {
          page_no: 2,
          bbox: {
            l: 72,
            t: 360,
            r: 340,
            b: 520,
            coord_origin: 'TOPLEFT',
          },
        },
      ],
    },
  ],
  groups: [],
};

function makeChunkResponse(
  overrides: Partial<DoclingChunkResponse> = {},
): DoclingChunkResponse {
  return {
    chunks: [
      {
        filename: 'file.pdf',
        chunk_index: 0,
        text: 'Paragraph one.',
        headings: ['Title'],
        page_numbers: [1],
        doc_items: ['#/texts/0'],
      },
      {
        filename: 'file.pdf',
        chunk_index: 1,
        text: 'Paragraph two.',
        headings: ['Title', 'Section'],
        page_numbers: [1],
        doc_items: ['#/texts/1'],
      },
    ],
    documents: [
      {
        kind: 'ExportResult' as const,
        content: {
          md_content: '# Title\n\nParagraph one.\n\n## Section\n\nParagraph two.',
          text_content: 'Title\nParagraph one.\nSection\nParagraph two.',
          json_content: DOCILING_JSON_FIXTURE,
          html_content: '',
          doctags_content: '',
        },
        status: 'success',
        errors: [],
      },
    ],
    processing_time: 1.5,
    ...overrides,
  };
}

function makeDoclingClient(response: DoclingChunkResponse): DoclingClient {
  return {
    convertFile: vi.fn(async () => response as unknown as DoclingConvertResponse),
    chunkFile: vi.fn(async () => response),
  } as unknown as DoclingClient;
}

async function createPdfBuffer(pageCount: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([612, 792]);
  }

  return Buffer.from(await pdf.save());
}

describe('docling parser adapter', () => {
  test('maps Docling response to internal ParserOutput', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(makeChunkResponse()),
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
    expect(output.rawStructuredOutput).toEqual(DOCILING_JSON_FIXTURE);
    expect(output.structuredElements).toBeDefined();
    expect(output.chunks).toBeDefined();
    expect(output.chunks).toHaveLength(2);
    expect(output.chunks?.[0]?.section).toBe('Title');
    expect(output).not.toHaveProperty('documentId');
  });

  test('maps Docling json_content into structured elements, tables, and images', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(makeChunkResponse({
        documents: [{
          kind: 'ExportResult' as const,
          content: {
            md_content: '',
            text_content: '',
            json_content: DOCILING_JSON_FIXTURE,
            html_content: '',
            doctags_content: '',
          },
          status: 'success',
          errors: [],
        }],
      })),
    });

    const output = await parser.parse({
      documentId: 'doc_structured',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.structuredElements).toBeDefined();
    expect(output.structuredElements).toHaveLength(3);
    expect(output.structuredElements?.[0]).toMatchObject({
      elementId: '#/texts/0',
      type: 'title',
      text: 'Balance Sheet',
      section: 'Balance Sheet',
      pageNumber: 1,
      bbox: {
        x0: 72,
        y0: 54,
        x1: 220,
        y1: 90,
        layoutWidth: 612,
        layoutHeight: 792,
        system: 'PixelSpace',
      },
    });
    expect(output.structuredElements?.[1]).toMatchObject({
      elementId: '#/tables/0',
      type: 'table',
      section: 'Balance Sheet',
      pageNumber: 1,
    });
    expect(output.structuredElements?.[1]?.text).toContain('Table 1. Asset breakdown');
    expect(output.structuredElements?.[1]?.text).toContain('Cash | 100');
    expect(output.structuredElements?.[1]?.tableHtml).toContain('<table>');
    expect(output.structuredElements?.[2]).toMatchObject({
      elementId: '#/pictures/0',
      type: 'image',
      text: 'Figure 1. Consolidated totals',
      section: 'Balance Sheet',
      pageNumber: 2,
    });
    expect(output.structuredElements?.[2]?.image?.mimeType).toBe('image/png');
    expect(output.structuredElements?.[2]?.image?.data.toString()).toBe('image-bytes');
    expect(output.embeddedImages).toHaveLength(1);
    expect(output.rawStructuredOutput).toEqual(DOCILING_JSON_FIXTURE);
    expect(output.text).toContain('Balance Sheet');
    expect(output.text).toContain('Asset | Value');
  });

  test('strips data URIs and markdown images from extracted text', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          documents: [{
            kind: 'ExportResult' as const,
            content: {
              md_content:
                '# Title\n\n![Preview](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)\n\nParagraph one.',
              text_content:
                'Title\n![Preview](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA)\nParagraph one.',
              json_content: null,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          }],
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
        makeChunkResponse({
          documents: [{
            kind: 'ExportResult' as const,
            content: {
              md_content: '',
              text_content: '',
              json_content: DOCILING_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'partial_success',
            errors: ['ocr warning'],
          }],
        }),
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
    const rawResponse: DoclingChunkResponse = {
      chunks: [{ filename: 'f.pdf', chunk_index: 0, text: 'plain text only', doc_items: [] }],
      documents: [{
        kind: 'ExportResult' as const,
        content: {
          md_content: null as unknown as string,
          text_content: 'plain text only',
          json_content: null,
          html_content: null as unknown as string,
          doctags_content: null as unknown as string,
        },
        status: 'success',
        errors: [],
      }],
      processing_time: 0.1,
    };

    const parser = createDoclingParser({
      doclingClient: {
        convertFile: vi.fn(),
        chunkFile: vi.fn(async () => rawResponse),
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
        makeChunkResponse({
          documents: [{
            kind: 'ExportResult' as const,
            content: {
              md_content: '# Title\n\nParagraph one.\n\n- Bullet item',
              text_content: '',
              json_content: null,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          }],
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

  test('falls back to markdown parsing and records a warning when structured mapping fails', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          documents: [{
            kind: 'ExportResult' as const,
            content: {
              md_content: '# Title\n\nParagraph one.',
              text_content: '',
              json_content: 'not json',
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          }],
        }),
      ),
    });

    const output = await parser.parse({
      documentId: 'doc_bad_json',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.structuredElements).toBeUndefined();
    expect(output.text).toBe('Title\n\nParagraph one.');
    expect(output.warnings.some(warning => warning.startsWith('docling.structured_mapping_failed:'))).toBe(true);
  });

  test('reports engine-version from adapter options', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(makeChunkResponse()),
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

  test('generates image captions when imageCaptioner is provided', async () => {
    const mockCaptioner: ImageCaptioner = {
      name: 'mock-captioner',
      caption: vi.fn(async (image) => {
        if (image.mimeType === 'image/png') {
          return 'A chart showing financial data';
        }
        return null;
      }),
    };

    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(makeChunkResponse({
        chunks: [
          {
            filename: 'file.pdf',
            chunk_index: 0,
            text: 'Paragraph one.',
            headings: ['Title'],
            page_numbers: [2],
            doc_items: ['#/pictures/0'],
          },
        ],
        documents: [{
          kind: 'ExportResult' as const,
          content: {
            md_content: '',
            text_content: '',
            json_content: DOCILING_JSON_FIXTURE,
            html_content: '',
            doctags_content: '',
          },
          status: 'success',
          errors: [],
        }],
      })),
      imageCaptioner: mockCaptioner,
    });

    const output = await parser.parse({
      documentId: 'doc_caption',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(mockCaptioner.caption).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'image/png',
        data: Buffer.from('image-bytes'),
      }),
    );
    expect(output.chunks).toBeDefined();
    expect(output.chunks?.[0]?.text).toContain('A chart showing financial data');
  });

  test('works without imageCaptioner when not provided', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(makeChunkResponse({
        documents: [{
          kind: 'ExportResult' as const,
          content: {
            md_content: '',
            text_content: '',
            json_content: DOCILING_JSON_FIXTURE,
            html_content: '',
            doctags_content: '',
          },
          status: 'success',
          errors: [],
        }],
      })),
    });

    const output = await parser.parse({
      documentId: 'doc_no_caption',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.chunks).toBeDefined();
    expect(output.structuredElements).toBeDefined();
  });

  test('forces OCR off for Docling chunking', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
    });

    await parser.parse({
      documentId: 'doc_ocr_choice',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(expect.objectContaining({
      convertOptions: {
        doOcr: false,
      },
    }));
  });

  test('splits large PDFs before Docling and offsets merged page citations', async () => {
    const chunkFile = vi.fn(async ({ fileName }: { fileName: string }) => {
      const isLastPart = fileName.includes('part-003');
      const chunks: DoclingChunkResponse['chunks'] = [
        {
          filename: fileName,
          chunk_index: 0,
          text: `First page chunk from ${fileName}`,
          headings: ['Part'],
          page_numbers: [1],
          doc_items: ['#/texts/0'],
        },
      ];
      if (!isLastPart) {
        chunks.push({
          filename: fileName,
          chunk_index: 1,
          text: `Second page chunk from ${fileName}`,
          headings: ['Part'],
          page_numbers: [2],
          doc_items: ['#/texts/1'],
        });
      }

      return makeChunkResponse({
        chunks,
        documents: [
          {
            kind: 'ExportResult' as const,
            content: {
              md_content: `# ${fileName}`,
              text_content: fileName,
              json_content: DOCILING_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          },
        ],
      });
    });
    const doclingClient = {
      convertFile: vi.fn(),
      chunkFile,
    } as unknown as DoclingClient;
    const parser = createDoclingParser({
      doclingClient,
      splitPdfPageThreshold: 2,
      splitPdfChunkPages: 2,
    });

    const output = await parser.parse({
      documentId: 'doc_large_pdf',
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(5),
    });

    expect(chunkFile).toHaveBeenCalledTimes(3);
    expect(chunkFile).toHaveBeenNthCalledWith(1, expect.objectContaining({
      fileName: 'large.part-001-of-003.pdf',
    }));
    expect(chunkFile).toHaveBeenNthCalledWith(2, expect.objectContaining({
      fileName: 'large.part-002-of-003.pdf',
    }));
    expect(chunkFile).toHaveBeenNthCalledWith(3, expect.objectContaining({
      fileName: 'large.part-003-of-003.pdf',
    }));

    expect(output.chunks?.map(chunk => chunk.id)).toEqual([
      'doc_large_pdf:0',
      'doc_large_pdf:1',
      'doc_large_pdf:2',
      'doc_large_pdf:3',
      'doc_large_pdf:4',
    ]);
    expect(output.chunks?.map(chunk => chunk.pageStart)).toEqual([1, 2, 3, 4, 5]);
    expect(output.chunks?.[2]?.boundingBoxes[0]?.pageNumber).toBe(3);
    expect(output.rawStructuredOutput?.schema_name).toBe('ArkivraDoclingSplitDocument');
  });

  test('uses the default policy of splitting PDFs above 10 pages into 10-page parts', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
    });

    await parser.parse({
      documentId: 'doc_default_split',
      fileName: 'default-split.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(21),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledTimes(3);
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(1, expect.objectContaining({
      fileName: 'default-split.part-001-of-003.pdf',
    }));
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(2, expect.objectContaining({
      fileName: 'default-split.part-002-of-003.pdf',
    }));
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(3, expect.objectContaining({
      fileName: 'default-split.part-003-of-003.pdf',
    }));
  });

  test('handles captioning errors gracefully', async () => {
    const mockCaptioner: ImageCaptioner = {
      name: 'mock-captioner',
      caption: vi.fn(async () => {
        throw new Error('Captioning service unavailable');
      }),
    };

    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(makeChunkResponse({
        documents: [{
          kind: 'ExportResult' as const,
          content: {
            md_content: '',
            text_content: '',
            json_content: DOCILING_JSON_FIXTURE,
            html_content: '',
            doctags_content: '',
          },
          status: 'success',
          errors: [],
        }],
      })),
      imageCaptioner: mockCaptioner,
    });

    const output = await parser.parse({
      documentId: 'doc_caption_error',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.warnings).toContain('image_captioner.failed:#/pictures/0:Captioning service unavailable');
    expect(output.chunks).toBeDefined();
  });
});
