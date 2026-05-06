import type { StructuredElement, StructuredElementBbox } from './parsed-document.schema.js';
import { describe, expect, test } from 'vitest';
import { chunkMarkdown, chunkStructuredElements } from './chunker.js';

const PIXEL_BBOX: StructuredElementBbox = {
  x0: 10,
  y0: 20,
  x1: 100,
  y1: 80,
  layoutWidth: 612,
  layoutHeight: 792,
  system: 'PixelSpace',
};

function makeElement(overrides: Partial<StructuredElement> & { elementId: string }): StructuredElement {
  return {
    parentId: null,
    type: 'narrative',
    text: '',
    tableHtml: null,
    image: null,
    pageNumber: null,
    bbox: null,
    section: null,
    sectionPath: undefined,
    ...overrides,
  };
}

describe('chunkMarkdown', () => {
  test('returns empty array for empty / whitespace-only input', () => {
    expect(chunkMarkdown('', { documentId: 'doc_1' })).toEqual([]);
    expect(chunkMarkdown('   \n   ', { documentId: 'doc_1' })).toEqual([]);
  });

  test('produces deterministic ids scoped to documentId', () => {
    const md = '# Intro\nSome text.\n\n## Next\nMore text.';
    const chunks = chunkMarkdown(md, { documentId: 'doc_42' });

    expect(chunks.length).toBeGreaterThan(0);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.id).toBe(`doc_42:${i}`);
    }
  });

  test('captures section from nearest preceding heading', () => {
    const md = `# Introduction
This is the introduction.

## Results
Experimental results here.`;

    const chunks = chunkMarkdown(md, { documentId: 'd' });
    expect(chunks[0]!.section).toBe('Introduction');
    expect(chunks[0]!.sectionPath).toEqual(['Introduction']);
    // Results section may span one or more chunks
    const resultsChunks = chunks.filter((c) => c.section === 'Results');
    expect(resultsChunks.length).toBeGreaterThan(0);
  });

  test('constrains chunk.type to the bounded enum', () => {
    const md = `# Intro
First paragraph.

- list item 1
- list item 2

| a | b |
| - | - |
| 1 | 2 |`;

    const chunks = chunkMarkdown(md, { documentId: 'd' });
    for (const chunk of chunks) {
      expect(['heading', 'paragraph', 'table', 'list', 'other']).toContain(chunk.type);
    }
  });

  test('splits oversized sections into multiple chunks', () => {
    const longText = 'This is a sentence. '.repeat(300);
    const chunks = chunkMarkdown(longText, {
      documentId: 'd',
      maxChunkChars: 500,
      overlapChars: 50,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  test('stores index and token count in metadata', () => {
    const chunks = chunkMarkdown('Hello world.', { documentId: 'd' });
    expect(chunks[0]!.metadata.index).toBe(0);
    expect(typeof chunks[0]!.metadata.tokenCount).toBe('number');
    expect(chunks[0]!.metadata.tokenCount).toBeGreaterThan(0);
  });

  test('pageNumber is null when not provided', () => {
    const chunks = chunkMarkdown('# Title\nBody.', { documentId: 'd' });
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBeNull();
    }
  });

  test('creates single chunk for short content', () => {
    const chunks = chunkMarkdown('Hello world, this is a test document.', {
      documentId: 'd',
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.id).toBe('d:0');
    expect(chunks[0]!.text).toBe('Hello world, this is a test document.');
    expect(chunks[0]!.type).toBe('paragraph');
    expect(chunks[0]!.section).toBeNull();
    expect(chunks[0]!.sectionPath).toEqual([]);
  });

  test('splits markdown by headings into multiple chunks', () => {
    const md = `# Introduction
This is the intro.

## Chapter 1
Content of chapter 1.

## Chapter 2
Content of chapter 2.`;

    const chunks = chunkMarkdown(md, { documentId: 'd' });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.some((c) => c.text.includes('Introduction'))).toBe(true);
    expect(chunks.some((c) => c.text.includes('Chapter 1'))).toBe(true);
    expect(chunks.some((c) => c.text.includes('Chapter 2'))).toBe(true);
  });

  test('preserves code blocks within chunks', () => {
    const md = `## Code Example

Here is some code:

\`\`\`javascript
function hello() {
  console.log("hello");
}
\`\`\`

That was the code.`;

    const chunks = chunkMarkdown(md, { documentId: 'd' });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const allContent = chunks.map((c) => c.text).join('\n');
    expect(allContent).toContain('console.log');
  });

  test('populates new chunk fields with defaults for back-compat', () => {
    const chunks = chunkMarkdown('# Section\nBody text.', { documentId: 'd' });

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.pageStart).toBeNull();
      expect(chunk.pageEnd).toBeNull();
      expect(chunk.sectionPath).toEqual(['Section']);
      expect(chunk.boundingBoxes).toEqual([]);
      expect(chunk.sourceElementIds).toEqual([]);
      expect(chunk.parentElementId).toBeNull();
      expect(chunk.tablesHtml).toEqual([]);
      expect(chunk.images).toEqual([]);
      expect(chunk.citationPrecision).toBe('document');
      expect(chunk.enhancedContent).toBeNull();
      expect(chunk.originalText).toBe(chunk.text);
    }
  });
});

