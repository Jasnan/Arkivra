import type { DoclingChunkResponse, DoclingClient } from '../../docling/docling.client.js';
import type { DoclingConvertResponse } from './docling.schema.js';
import type { ImageCaptioner } from '../image-captioner.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, test, vi } from 'vitest';
import { createDoclingParser } from './docling.parser.js';

const DOCILING_JSON_FIXTURE = {
  schema_name: 'DoclingDocument',
  body: {
    children: [{ cref: '#/texts/0' }],
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
      children: [{ cref: '#/tables/0' }, { cref: '#/pictures/0' }],
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

const SCANNED_TEXT_JSON_FIXTURE = {
  schema_name: 'DoclingDocument',
  body: {
    children: [
      { cref: '#/texts/0' },
      { cref: '#/texts/1' },
      { cref: '#/texts/2' },
      { cref: '#/texts/3' },
      { cref: '#/texts/4' },
    ],
  },
  pages: {
    1: {
      size: { width: 612, height: 792 },
    },
  },
  texts: [
    {
      self_ref: '#/texts/0',
      label: 'text',
      text: 'P<INDKUMAR<<VINEETH<<<<<<<<<<<<<<<<<<<',
      parent: { cref: '#/body' },
      children: [],
      prov: [{ page_no: 1, bbox: { l: 40, t: 40, r: 500, b: 60, coord_origin: 'TOPLEFT' } }],
    },
    {
      self_ref: '#/texts/1',
      label: 'text',
      text: 'HIRG TURIVIREPUBLIC OFINDIA',
      parent: { cref: '#/body' },
      children: [],
      prov: [{ page_no: 1, bbox: { l: 40, t: 80, r: 500, b: 100, coord_origin: 'TOPLEFT' } }],
    },
    {
      self_ref: '#/texts/2',
      label: 'text',
      text: 'q/Type P',
      parent: { cref: '#/body' },
      children: [],
      prov: [{ page_no: 1, bbox: { l: 40, t: 120, r: 180, b: 140, coord_origin: 'TOPLEFT' } }],
    },
    {
      self_ref: '#/texts/3',
      label: 'text',
      text: 'as/ Code IND',
      parent: { cref: '#/body' },
      children: [],
      prov: [{ page_no: 1, bbox: { l: 40, t: 160, r: 180, b: 180, coord_origin: 'TOPLEFT' } }],
    },
    {
      self_ref: '#/texts/4',
      label: 'text',
      text: '/Nationality R/INDIAN\n.Passport No',
      parent: { cref: '#/body' },
      children: [],
      prov: [{ page_no: 1, bbox: { l: 40, t: 200, r: 260, b: 240, coord_origin: 'TOPLEFT' } }],
    },
  ],
  tables: [],
  pictures: [],
  groups: [],
};

const ZERO_AREA_TEXT_JSON_FIXTURE = {
  schema_name: 'DoclingDocument',
  body: {
    children: [{ cref: '#/texts/0' }],
  },
  pages: {
    1: {
      size: { width: 595, height: 842 },
    },
  },
  texts: [
    {
      self_ref: '#/texts/0',
      label: 'text',
      text: 'VLM text with unusable provenance',
      parent: { cref: '#/body' },
      children: [],
      prov: [{ page_no: 1, bbox: { l: 0, t: 0, r: 0, b: 0, coord_origin: 'TOPLEFT' } }],
    },
  ],
  tables: [],
  pictures: [],
  groups: [],
};

function makeDenseScannedTextJsonFixture(textCount: number) {
  return {
    schema_name: 'DoclingDocument',
    body: {
      children: Array.from({ length: textCount }, (_, index) => ({ cref: `#/texts/${index}` })),
    },
    pages: {
      1: {
        size: { width: 612, height: 792 },
      },
    },
    texts: Array.from({ length: textCount }, (_, index) => ({
      self_ref: `#/texts/${index}`,
      label: 'text',
      text:
        index === 20
          ? 'Passport No. With Date and Place of Issue'
          : index === 21
            ? 'H5536221'
            : `Dense OCR text ${index}`,
      parent: { cref: '#/body' },
      children: [],
      prov: [
        {
          page_no: 1,
          bbox: {
            l: 40,
            t: 40 + index * 10,
            r: 240,
            b: 48 + index * 10,
            coord_origin: 'TOPLEFT',
          },
        },
      ],
    })),
    tables: [],
    pictures: [],
    groups: [],
  };
}

function makeChunkResponse(overrides: Partial<DoclingChunkResponse> = {}): DoclingChunkResponse {
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

async function createPdfBuffer(pageCount: number, textPages: number[] = []) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const textPageSet = new Set(textPages);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([612, 792]);
    const pageNumber = index + 1;

    if (textPageSet.has(pageNumber)) {
      for (let line = 0; line < 8; line += 1) {
        page.drawText(
          `Digital text page ${pageNumber} line ${line} with enough content for classification.`,
          {
            x: 72,
            y: 720 - line * 24,
            size: 12,
            font,
          },
        );
      }
    }
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
    expect(output.rawStructuredOutput).toMatchObject(DOCILING_JSON_FIXTURE);
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      canonical_text_source: 'docling',
    });
    expect(output.structuredElements).toBeDefined();
    expect(output.chunks).toBeDefined();
    expect(output.chunks?.map((chunk) => chunk.metadata.retrievalRepresentation)).toEqual([
      'docling_hybrid',
      'docling_hybrid',
    ]);
    expect(output.chunks?.map((chunk) => chunk.metadata.chunkingType)).toEqual([
      'docling_hybrid',
      'docling_hybrid',
    ]);
    expect(output.chunks?.[0]?.section).toBe('Title');
    expect(output.chunks?.[0]?.text).not.toContain('Document title: Balance Sheet');
    expect(output.chunks?.[0]?.text).toContain('Filename: file.pdf');
    expect(output.chunks?.[0]?.text).not.toContain('Chunk source: docling_hybrid');
    expect(
      output.chunks?.every((chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid'),
    ).toBe(true);
    expect(output).not.toHaveProperty('documentId');
  });

  test('adds fine-grained citation chunks for image OCR results', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          chunks: [
            {
              filename: 'back_page_passport.webp',
              chunk_index: 0,
              text: 'Passport OCR text with H5536221 and surrounding fields',
              raw_text: 'Passport OCR text with H5536221 and surrounding fields',
              doc_items: ['#/texts/0', '#/texts/1', '#/texts/2', '#/texts/3', '#/texts/4'],
              page_numbers: [1],
            },
          ],
          documents: [
            {
              kind: 'ExportResult' as const,
              content: {
                md_content: '',
                text_content: 'Passport OCR text with H5536221 and surrounding fields',
                json_content: SCANNED_TEXT_JSON_FIXTURE,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
        }),
      ),
    });

    const output = await parser.parse({
      documentId: 'doc_webp',
      fileName: 'back_page_passport.webp',
      mimeType: 'image/webp',
      fileData: Buffer.from('bytes'),
    });
    const hybridChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid',
      ) ?? [];
    const elementChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_element',
      ) ?? [];
    const elementPairChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_element_pair',
      ) ?? [];

    expect(hybridChunks).toHaveLength(1);
    expect(elementChunks).toHaveLength(5);
    expect(elementPairChunks).toHaveLength(4);
    expect(hybridChunks[0]?.sourceElementIds).toHaveLength(5);
    expect(hybridChunks[0]?.boundingBoxes).toHaveLength(5);
    expect(elementChunks[0]?.sourceElementIds).toHaveLength(1);
    expect(elementChunks[0]?.boundingBoxes).toHaveLength(1);
    expect(elementChunks[0]?.citationPrecision).toBe('box');
    expect(elementChunks[0]?.metadata.canonicalTextSource).toBe('docling');
    expect(elementChunks[0]?.metadata.processingPath).toBe('digital');
    expect(elementChunks[0]?.text).toContain('Filename: back_page_passport.webp');
    expect(elementPairChunks[0]?.sourceElementIds).toHaveLength(2);
    expect(elementPairChunks[0]?.boundingBoxes).toHaveLength(2);
    expect(output.warnings).not.toContain('docling.pipeline:vlm');
  });

  test('downgrades zero-area Docling provenance to page-level citations', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          chunks: [
            {
              filename: 'scan.pdf',
              chunk_index: 0,
              text: 'VLM text with unusable provenance',
              raw_text: 'VLM text with unusable provenance',
              doc_items: ['#/texts/0'],
              page_numbers: [1],
            },
          ],
          documents: [
            {
              kind: 'ExportResult' as const,
              content: {
                md_content: '',
                text_content: 'VLM text with unusable provenance',
                json_content: ZERO_AREA_TEXT_JSON_FIXTURE,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
        }),
      ),
      vlmEnabled: true,
      scanClassifier: {
        maxSampledPages: 1,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_zero_area',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(1),
    });
    const hybridChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid',
      ) ?? [];
    const elementChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_element',
      ) ?? [];

    expect(hybridChunks).toHaveLength(1);
    expect(hybridChunks[0]?.pageStart).toBe(1);
    expect(hybridChunks[0]?.boundingBoxes).toEqual([]);
    expect(hybridChunks[0]?.citationPrecision).toBe('page');
    expect(elementChunks).toEqual([]);
  });

  test('adds OCR layout sidecar chunks when VLM citations have unusable boxes', async () => {
    const vlmResponse = makeChunkResponse({
      chunks: [
        {
          filename: 'scan.pdf',
          chunk_index: 0,
          text: 'VLM extracted the passport number H5536221',
          raw_text: 'VLM extracted the passport number H5536221',
          doc_items: ['#/texts/0'],
          page_numbers: [1],
        },
      ],
      documents: [
        {
          kind: 'ExportResult' as const,
          content: {
            md_content: '# VLM Layout',
            text_content: 'VLM extracted the passport number H5536221',
            json_content: ZERO_AREA_TEXT_JSON_FIXTURE,
            html_content: '',
            doctags_content: '',
          },
          status: 'success',
          errors: [],
        },
      ],
    });
    const layoutResponse = makeChunkResponse({
      chunks: [
        {
          filename: 'scan.pdf',
          chunk_index: 0,
          text: 'Passport No. With Date and Place of Issue H5536221',
          raw_text: 'Passport No. With Date and Place of Issue H5536221',
          doc_items: ['#/texts/20', '#/texts/21'],
          page_numbers: [1],
        },
      ],
      documents: [
        {
          kind: 'ExportResult' as const,
          content: {
            md_content: '',
            text_content: 'Passport No. With Date and Place of Issue H5536221',
            json_content: makeDenseScannedTextJsonFixture(24),
            html_content: '',
            doctags_content: '',
          },
          status: 'success',
          errors: [],
        },
      ],
    });
    const chunkFile = vi.fn()
      .mockResolvedValueOnce(vlmResponse)
      .mockResolvedValueOnce(layoutResponse);
    const parser = createDoclingParser({
      doclingClient: {
        convertFile: vi.fn(),
        chunkFile,
      } as unknown as DoclingClient,
      vlmEnabled: true,
      scanClassifier: {
        maxSampledPages: 1,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_vlm_sidecar',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(1),
    });
    const layoutPair = output.chunks?.find(
      (chunk) =>
        chunk.metadata.retrievalRepresentation === 'docling_element_pair' &&
        chunk.sourceElementIds.includes('#/texts/20') &&
        chunk.sourceElementIds.includes('#/texts/21'),
    );

    expect(chunkFile).toHaveBeenCalledTimes(2);
    expect(chunkFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        convertOptions: expect.objectContaining({
          doOcr: false,
          pipeline: 'vlm',
        }),
      }),
    );
    expect(chunkFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
          ocrPreset: 'auto',
        },
      }),
    );
    expect(output.text).toBe('VLM extracted the passport number H5536221');
    expect(output.warnings).toContain('docling.vlm_layout_sidecar:ocr');
    expect(layoutPair).toBeDefined();
    expect(layoutPair?.citationPrecision).toBe('box');
    expect(layoutPair?.boundingBoxes).toHaveLength(2);
    expect(layoutPair?.metadata.doclingChunkInput).toBe('ocr_layout_sidecar');
  });

  test('interleaves fine-grained pairs early enough for dense OCR page expansion', async () => {
    const denseTextCount = 60;
    const denseJson = makeDenseScannedTextJsonFixture(denseTextCount);
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          chunks: [
            {
              filename: 'dense-passport.webp',
              chunk_index: 0,
              text: 'Dense OCR page with passport fields',
              raw_text: 'Dense OCR page with passport fields',
              doc_items: Array.from({ length: denseTextCount }, (_, index) => `#/texts/${index}`),
              page_numbers: [1],
            },
          ],
          documents: [
            {
              kind: 'ExportResult' as const,
              content: {
                md_content: '',
                text_content: 'Dense OCR page with passport fields',
                json_content: denseJson,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
        }),
      ),
    });

    const output = await parser.parse({
      documentId: 'doc_dense_webp',
      fileName: 'dense-passport.webp',
      mimeType: 'image/webp',
      fileData: Buffer.from('bytes'),
    });
    const targetPair = output.chunks?.find(
      (chunk) =>
        chunk.metadata.retrievalRepresentation === 'docling_element_pair' &&
        chunk.sourceElementIds.includes('#/texts/20') &&
        chunk.sourceElementIds.includes('#/texts/21'),
    );

    expect(targetPair).toBeDefined();
    expect(targetPair?.metadata.index).toBeLessThan(48);
    expect(targetPair?.originalText).toContain('Passport No. With Date and Place of Issue');
    expect(targetPair?.originalText).toContain('H5536221');
  });

  test('sends plain text files through Docling chunking', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({ doclingClient });

    const output = await parser.parse({
      documentId: 'doc_txt',
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      fileData: Buffer.from('First paragraph.\n\nSecond paragraph.'),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith({
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      fileData: Buffer.from('First paragraph.\n\nSecond paragraph.'),
      chunker: 'hybrid',
      convertOptions: {
        doOcr: true,
      },
    });
    expect(
      output.chunks?.filter((chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid'),
    ).toHaveLength(2);
  });

  test('maps Docling json_content into structured elements, tables, and images', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          documents: [
            {
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
            },
          ],
        }),
      ),
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
    expect(output.rawStructuredOutput).toMatchObject(DOCILING_JSON_FIXTURE);
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      canonical_text_source: 'docling',
    });
    expect(output.text).toContain('Balance Sheet');
    expect(output.text).toContain('Asset | Value');

    expect(
      output.chunks?.every((chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid'),
    ).toBe(true);
  });

  test('preserves table html and provenance on Docling hybrid chunks that reference tables', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          chunks: [
            {
              filename: 'file.pdf',
              chunk_index: 0,
              text: 'Table 1. Asset breakdown\nAsset Value\nCash 100',
              headings: ['Balance Sheet'],
              page_numbers: [1],
              doc_items: ['#/tables/0'],
            },
          ],
          documents: [
            {
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
            },
          ],
        }),
      ),
    });

    const output = await parser.parse({
      documentId: 'doc_hybrid_table',
      fileName: 'table.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    const hybridTableChunk = output.chunks?.find(
      (chunk) =>
        chunk.metadata.retrievalRepresentation === 'docling_hybrid' &&
        chunk.sourceElementIds.includes('#/tables/0'),
    );
    expect(hybridTableChunk).toBeDefined();
    expect(hybridTableChunk?.tablesHtml[0]).toContain('<table>');
    expect(hybridTableChunk?.text).toContain('[Structured tables]');
    expect(hybridTableChunk?.text).toContain('Row 1: Asset=Cash; Value=100');
    expect(hybridTableChunk?.metadata.tableProvenance).toEqual([
      expect.objectContaining({
        elementId: '#/tables/0',
        pageNumber: 1,
      }),
    ]);
  });

  test('strips data URIs and markdown images from extracted text', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          documents: [
            {
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
            },
          ],
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
          documents: [
            {
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
            },
          ],
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

  test('does not add page-level retrieval chunks when Docling hybrid chunks omit structured content', async () => {
    const convertedDocument = {
      kind: 'ExportResult' as const,
      content: {
        md_content: '',
        text_content: [
          'P<INDKUMAR<<VINEETH<<<<<<<<<<<<<<<<<<<',
          'HIRG TURIVIREPUBLIC OFINDIA',
          'q/Type P',
          'as/ Code IND',
          '/Nationality R/INDIAN',
          '.Passport No',
        ].join('\n\n'),
        json_content: SCANNED_TEXT_JSON_FIXTURE,
        html_content: '',
        doctags_content: '',
      },
      status: 'success',
      errors: [],
    };
    const hybridResponse = makeChunkResponse({
      chunks: [
        {
          filename: 'passport.pdf',
          chunk_index: 0,
          text: 'P<INDKUMAR<<VINEETH<<<<<<<<<<<<<<<<<<<',
          doc_items: ['#/texts/0'],
        },
      ],
      documents: [convertedDocument],
    });
    const chunkFile = vi.fn(async () => hybridResponse);
    const parser = createDoclingParser({
      doclingClient: {
        convertFile: vi.fn(),
        chunkFile,
      } as unknown as DoclingClient,
    });

    const output = await parser.parse({
      documentId: 'doc_passport',
      fileName: 'passport.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(chunkFile).toHaveBeenNthCalledWith(1, expect.objectContaining({ chunker: 'hybrid' }));
    expect(chunkFile).toHaveBeenCalledTimes(1);
    expect(output.chunks?.map((chunk) => chunk.metadata.retrievalRepresentation)).toEqual([
      'docling_hybrid',
    ]);
    expect(
      output.warnings.some((warning) =>
        warning.startsWith('docling.hybrid_structured_content_missing'),
      ),
    ).toBe(false);
    expect(output.text).toContain('Passport No');
  });

  test('uses Docling hybrid chunks only for scanned IDs, statements, invoices, and contracts', async () => {
    const tableDocument = (title: string, tableRef: string, rows: string[]) => ({
      schema_name: 'DoclingDocument',
      body: { children: [{ cref: '#/texts/0' }, { cref: tableRef }] },
      pages: { 1: { size: { width: 612, height: 792 } } },
      texts: [
        {
          self_ref: '#/texts/0',
          label: 'section_header',
          text: title,
          parent: { cref: '#/body' },
          children: [],
          prov: [{ page_no: 1, bbox: { l: 40, t: 40, r: 500, b: 70, coord_origin: 'TOPLEFT' } }],
        },
      ],
      tables: [
        {
          self_ref: tableRef,
          parent: { cref: '#/body' },
          children: [],
          captions: [],
          data: {
            table_cells: [
              {
                start_row_offset_idx: 0,
                end_row_offset_idx: 1,
                start_col_offset_idx: 0,
                end_col_offset_idx: 1,
                text: 'Field',
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
              ...rows.flatMap((row, index) => {
                const [field, value] = row.split('=');
                return [
                  {
                    start_row_offset_idx: index + 1,
                    end_row_offset_idx: index + 2,
                    start_col_offset_idx: 0,
                    end_col_offset_idx: 1,
                    text: field ?? '',
                  },
                  {
                    start_row_offset_idx: index + 1,
                    end_row_offset_idx: index + 2,
                    start_col_offset_idx: 1,
                    end_col_offset_idx: 2,
                    text: value ?? '',
                  },
                ];
              }),
            ],
          },
          prov: [{ page_no: 1, bbox: { l: 40, t: 120, r: 500, b: 260, coord_origin: 'TOPLEFT' } }],
        },
      ],
      pictures: [],
      groups: [],
    });
    const documentCases: Array<{
      name: string;
      jsonContent: Record<string, unknown>;
      expectedText: string;
      expectsTable: boolean;
    }> = [
      {
        name: 'scanned-id',
        jsonContent: {
          ...SCANNED_TEXT_JSON_FIXTURE,
          texts: [
            ...(SCANNED_TEXT_JSON_FIXTURE.texts as Array<Record<string, unknown>>),
            {
              self_ref: '#/texts/5',
              label: 'text',
              text: 'ID No X1234567',
              parent: { cref: '#/body' },
              children: [],
              prov: [
                { page_no: 1, bbox: { l: 40, t: 250, r: 260, b: 270, coord_origin: 'TOPLEFT' } },
              ],
            },
          ],
          body: {
            children: [
              { cref: '#/texts/0' },
              { cref: '#/texts/1' },
              { cref: '#/texts/2' },
              { cref: '#/texts/3' },
              { cref: '#/texts/4' },
              { cref: '#/texts/5' },
            ],
          },
        },
        expectedText: 'ID No X1234567',
        expectsTable: false,
      },
      {
        name: 'bank-statement',
        jsonContent: tableDocument('Bank Statement', '#/tables/0', [
          'Opening balance=100.00',
          'Closing balance=142.00',
        ]),
        expectedText: 'Closing balance',
        expectsTable: true,
      },
      {
        name: 'invoice',
        jsonContent: tableDocument('Invoice', '#/tables/0', [
          'Line item=Consulting',
          'Total=250.00',
        ]),
        expectedText: '250.00',
        expectsTable: true,
      },
      {
        name: 'insurance-contract',
        jsonContent: {
          schema_name: 'DoclingDocument',
          body: { children: [{ cref: '#/texts/0' }, { cref: '#/texts/1' }] },
          pages: { 1: { size: { width: 612, height: 792 } } },
          texts: [
            {
              self_ref: '#/texts/0',
              label: 'section_header',
              text: 'Insurance Contract',
              parent: { cref: '#/body' },
              children: [],
              prov: [
                { page_no: 1, bbox: { l: 40, t: 40, r: 500, b: 70, coord_origin: 'TOPLEFT' } },
              ],
            },
            {
              self_ref: '#/texts/1',
              label: 'text',
              text: 'Coverage applies after the deductible is paid.',
              parent: { cref: '#/body' },
              children: [],
              prov: [
                { page_no: 1, bbox: { l: 40, t: 90, r: 500, b: 130, coord_origin: 'TOPLEFT' } },
              ],
            },
          ],
          tables: [],
          pictures: [],
          groups: [],
        },
        expectedText: 'Coverage applies',
        expectsTable: false,
      },
    ];

    for (const documentCase of documentCases) {
      const parser = createDoclingParser({
        doclingClient: makeDoclingClient(
          makeChunkResponse({
            chunks: [
              {
                filename: `${documentCase.name}.pdf`,
                chunk_index: 0,
                text: documentCase.name,
                doc_items: ['#/texts/0'],
                page_numbers: [1],
              },
            ],
            documents: [
              {
                kind: 'ExportResult' as const,
                content: {
                  md_content: '',
                  text_content: documentCase.expectedText,
                  json_content: documentCase.jsonContent,
                  html_content: '',
                  doctags_content: '',
                },
                status: 'success',
                errors: [],
              },
            ],
          }),
        ),
      });

      const output = await parser.parse({
        documentId: `doc_${documentCase.name}`,
        fileName: `${documentCase.name}.pdf`,
        mimeType: 'application/pdf',
        fileData: Buffer.from('x'),
      });
      const representations =
        output.chunks?.map((chunk) => chunk.metadata.retrievalRepresentation) ?? [];

      expect(representations).toEqual(['docling_hybrid']);
      expect(output.text).toContain(documentCase.expectedText);
      expect(
        output.chunks?.every((chunk) => chunk.metadata.chunkingType === 'docling_hybrid'),
      ).toBe(true);
    }
  });

  test('does not add contextual retrieval text when structured mapping is unavailable', async () => {
    const convertedDocument = {
      kind: 'ExportResult' as const,
      content: {
        md_content: '',
        text_content: [
          'P<INDKUMAR<<VINEETH<<<<<<<<<<<<<<<<<<<',
          'HIRG TURIVIREPUBLIC OFINDIA',
          'q/Type P',
          'as/ Code IND',
          '/Nationality R/INDIAN',
          '.Passport No',
        ].join('\n\n'),
        json_content: null,
        html_content: '',
        doctags_content: '',
      },
      status: 'success',
      errors: [],
    };
    const incompleteResponse = makeChunkResponse({
      chunks: [
        {
          filename: 'passport.pdf',
          chunk_index: 0,
          text: 'P<INDKUMAR<<VINEETH<<<<<<<<<<<<<<<<<<<',
          doc_items: ['#/texts/0'],
        },
      ],
      documents: [convertedDocument],
    });
    const chunkFile = vi.fn(async () => incompleteResponse);
    const parser = createDoclingParser({
      doclingClient: {
        convertFile: vi.fn(),
        chunkFile,
      } as unknown as DoclingClient,
    });

    const output = await parser.parse({
      documentId: 'doc_passport_text',
      fileName: 'passport.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(chunkFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        chunker: 'hybrid',
        fileName: 'passport.pdf',
      }),
    );
    expect(chunkFile).toHaveBeenCalledTimes(1);
    expect(output.rawStructuredOutput?.schema_name).toBe('ArkivraDoclingProcessingDocument');
    expect(output.chunks).toHaveLength(1);
    expect(output.chunks?.[0]?.metadata.doclingChunker).toBe('hybrid');
    expect(output.chunks?.[0]?.metadata.doclingChunkInput).toBe('original_file');
    expect(output.chunks?.[0]?.metadata.retrievalRepresentation).toBe('docling_hybrid');
    expect(output.chunks?.[0]?.metadata.chunkingType).toBe('docling_hybrid');
  });

  test('tolerates Docling returning null for unrequested format fields', async () => {
    const rawResponse: DoclingChunkResponse = {
      chunks: [{ filename: 'f.pdf', chunk_index: 0, text: 'plain text only', doc_items: [] }],
      documents: [
        {
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
        },
      ],
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
          documents: [
            {
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
            },
          ],
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

  test('falls back to Docling hybrid chunk text when converted document text is empty', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          chunks: [
            {
              filename: 'scan.pdf',
              chunk_index: 0,
              text: 'Document title: Scan\n\nFallback contextual text',
              raw_text: 'Fallback raw OCR text',
              doc_items: ['#/texts/0'],
              page_numbers: [1],
            },
          ],
          documents: [
            {
              kind: 'ExportResult' as const,
              content: {
                md_content: '',
                text_content: '',
                json_content: null,
                html_content: '',
                doctags_content: '',
              },
              status: 'success',
              errors: [],
            },
          ],
        }),
      ),
    });

    const output = await parser.parse({
      documentId: 'doc_chunk_text',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.text).toBe('Fallback raw OCR text');
    expect(output.chunks?.map((chunk) => chunk.metadata.retrievalRepresentation)).toEqual([
      'docling_hybrid',
    ]);
  });

  test('falls back to markdown parsing and records a warning when structured mapping fails', async () => {
    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          documents: [
            {
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
            },
          ],
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
    expect(
      output.warnings.some((warning) => warning.startsWith('docling.structured_mapping_failed:')),
    ).toBe(true);
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
      doclingClient: makeDoclingClient(
        makeChunkResponse({
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
          documents: [
            {
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
            },
          ],
        }),
      ),
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
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          documents: [
            {
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
            },
          ],
        }),
      ),
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

  test('uses OCR for Docling chunking when the PDF needs it', async () => {
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

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
        },
      }),
    );
  });

  test('uses digital PDF path with Docling OCR disabled when sampled pages contain substantial text', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
      scanClassifier: {
        maxSampledPages: 3,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_digital_pdf',
      fileName: 'digital.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(3, [1, 2, 3]),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
        },
      }),
    );
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'digital',
      canonical_text_source: 'docling',
      docling_ocr_enabled: false,
    });
    expect(
      output.chunks?.every((chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid'),
    ).toBe(true);
  });

  test('does not route digital PDFs through VLM when VLM is enabled', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
      vlmEnabled: true,
      vlmPipelinePreset: 'glm_ocr',
      scanClassifier: {
        maxSampledPages: 3,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_digital_pdf_vlm_enabled',
      fileName: 'digital.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(3, [1, 2, 3]),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
        },
      }),
    );
    expect(output.warnings).not.toContain('docling.pipeline:vlm');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'digital',
      docling_ocr_enabled: false,
    });
    expect(output.rawStructuredOutput?.arkivra_processing).not.toHaveProperty('docling_pipeline');
  });

  test('routes image files through VLM when VLM is enabled', async () => {
    const doclingClient = makeDoclingClient(
      makeChunkResponse({
        chunks: [
          {
            filename: 'passport.webp',
            chunk_index: 0,
            text: 'Passport No. H5536221',
            raw_text: 'Passport No. H5536221',
            doc_items: ['#/texts/0'],
            page_numbers: [1],
          },
        ],
        documents: [
          {
            kind: 'ExportResult' as const,
            content: {
              md_content: '# VLM Image',
              text_content: 'Passport No. H5536221',
              json_content: SCANNED_TEXT_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          },
        ],
      }),
    );
    const parser = createDoclingParser({
      doclingClient,
      vlmEnabled: true,
    });

    const output = await parser.parse({
      documentId: 'doc_image_vlm',
      fileName: 'passport.webp',
      mimeType: 'image/webp',
      fileData: Buffer.from('bytes'),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
          pipeline: 'vlm',
          vlmPipelinePreset: 'default',
        },
      }),
    );
    expect(output.warnings).toContain('docling.pipeline:vlm');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'digital',
      docling_pipeline: 'vlm',
    });
  });

  test('uses mixed PDF path with Docling OCR enabled', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
      scanClassifier: {
        maxSampledPages: 4,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_mixed_pdf',
      fileName: 'mixed.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(4, [1, 2, 3]),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
        },
      }),
    );
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'mixed',
      canonical_text_source: 'docling',
      docling_ocr_enabled: true,
    });
  });

  test('uses Docling auto OCR for scan-heavy PDFs', async () => {
    const doclingClient = makeDoclingClient(
      makeChunkResponse({
        documents: [
          {
            kind: 'ExportResult' as const,
            content: {
              md_content: '# Docling Layout',
              text_content: 'Page one OCR text\n\nPage two OCR text',
              json_content: DOCILING_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          },
        ],
      }),
    );
    const parser = createDoclingParser({
      doclingClient,
      scanClassifier: {
        maxSampledPages: 2,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_scan_pdf',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(2),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
          ocrPreset: 'auto',
        },
      }),
    );
    expect(output.text).toBe('Page one OCR text\n\nPage two OCR text');
    expect(output.markdown).toContain('Docling Layout');
    expect(output.warnings).toContain('docling.ocr_preset:auto');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'scan-heavy',
      canonical_text_source: 'docling',
      docling_ocr_enabled: true,
      docling_ocr_preset: 'auto',
    });
    expect(output.rawStructuredOutput?.arkivra_processing).not.toHaveProperty('docling_pipeline');
    expect(
      output.chunks?.some((chunk) => chunk.metadata.retrievalRepresentation === 'docling_element'),
    ).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.canonicalTextSource === 'docling')).toBe(
      true,
    );
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrPreset === 'auto')).toBe(true);
    expect(output.chunks?.every((chunk) => !('doclingPipeline' in chunk.metadata))).toBe(true);
  });

  test('routes scan-heavy PDFs through Docling VLM when enabled', async () => {
    const doclingClient = makeDoclingClient(
      makeChunkResponse({
        documents: [
          {
            kind: 'ExportResult' as const,
            content: {
              md_content: '# VLM Layout',
              text_content: 'Page one VLM text\n\nPage two VLM text',
              json_content: DOCILING_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          },
        ],
      }),
    );
    const parser = createDoclingParser({
      doclingClient,
      vlmEnabled: true,
      scanClassifier: {
        maxSampledPages: 2,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_scan_pdf_vlm',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(2),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
          pipeline: 'vlm',
          vlmPipelinePreset: 'default',
        },
      }),
    );
    expect(output.text).toBe('Page one VLM text\n\nPage two VLM text');
    expect(output.markdown).toContain('VLM Layout');
    expect(output.warnings).toContain('docling.pipeline:vlm');
    expect(output.warnings).toContain('docling.vlm_pipeline_preset:default');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'scan-heavy',
      canonical_text_source: 'docling',
      docling_ocr_enabled: false,
      docling_ocr_preset: null,
      docling_pipeline: 'vlm',
      docling_vlm_pipeline_preset: 'default',
    });
    expect(
      output.chunks?.some((chunk) => chunk.metadata.retrievalRepresentation === 'docling_element'),
    ).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.canonicalTextSource === 'docling')).toBe(
      true,
    );
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrEnabled === false)).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrPreset === null)).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingPipeline === 'vlm')).toBe(true);
    expect(
      output.chunks?.every((chunk) => chunk.metadata.doclingVlmPipelinePreset === 'default'),
    ).toBe(true);
  });

  test('passes configured Docling VLM preset only on VLM-routed files', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
      vlmEnabled: true,
      vlmPipelinePreset: 'glm_ocr',
      scanClassifier: {
        maxSampledPages: 2,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_scan_pdf_vlm_custom_preset',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(2),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
          pipeline: 'vlm',
          vlmPipelinePreset: 'glm_ocr',
        },
      }),
    );
    expect(output.warnings).toContain('docling.vlm_pipeline_preset:glm_ocr');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      docling_pipeline: 'vlm',
      docling_vlm_pipeline_preset: 'glm_ocr',
    });
    expect(
      output.chunks?.every((chunk) => chunk.metadata.doclingVlmPipelinePreset === 'glm_ocr'),
    ).toBe(true);
  });

  test('does not retry scan-heavy PDFs through a second Docling path', async () => {
    const standardOcrResponse = makeChunkResponse({
      chunks: [
        {
          filename: 'scan.pdf',
          chunk_index: 0,
          text: 'Passport OCR text',
          raw_text: 'Passport OCR text',
          doc_items: ['#/texts/0'],
          page_numbers: [1],
        },
      ],
      documents: [
        {
          kind: 'ExportResult' as const,
          content: {
            md_content: '',
            text_content: 'Passport OCR text',
            json_content: SCANNED_TEXT_JSON_FIXTURE,
            html_content: '',
            doctags_content: '',
          },
          status: 'success',
          errors: [],
        },
      ],
    });
    const chunkFile = vi.fn().mockResolvedValueOnce(standardOcrResponse);
    const parser = createDoclingParser({
      doclingClient: {
        convertFile: vi.fn(),
        chunkFile,
      } as unknown as DoclingClient,
      scanClassifier: {
        maxSampledPages: 1,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_scan_retry',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(1),
    });

    expect(chunkFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
          ocrPreset: 'auto',
        },
      }),
    );
    expect(chunkFile).toHaveBeenCalledTimes(1);
    expect(output.text).toBe('Passport OCR text');
    expect(output.warnings).toContain('docling.ocr_preset:auto');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'scan-heavy',
      docling_ocr_enabled: true,
      docling_ocr_preset: 'auto',
      fallback_reason: null,
    });
    expect(output.rawStructuredOutput?.arkivra_processing).not.toHaveProperty('docling_pipeline');
    const hybridChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid',
      ) ?? [];
    const elementChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_element',
      ) ?? [];
    const elementPairChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_element_pair',
      ) ?? [];

    expect(hybridChunks).toHaveLength(1);
    expect(elementChunks).toHaveLength(5);
    expect(elementPairChunks).toHaveLength(4);
    expect(output.chunks?.[0]?.metadata).not.toHaveProperty('doclingPipeline');
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrEnabled === true)).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrPreset === 'auto')).toBe(true);
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
          doc_items: ['#/texts/0', '#/tables/0'],
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
    expect(chunkFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileName: 'large.part-001-of-003.pdf',
      }),
    );
    expect(chunkFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileName: 'large.part-002-of-003.pdf',
      }),
    );
    expect(chunkFile).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        fileName: 'large.part-003-of-003.pdf',
      }),
    );

    const hybridChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid',
      ) ?? [];

    expect(new Set(output.chunks?.map((chunk) => chunk.id)).size).toBe(output.chunks?.length);
    expect(hybridChunks).toHaveLength(5);
    expect(hybridChunks.map((chunk) => chunk.metadata.index)).toEqual([0, 1, 3, 4, 6]);
    expect(hybridChunks.map((chunk) => chunk.pageStart)).toEqual([1, 2, 3, 4, 5]);
    expect(hybridChunks[2]?.boundingBoxes[0]?.pageNumber).toBe(3);
    expect(hybridChunks[0]?.sourceElementIds).toEqual(['part-1:#/texts/0', 'part-1:#/tables/0']);
    expect(hybridChunks[2]?.sourceElementIds).toEqual(['part-2:#/texts/0', 'part-2:#/tables/0']);
    expect(hybridChunks[4]?.sourceElementIds).toEqual(['part-3:#/texts/0', 'part-3:#/tables/0']);
    expect(hybridChunks[2]?.metadata.tableProvenance).toEqual([
      expect.objectContaining({
        elementId: 'part-2:#/tables/0',
        pageNumber: 3,
        bbox: expect.objectContaining({ pageNumber: 3 }),
      }),
    ]);
    expect(
      output.chunks?.some((chunk) => chunk.metadata.retrievalRepresentation === 'docling_element'),
    ).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.canonicalTextSource === 'docling')).toBe(
      true,
    );
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
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileName: 'default-split.part-001-of-003.pdf',
      }),
    );
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileName: 'default-split.part-002-of-003.pdf',
      }),
    );
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        fileName: 'default-split.part-003-of-003.pdf',
      }),
    );
  });

  test('handles captioning errors gracefully', async () => {
    const mockCaptioner: ImageCaptioner = {
      name: 'mock-captioner',
      caption: vi.fn(async () => {
        throw new Error('Captioning service unavailable');
      }),
    };

    const parser = createDoclingParser({
      doclingClient: makeDoclingClient(
        makeChunkResponse({
          documents: [
            {
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
            },
          ],
        }),
      ),
      imageCaptioner: mockCaptioner,
    });

    const output = await parser.parse({
      documentId: 'doc_caption_error',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(output.warnings).toContain(
      'image_captioner.failed:#/pictures/0:Captioning service unavailable',
    );
    expect(output.chunks).toBeDefined();
  });
});
