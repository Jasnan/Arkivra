import type { DoclingChunkResponse, DoclingClient } from '../../docling/docling.client.js';
import type { ImageCaptioner } from '../image-captioner.js';
import { describe, expect, test, vi } from 'vitest';
import { createDoclingParser } from './docling.parser.js';
import {
  DOCILING_JSON_FIXTURE,
  SCANNED_TEXT_JSON_FIXTURE,
  ZERO_AREA_TEXT_JSON_FIXTURE,
  createPdfBuffer,
  makeChunkResponse,
  makeDenseScannedTextJsonFixture,
  makeDoclingClient,
} from './docling.parser.test-fixtures.js';

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

  test('keeps image OCR retrieval hybrid-only while preserving Docling provenance', async () => {
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
    expect(elementChunks).toHaveLength(0);
    expect(elementPairChunks).toHaveLength(0);
    expect(hybridChunks[0]?.sourceElementIds).toHaveLength(5);
    expect(hybridChunks[0]?.boundingBoxes).toHaveLength(5);
    expect(hybridChunks[0]?.metadata.canonicalTextSource).toBe('docling');
    expect(hybridChunks[0]?.metadata.processingPath).toBe('digital');
    expect(hybridChunks[0]?.text).toContain('Filename: back_page_passport.webp');
    expect(output.structuredElements).toHaveLength(5);
    expect(output.structuredElements?.[0]).toMatchObject({
      elementId: '#/texts/0',
      pageNumber: 1,
      bbox: expect.objectContaining({ x0: 40, y0: 40 }),
    });
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
    expect(
      output.chunks?.every(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid',
      ),
    ).toBe(true);
    expect(output.structuredElements?.some(element => element.elementId === '#/texts/20')).toBe(
      true,
    );
    expect(output.structuredElements?.some(element => element.elementId === '#/texts/21')).toBe(
      true,
    );
  });

  test('preserves dense OCR elements without expanding the retrieval chunk set', async () => {
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
    expect(output.chunks).toHaveLength(1);
    expect(output.chunks?.[0]?.metadata.retrievalRepresentation).toBe('docling_hybrid');
    expect(output.chunks?.[0]?.sourceElementIds).toHaveLength(denseTextCount);
    expect(output.structuredElements).toHaveLength(denseTextCount);
    expect(output.structuredElements?.[20]?.text).toContain('Passport No. With Date and Place of Issue');
    expect(output.structuredElements?.[21]?.text).toContain('H5536221');
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
  });});