describe('chunkStructuredElements', () => {
  test('returns empty array for empty input', () => {
    expect(chunkStructuredElements([], { documentId: 'd' })).toEqual([]);
  });

  test('groups elements under the most recent title element', () => {
    const elements: StructuredElement[] = [
      makeElement({
        elementId: 'el-1',
        type: 'title',
        text: 'Methods',
        pageNumber: 1,
        bbox: PIXEL_BBOX,
      }),
      makeElement({
        elementId: 'el-2',
        type: 'narrative',
        text: 'We trained models on translation tasks.',
        pageNumber: 1,
        bbox: PIXEL_BBOX,
        parentId: 'el-1',
      }),
      makeElement({
        elementId: 'el-3',
        type: 'title',
        text: 'Results',
        pageNumber: 2,
        bbox: PIXEL_BBOX,
      }),
      makeElement({
        elementId: 'el-4',
        type: 'narrative',
        text: 'BLEU 28.4 on EN-DE.',
        pageNumber: 2,
        bbox: PIXEL_BBOX,
        parentId: 'el-3',
      }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.section).toBe('Methods');
    expect(chunks[0]?.sectionPath).toEqual(['Methods']);
    expect(chunks[0]?.text).toContain('translation tasks');
    expect(chunks[0]?.sourceElementIds).toEqual(['el-2']);
    expect(chunks[0]?.parentElementId).toBe('el-1');

    expect(chunks[1]?.section).toBe('Results');
    expect(chunks[1]?.sectionPath).toEqual(['Results']);
    expect(chunks[1]?.text).toContain('BLEU 28.4');
    expect(chunks[1]?.sourceElementIds).toEqual(['el-4']);
  });

  test('rolls page numbers up across multi-page sections', () => {
    const elements: StructuredElement[] = [
      makeElement({ elementId: 'el-1', type: 'title', text: 'Section', pageNumber: 1, bbox: PIXEL_BBOX }),
      makeElement({
        elementId: 'el-2',
        type: 'narrative',
        text: 'Page one body.',
        pageNumber: 1,
        bbox: PIXEL_BBOX,
      }),
      makeElement({
        elementId: 'el-3',
        type: 'narrative',
        text: 'Page two body.',
        pageNumber: 2,
        bbox: PIXEL_BBOX,
      }),
      makeElement({
        elementId: 'el-4',
        type: 'narrative',
        text: 'Page three body.',
        pageNumber: 3,
        bbox: PIXEL_BBOX,
      }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.pageStart).toBe(1);
    expect(chunks[0]?.pageEnd).toBe(3);
    expect(chunks[0]?.pageNumber).toBe(1);
    expect(chunks[0]?.boundingBoxes).toHaveLength(3);
    expect(chunks[0]?.boundingBoxes[0]?.pageNumber).toBe(1);
    expect(chunks[0]?.boundingBoxes[2]?.pageNumber).toBe(3);
    expect(chunks[0]?.citationPrecision).toBe('box');
  });

  test('prefers structured section lineage when title elements carry it', () => {
    const elements: StructuredElement[] = [
      makeElement({
        elementId: 'el-1',
        type: 'title',
        text: 'Assets',
        section: 'Financial Statements > Balance Sheet > Assets',
        sectionPath: ['Financial Statements', 'Balance Sheet', 'Assets'],
        pageNumber: 1,
        bbox: PIXEL_BBOX,
      }),
      makeElement({
        elementId: 'el-2',
        type: 'narrative',
        text: 'Cash and cash equivalents.',
        section: 'Financial Statements > Balance Sheet > Assets',
        sectionPath: ['Financial Statements', 'Balance Sheet', 'Assets'],
        pageNumber: 1,
        bbox: PIXEL_BBOX,
        parentId: 'el-1',
      }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.section).toBe('Financial Statements > Balance Sheet > Assets');
    expect(chunks[0]?.sectionPath).toEqual(['Financial Statements', 'Balance Sheet', 'Assets']);
  });

  test('stores asset provenance metadata for image and table elements', () => {
    const tableHtml = '<table><tbody><tr><td>42</td></tr></tbody></table>';
    const elements: StructuredElement[] = [
      makeElement({
        elementId: 'el-1',
        type: 'title',
        text: 'Results',
        pageNumber: 2,
        bbox: PIXEL_BBOX,
      }),
      makeElement({
        elementId: 'el-2',
        type: 'table',
        text: 'Metric | Value\nBLEU | 42',
        tableHtml,
        pageNumber: 2,
        bbox: PIXEL_BBOX,
        parentId: 'el-1',
      }),
      makeElement({
        elementId: 'el-3',
        type: 'image',
        text: 'Figure 1',
        image: { mimeType: 'image/png', data: Buffer.from('img') },
        pageNumber: 3,
        bbox: { ...PIXEL_BBOX, y0: 100, y1: 200 },
        parentId: 'el-1',
      }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.metadata.tableProvenance).toEqual([
      {
        elementId: 'el-2',
        pageNumber: 2,
        bbox: { pageNumber: 2, ...PIXEL_BBOX },
      },
    ]);
    expect(chunks[0]?.metadata.imageProvenance).toEqual([
      {
        elementId: 'el-3',
        caption: 'Figure 1',
        pageNumber: 3,
        bbox: {
          pageNumber: 3,
          ...PIXEL_BBOX,
          y0: 100,
          y1: 200,
        },
      },
    ]);
  });

  test('captures tables inside the section and surfaces their HTML on the chunk', () => {
    const tableHtml = '<table><tr><td>1</td></tr></table>';
    const elements: StructuredElement[] = [
      makeElement({ elementId: 'el-1', type: 'title', text: 'Results', pageNumber: 1, bbox: PIXEL_BBOX }),
      makeElement({
        elementId: 'el-2',
        type: 'narrative',
        text: 'See table below.',
        pageNumber: 1,
        bbox: PIXEL_BBOX,
      }),
      makeElement({
        elementId: 'el-3',
        type: 'table',
        text: 'A 1',
        tableHtml,
        pageNumber: 1,
        bbox: PIXEL_BBOX,
      }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.tablesHtml).toEqual([tableHtml]);
    expect(chunks[0]?.type).toBe('table');
    expect(chunks[0]?.originalText).toContain('See table below.');
    expect(chunks[0]?.originalText).toContain('A 1');
  });

  test('captures images inside the section and forwards their bytes', () => {
    const imageData = Buffer.from('image-bytes');
    const elements: StructuredElement[] = [
      makeElement({ elementId: 'el-1', type: 'title', text: 'Figure 1', pageNumber: 2, bbox: PIXEL_BBOX }),
      makeElement({
        elementId: 'el-2',
        type: 'narrative',
        text: 'Diagram caption.',
        pageNumber: 2,
        bbox: PIXEL_BBOX,
      }),
      makeElement({
        elementId: 'el-3',
        type: 'image',
        text: '',
        image: { mimeType: 'image/png', data: imageData },
        pageNumber: 2,
        bbox: PIXEL_BBOX,
      }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.images).toHaveLength(1);
    expect(chunks[0]?.images[0]?.data.toString()).toBe('image-bytes');
    expect(chunks[0]?.images[0]?.mimeType).toBe('image/png');
    expect(chunks[0]?.section).toBe('Figure 1');
  });

  test('drops empty sections (trailing title with no body)', () => {
    const elements: StructuredElement[] = [
      makeElement({ elementId: 'el-1', type: 'title', text: 'Methods', pageNumber: 1 }),
      makeElement({
        elementId: 'el-2',
        type: 'narrative',
        text: 'Some body.',
        pageNumber: 1,
      }),
      makeElement({ elementId: 'el-3', type: 'title', text: 'Conclusion', pageNumber: 2 }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.section).toBe('Methods');
  });

  test('downgrades citation precision to "page" when bbox is missing on any element', () => {
    const elements: StructuredElement[] = [
      makeElement({ elementId: 'el-1', type: 'title', text: 'S', pageNumber: 1 }),
      makeElement({ elementId: 'el-2', type: 'narrative', text: 'A', pageNumber: 1 }),
      makeElement({ elementId: 'el-3', type: 'narrative', text: 'B', pageNumber: 1 }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.citationPrecision).toBe('page');
    expect(chunks[0]?.boundingBoxes).toEqual([]);
  });

  test('downgrades citation precision to "document" when no element has a page number', () => {
    const elements: StructuredElement[] = [
      makeElement({ elementId: 'el-1', type: 'title', text: 'S' }),
      makeElement({ elementId: 'el-2', type: 'narrative', text: 'A' }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'd' });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.citationPrecision).toBe('document');
    expect(chunks[0]?.pageStart).toBeNull();
    expect(chunks[0]?.pageEnd).toBeNull();
    expect(chunks[0]?.pageNumber).toBeNull();
  });

  test('splits sections that exceed maxChunkChars into multiple chunks with overlap', () => {
    const longParagraph = 'Sentence. '.repeat(60);
    const elements: StructuredElement[] = [
      makeElement({ elementId: 'el-1', type: 'title', text: 'Long', pageNumber: 1 }),
      makeElement({
        elementId: 'el-2',
        type: 'narrative',
        text: longParagraph,
        pageNumber: 1,
      }),
      makeElement({
        elementId: 'el-3',
        type: 'narrative',
        text: longParagraph,
        pageNumber: 2,
      }),
      makeElement({
        elementId: 'el-4',
        type: 'narrative',
        text: longParagraph,
        pageNumber: 2,
      }),
    ];

    const chunks = chunkStructuredElements(elements, {
      documentId: 'd',
      maxChunkChars: 800,
      overlapChars: 200,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.section).toBe('Long');
    }
  });

  test('emits deterministic ids scoped to documentId', () => {
    const elements: StructuredElement[] = [
      makeElement({ elementId: 'el-1', type: 'title', text: 'S', pageNumber: 1 }),
      makeElement({ elementId: 'el-2', type: 'narrative', text: 'A', pageNumber: 1 }),
      makeElement({ elementId: 'el-3', type: 'title', text: 'T', pageNumber: 2 }),
      makeElement({ elementId: 'el-4', type: 'narrative', text: 'B', pageNumber: 2 }),
    ];

    const chunks = chunkStructuredElements(elements, { documentId: 'doc_42' });
    expect(chunks.map(chunk => chunk.id)).toEqual(['doc_42:0', 'doc_42:1']);
  });
});
