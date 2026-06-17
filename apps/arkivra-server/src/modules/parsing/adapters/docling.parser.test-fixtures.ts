import type { DoclingChunkResponse, DoclingClient } from '../../docling/docling.client.js';
import type { DoclingConvertResponse } from './docling.schema.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { vi } from 'vitest';

export const DOCILING_JSON_FIXTURE = {
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

export const SCANNED_TEXT_JSON_FIXTURE = {
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

export const ZERO_AREA_TEXT_JSON_FIXTURE = {
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

export function makeDenseScannedTextJsonFixture(textCount: number) {
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

export function makeChunkResponse(overrides: Partial<DoclingChunkResponse> = {}): DoclingChunkResponse {
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

export function makeDoclingClient(response: DoclingChunkResponse): DoclingClient {
  return {
    convertFile: vi.fn(async () => response as unknown as DoclingConvertResponse),
    chunkFile: vi.fn(async () => response),
  } as unknown as DoclingClient;
}

export async function createPdfBuffer(pageCount: number, textPages: number[] = []) {
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
