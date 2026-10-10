import { describe, expect, test } from 'vitest';
import type { Citation } from '../search/search.types.js';
import type { ChatContextExpansionChunk } from './chat.citation-utils.js';
import { buildLayoutContextCitations, MAX_LAYOUT_CONTEXT_LENGTH } from './chat.layout-context.js';
import { buildAnswerPrompt } from './chat.answer-prompt.js';

function chunk(index: number, snippet: string, page = 1): ChatContextExpansionChunk {
  const bbox = {
    pageNumber: page,
    x0: 100,
    y0: index * 10,
    x1: 300,
    y1: index * 10 + 8,
    layoutWidth: 1000,
    layoutHeight: 1000,
    system: 'test',
  };
  return {
    chunkId: `chk_${index}`,
    chunkIndex: index,
    snippet,
    pageStart: page,
    pageEnd: page,
    section: null,
    retrievalRepresentation: 'remote_block',
    sourceElementIds: [`region_${index}`],
    boundingBoxes: [bbox],
    citationPrecision: 'box',
    provenanceElements: [
      { elementId: `region_${index}`, text: snippet, pageNumber: page, bbox, sortIndex: index },
    ],
  };
}

function citation(source: ChatContextExpansionChunk): Citation {
  return {
    chunkId: source.chunkId,
    documentId: 'doc_test',
    documentVersionId: 'dvr_test',
    versionNumber: 1,
    vaultId: 'vlt_test',
    vaultName: 'Test',
    documentName: 'form.pdf',
    mimeType: 'application/pdf',
    pageStart: source.pageStart,
    pageEnd: source.pageEnd,
    section: null,
    snippet: source.snippet,
    retrievalRepresentation: 'remote_block',
    boundingBoxes: source.boundingBoxes ?? [],
    sourceElementIds: source.sourceElementIds,
    citationPrecision: 'box',
    assetType: 'text',
    tablesHtml: [],
    imageAssetIds: [],
    score: 0.9,
  };
}

describe('layout context assembly', () => {
  test('retains table and image assets when same-page hits are grouped', () => {
    const chunks = [chunk(0, 'Table row: item | 42'), chunk(1, 'Chart caption')];
    const table = {
      ...citation(chunks[0]!),
      assetType: 'table' as const,
      tablesHtml: ['<table><tr><td>42</td></tr></table>'],
      tableSourceElementIds: ['region_0'],
    };
    const image = {
      ...citation(chunks[1]!),
      assetType: 'image' as const,
      imageAssetIds: ['asset_chart'],
      imageAssets: [
        {
          assetId: 'asset_chart',
          sourceElementId: 'region_1',
          pageNumber: 1,
          caption: 'Chart caption',
        },
      ],
    };
    const [result] = buildLayoutContextCitations({
      citations: [table, image],
      chunks,
      question: 'Show the item',
    });
    expect(result?.tablesHtml).toEqual(table.tablesHtml);
    expect(result?.imageAssetIds).toEqual(image.imageAssetIds);
    expect(result?.imageAssets).toEqual(image.imageAssets);
  });
  test('keeps labels and split values in reading order beyond eight retrieval slots', () => {
    const chunks = [
      chunk(0, 'Reference'),
      ...Array.from({ length: 12 }, (_, i) => chunk(i + 1, `Note ${i}`)),
      chunk(13, 'ZX'),
      chunk(14, '987654'),
      chunk(15, 'Contact'),
      chunk(16, 'Ada'),
      chunk(17, 'Example'),
    ];
    const result = buildLayoutContextCitations({
      citations: chunks.slice(0, 8).map(citation),
      chunks,
      question: 'What is the reference and contact?',
    });
    expect(result).toHaveLength(1);
    const prompt = buildAnswerPrompt({
      question: 'What is the reference and contact?',
      citations: result,
      includeInlineCitations: true,
    });
    expect(prompt).toContain('ZX\n\n987654');
    expect(prompt).toContain('Ada\n\nExample');
    expect(result[0]?.contextChunks?.[0]?.sourceElementIds).toHaveLength(chunks.length);
    expect(result[0]?.boundingBoxes.length).toBeGreaterThan(0);
  });

  test('does not truncate a short parent at the old per-region excerpt limit', () => {
    const chunks = [
      chunk(0, 'Contract'),
      chunk(1, 'Supporting text '.repeat(90)),
      chunk(2, 'Total'),
      chunk(3, '123.45'),
    ];
    const result = buildLayoutContextCitations({
      citations: [citation(chunks[0]!)],
      chunks,
      question: 'Total?',
    });
    expect(
      buildAnswerPrompt({ question: 'Total?', citations: result, includeInlineCitations: true }),
    ).toContain('Total\n\n123.45');
  });

  test('includes geometric neighbors on long pages without concatenating unrelated values', () => {
    const chunks = Array.from({ length: 60 }, (_, i) =>
      chunk(i, `Paragraph ${i}: ${'x'.repeat(300)}`),
    );
    const anchor = chunks[40]!;
    anchor.snippet = 'Amount';
    const value = chunks[2]!;
    value.snippet = '456.78';
    value.boundingBoxes = [{ ...anchor.boundingBoxes![0]!, x0: 310, x1: 400 }];
    const result = buildLayoutContextCitations({
      citations: [citation(anchor)],
      chunks,
      question: 'Amount?',
    });
    const context = result[0]!.contextChunks![0]!;
    expect(context.snippet).toContain('456.78');
    expect(context.snippet).toContain('Paragraph 41');
    expect(context.snippet.length).toBeLessThanOrEqual(MAX_LAYOUT_CONTEXT_LENGTH);
    expect(context.snippet).not.toContain('Paragraph 59');
  });

  test('does not combine separate pages or change plain text citations', () => {
    const chunks = [chunk(0, 'Label'), chunk(1, 'Value'), chunk(2, 'Other page', 2)];
    const result = buildLayoutContextCitations({
      citations: [citation(chunks[0]!)],
      chunks,
      question: 'Label?',
    });
    expect(result[0]!.contextChunks![0]!.snippet).not.toContain('Other page');
    const plain = {
      ...citation(chunks[0]!),
      retrievalRepresentation: 'text',
      pageStart: null,
      pageEnd: null,
    };
    expect(buildLayoutContextCitations({ citations: [plain], chunks, question: 'Label?' })).toEqual(
      [plain],
    );
  });
});
