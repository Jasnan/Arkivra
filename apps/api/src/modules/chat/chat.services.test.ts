import { describe, expect, test } from 'vitest';
import type { Citation } from '../search/search.types.js';
import { buildAssistantMessage } from './chat-message.utils.js';
import {
  buildAnswerPrompt,
  buildChatMessageCitationRows,
  buildChunkLevelCitationsForChat,
  buildCitationContext,
  buildExpandedCitationForChat,
  buildManifestHybridSearchArgs,
  buildGlobalIntentSystemPrompt,
  getFrozenManifestContextAvailability,
  formatFollowUpAssistantMessage,
  isEmptyGeneratedChatContent,
  isLikelyTruncatedSingleTokenAnswer,
  normalizeChatGenerationError,
  rankCitationsForQuestion,
  sanitizeCitationsForMessagePersistence,
  shouldMaterializeConversationManifest,
} from './chat.services.js';

const citation: Citation = {
  chunkId: 'chk_1',
  documentId: 'doc_1',
  documentVersionId: 'dvr_1',
  versionNumber: 1,
  vaultId: 'vlt_1',
  vaultName: 'Operations',
  documentName: 'Policy.pdf',
  mimeType: 'application/pdf',
  pageStart: 2,
  pageEnd: 3,
  section: 'Retention',
  sectionPath: ['Records', 'Retention'],
  sourceElementIds: ['el_chunk_1', 'el_chunk_2'],
  tableSourceElementIds: ['el_table_1'],
  snippet: 'Records are retained for seven years.',
  boundingBoxes: [],
  citationPrecision: 'page',
  assetType: 'table',
  tablesHtml: ['<table><tr><td>Retention</td><td>7 years</td></tr></table>'],
  imageAssetIds: ['cas_1'],
  imageAssets: [
    {
      assetId: 'cas_1',
      sourceElementId: 'el_image_1',
      caption: 'Figure 1. Records retention timeline',
      pageNumber: 3,
    },
  ],
  score: 0.81,
};

describe('chat service helpers', () => {
  test('builds answer prompts from citation payloads only', () => {
    const prompt = buildAnswerPrompt({
      question: 'How long are records kept?',
      citations: [citation],
      includeInlineCitations: true,
    });

    expect(prompt).toContain('How long are records kept?');
    expect(prompt).toContain('Policy.pdf');
    expect(prompt).toContain('pages 2-3');
    expect(prompt).toContain('Records > Retention');
    expect(prompt).toContain('Records are retained for seven years.');
    expect(prompt).toContain('Table 1:\nRow 1: Retention | 7 years');
    expect(prompt).toContain('Figure 1 (page 3): Figure 1. Records retention timeline');
    expect(prompt).toContain('Respect explicit constraints in the question');
    expect(prompt).toContain('If the retrieved context is insufficient');
    expect(prompt).toContain('Evidence excerpt:');
    expect(prompt).not.toContain('Chunk 1:');
  });

  test('caps answer prompt retrieval context so generation has room to answer', () => {
    const citations = Array.from({ length: 8 }, (_, index) => ({
      ...citation,
      chunkId: `chk_large_${index}`,
      documentId: `doc_large_${index}`,
      documentVersionId: `dvr_large_${index}`,
      documentName: `Large Source ${index + 1}.pdf`,
      snippet: `Relevant identifier detail ${index + 1}. ${'A'.repeat(2400)}`,
      assetType: 'text' as const,
      tablesHtml: [],
      imageAssetIds: [],
      imageAssets: [],
    }));

    const prompt = buildAnswerPrompt({
      question: 'Extract identifiers for these people.',
      citations,
      includeInlineCitations: false,
    });

    expect(prompt.length).toBeLessThan(12_000);
    expect(prompt).toContain('Source 8: Large Source 8.pdf');
    expect(prompt).toContain('Relevant identifier detail 8.');
  });

  test('merges same-document hits into expanded page context for chat answers', () => {
    const expanded = buildExpandedCitationForChat({
      citations: [
        citation,
        {
          ...citation,
          chunkId: 'chk_2',
          pageStart: 3,
          pageEnd: 3,
          section: 'Refund',
          sourceElementIds: ['el_chunk_3'],
          snippet: 'The account refund amount is listed separately.',
          score: 0.9,
        },
      ],
      contextChunks: [
        {
          chunkId: 'ctx_1',
          chunkIndex: 2,
          pageStart: 2,
          pageEnd: 2,
          section: 'Assessment',
          snippet: 'The notice is for tax year 2018.',
        },
        {
          chunkId: 'ctx_2',
          chunkIndex: 3,
          pageStart: 3,
          pageEnd: 3,
          section: 'Refund',
          snippet: 'A refund of 3,133.65 is returned to the account.',
        },
      ],
    });

    expect(expanded?.pageStart).toBe(2);
    expect(expanded?.pageEnd).toBe(3);
    expect(expanded?.citationPrecision).toBe('page');
    expect(expanded?.score).toBe(0.9);
    expect(expanded?.sourceElementIds).toEqual(['el_chunk_1', 'el_chunk_2', 'el_chunk_3']);
    expect(expanded?.snippet).toContain('Page 2 - Assessment: The notice is for tax year 2018.');
    expect(expanded?.snippet).toContain(
      'Page 3 - Refund: A refund of 3,133.65 is returned to the account.',
    );
  });

  test('keeps retrieval score ahead of representation type when ranking citations', () => {
    const pageCitation: Citation = {
      ...citation,
      chunkId: 'chk_page',
      retrievalRepresentation: 'page',
      assetType: 'text',
      tablesHtml: [],
      snippet: 'Page text mentions invoice totals.',
      score: 0.9,
    };
    const tableCitation: Citation = {
      ...citation,
      chunkId: 'chk_table',
      retrievalRepresentation: 'table',
      assetType: 'table',
      snippet: 'Row 1: Invoice total=42.00',
      score: 0.2,
    };

    expect(
      rankCitationsForQuestion({
        question: 'What is the invoice total in the table?',
        citations: [pageCitation, tableCitation],
      }).map(item => item.chunkId),
    ).toEqual(['chk_page', 'chk_table']);
  });

  test('does not duplicate context chunks from the same source element after relevance ranking', () => {
    const expanded = buildExpandedCitationForChat({
      citations: [
        {
          ...citation,
          chunkId: 'ctx_table',
          retrievalRepresentation: 'table',
          sourceElementIds: ['el_table_1'],
          snippet: 'Row 1: Total=42.00',
          score: 0.2,
        },
        {
          ...citation,
          chunkId: 'ctx_page',
          retrievalRepresentation: 'page',
          sourceElementIds: ['el_table_1'],
          snippet: 'The page repeats Row 1: Total=42.00 with surrounding text.',
          score: 0.9,
        },
      ],
      contextChunks: [
        {
          chunkId: 'ctx_page',
          chunkIndex: 2,
          retrievalRepresentation: 'page',
          pageStart: 2,
          pageEnd: 2,
          section: 'Invoice',
          sourceElementIds: ['el_table_1'],
          snippet: 'The page repeats Row 1: Total=42.00 with surrounding text.',
          retrievalScore: 0.9,
          retrievalRank: 0,
        },
        {
          chunkId: 'ctx_table',
          chunkIndex: 3,
          retrievalRepresentation: 'table',
          pageStart: 2,
          pageEnd: 2,
          section: 'Invoice',
          sourceElementIds: ['el_table_1'],
          snippet: 'Row 1: Total=42.00',
          retrievalScore: 0.2,
          retrievalRank: 1,
        },
      ],
    });

    expect(expanded?.snippet).toContain(
      'Page 2 - Invoice: The page repeats Row 1: Total=42.00 with surrounding text.',
    );
    expect(expanded?.snippet).not.toContain('Page 2 - Invoice: Row 1: Total=42.00');
  });

  test('builds separate citation previews for chunks from the same document', () => {
    const taxdooBox = {
      pageNumber: 1,
      x0: 20,
      y0: 100,
      x1: 240,
      y1: 120,
      layoutWidth: 600,
      layoutHeight: 800,
      system: 'PixelSpace',
    };
    const hermesBox = {
      pageNumber: 1,
      x0: 20,
      y0: 300,
      x1: 260,
      y1: 320,
      layoutWidth: 600,
      layoutHeight: 800,
      system: 'PixelSpace',
    };
    const taxdooCitation: Citation = {
      ...citation,
      chunkId: 'chk_taxdoo',
      retrievalRepresentation: 'docling_hybrid',
      pageStart: 1,
      pageEnd: 1,
      section: 'Taxdoo, Hamburg - Senior Software Engineer',
      sourceElementIds: ['#/texts/6'],
      snippet: 'Dec 2019 - today Senior Software Engineer at Taxdoo.',
      boundingBoxes: [taxdooBox],
      citationPrecision: 'box',
      score: 0.9,
    };
    const hermesCitation: Citation = {
      ...citation,
      chunkId: 'chk_hermes',
      retrievalRepresentation: 'docling_hybrid',
      pageStart: 1,
      pageEnd: 1,
      section: 'Hermes BorderGuru, Hamburg - Software Engineer',
      sourceElementIds: ['#/texts/15'],
      snippet: 'Dec 2017 - Nov 2019 Software Engineer at Hermes BorderGuru.',
      boundingBoxes: [hermesBox],
      citationPrecision: 'box',
      score: 0.4,
    };

    const chunkLevelCitations = buildChunkLevelCitationsForChat({
      question: 'what was the company previous to this one?',
      citations: [taxdooCitation, hermesCitation],
      contextChunks: [
        {
          chunkId: 'chk_taxdoo',
          chunkIndex: 1,
          retrievalRepresentation: 'docling_hybrid',
          pageStart: 1,
          pageEnd: 1,
          section: taxdooCitation.section,
          sourceElementIds: taxdooCitation.sourceElementIds,
          boundingBoxes: [taxdooBox],
          citationPrecision: 'box',
          snippet: taxdooCitation.snippet,
          retrievalScore: taxdooCitation.score,
          retrievalRank: 0,
        },
        {
          chunkId: 'chk_hermes',
          chunkIndex: 2,
          retrievalRepresentation: 'docling_hybrid',
          pageStart: 1,
          pageEnd: 1,
          section: hermesCitation.section,
          sourceElementIds: hermesCitation.sourceElementIds,
          boundingBoxes: [hermesBox],
          citationPrecision: 'box',
          snippet: hermesCitation.snippet,
          retrievalScore: hermesCitation.score,
          retrievalRank: 1,
        },
      ],
    });

    expect(chunkLevelCitations.map((item) => item.chunkId)).toEqual([
      'chk_taxdoo',
      'chk_hermes',
    ]);
    expect(chunkLevelCitations[0]).toMatchObject({
      section: 'Taxdoo, Hamburg - Senior Software Engineer',
      boundingBoxes: [taxdooBox],
      citationPrecision: 'box',
    });
    expect(chunkLevelCitations[1]).toMatchObject({
      section: 'Hermes BorderGuru, Hamburg - Software Engineer',
      boundingBoxes: [hermesBox],
      citationPrecision: 'box',
    });
    expect(chunkLevelCitations[0]?.contextChunks).toBeUndefined();
    expect(chunkLevelCitations[1]?.contextChunks).toBeUndefined();
  });

  test('uses a query-matching fine Docling chunk as the displayed citation base', () => {
    const broadHybrid: Citation = {
      ...citation,
      chunkId: 'chk_hybrid',
      retrievalRepresentation: 'docling_hybrid',
      pageStart: 1,
      pageEnd: 1,
      sourceElementIds: ['#/texts/11', '#/texts/12', '#/texts/13'],
      snippet: 'PIN: 627114 Passport No. With Date and Place of Issue H5536221 29/04/2009',
      boundingBoxes: [
        {
          pageNumber: 1,
          x0: 10,
          y0: 10,
          x1: 100,
          y1: 20,
          layoutWidth: 600,
          layoutHeight: 800,
          system: 'PixelSpace',
        },
        {
          pageNumber: 1,
          x0: 10,
          y0: 30,
          x1: 220,
          y1: 40,
          layoutWidth: 600,
          layoutHeight: 800,
          system: 'PixelSpace',
        },
        {
          pageNumber: 1,
          x0: 10,
          y0: 50,
          x1: 100,
          y1: 60,
          layoutWidth: 600,
          layoutHeight: 800,
          system: 'PixelSpace',
        },
      ],
      citationPrecision: 'box',
      score: 0.95,
    };
    const labelBox = {
      pageNumber: 1,
      x0: 10,
      y0: 30,
      x1: 220,
      y1: 40,
      layoutWidth: 600,
      layoutHeight: 800,
      system: 'PixelSpace',
    };
    const pinBox = {
      pageNumber: 1,
      x0: 10,
      y0: 10,
      x1: 260,
      y1: 20,
      layoutWidth: 600,
      layoutHeight: 800,
      system: 'PixelSpace',
    };
    const valueBox = {
      pageNumber: 1,
      x0: 10,
      y0: 50,
      x1: 100,
      y1: 60,
      layoutWidth: 600,
      layoutHeight: 800,
      system: 'PixelSpace',
    };
    const expanded = buildExpandedCitationForChat({
      question: 'what is the passport number?',
      citations: [broadHybrid],
      contextChunks: [
        {
          chunkId: 'chk_hybrid',
          chunkIndex: 0,
          retrievalRepresentation: 'docling_hybrid',
          pageStart: 1,
          pageEnd: 1,
          sourceElementIds: broadHybrid.sourceElementIds,
          boundingBoxes: broadHybrid.boundingBoxes,
          citationPrecision: 'box',
          section: null,
          snippet: broadHybrid.snippet,
          retrievalScore: 0.95,
          retrievalRank: 0,
        },
        {
          chunkId: 'chk_previous_pair',
          chunkIndex: 28,
          retrievalRepresentation: 'docling_element_pair',
          pageStart: 1,
          pageEnd: 1,
          sourceElementIds: ['#/texts/11', '#/texts/12'],
          boundingBoxes: [pinBox, labelBox],
          citationPrecision: 'box',
          section: null,
          snippet: 'PIN: 627114 Passport No. With Date and Place of Issue',
        },
        {
          chunkId: 'chk_passport_pair',
          chunkIndex: 29,
          retrievalRepresentation: 'docling_element_pair',
          pageStart: 1,
          pageEnd: 1,
          sourceElementIds: ['#/texts/12', '#/texts/13'],
          boundingBoxes: [labelBox, valueBox],
          citationPrecision: 'box',
          section: null,
          snippet: 'Passport No. With Date and Place of Issue H5536221',
        },
      ],
    });

    expect(expanded?.chunkId).toBe('chk_passport_pair');
    expect(expanded?.retrievalRepresentation).toBe('docling_element_pair');
    expect(expanded?.citationPrecision).toBe('box');
    expect(expanded?.sourceElementIds).toEqual(['#/texts/12', '#/texts/13']);
    expect(expanded?.boundingBoxes).toEqual([labelBox, valueBox]);
    expect(expanded?.snippet).toBe('Passport No. With Date and Place of Issue H5536221');
  });

  test('prioritizes citations that match explicit year constraints', () => {
    const citation2019: Citation = {
      ...citation,
      chunkId: 'chk_2019',
      documentId: 'doc_2019',
      documentName: 'Tax notice 2019',
      snippet: 'A refund of 179.58 is due for 2019.',
    };
    const citation2018: Citation = {
      ...citation,
      chunkId: 'chk_2018',
      documentId: 'doc_2018',
      documentName: 'Tax notice 2018',
      snippet: 'The 2018 notice shows a refund to the account.',
    };

    expect(
      rankCitationsForQuestion({
        question: 'Is there a tax refund for 2018?',
        citations: [citation2019, citation2018],
      }).map((item) => item.documentId),
    ).toEqual(['doc_2018', 'doc_2019']);
  });

  test('keeps retrieval relevance ahead of concrete query terms after broad retrieval', () => {
    const broadMatch: Citation = {
      ...citation,
      chunkId: 'chk_application',
      documentId: 'doc_application',
      documentName: 'APPLICATION_PASSPORT_ARN.pdf',
      snippet: 'Passport application instructions and family details.',
      score: 0.9,
    };
    const exactPersonPassport: Citation = {
      ...citation,
      chunkId: 'chk_person_passport',
      documentId: 'doc_person_passport',
      documentName: 'jasnan_passport.pdf',
      snippet: 'Passport details for the requested person.',
      score: 0.4,
    };
    const otherIdentityDocument: Citation = {
      ...citation,
      chunkId: 'chk_other_identity',
      documentId: 'doc_other_identity',
      documentName: 'aadhaar.pdf',
      snippet: 'Identity document details.',
      score: 0.8,
    };

    expect(
      rankCitationsForQuestion({
        question: 'Give me passport ids and expiry dates for Jasnan',
        citations: [broadMatch, otherIdentityDocument, exactPersonPassport],
      }).map((item) => item.documentId),
    ).toEqual(['doc_application', 'doc_other_identity', 'doc_person_passport']);
  });

  test('preserves top-ranked expanded chunks through prompt construction', () => {
    const tableCitation: Citation = {
      ...citation,
      chunkId: 'chk_table',
      retrievalRepresentation: 'table',
      assetType: 'table',
      pageStart: 1,
      pageEnd: 1,
      section: 'Metadata',
      snippet: 'Miscellaneous metadata',
      tablesHtml: [],
      score: 0.2,
    };
    const hybridCitation: Citation = {
      ...citation,
      chunkId: 'chk_hybrid',
      retrievalRepresentation: 'docling_hybrid',
      assetType: 'text',
      pageStart: 1,
      pageEnd: 1,
      section: 'Partial extraction',
      snippet: 'Partial extraction',
      tablesHtml: [],
      score: 0.4,
    };
    const pageCitation: Citation = {
      ...citation,
      chunkId: 'chk_page',
      retrievalRepresentation: 'page',
      assetType: 'text',
      pageStart: 1,
      pageEnd: 1,
      section: 'Page 1',
      snippet: 'Passport Number: X1234567 Name: Jane Doe Expiry Date: 01 Jan 2035',
      tablesHtml: [],
      score: 0.95,
    };
    const expanded = buildExpandedCitationForChat({
      citations: [tableCitation, hybridCitation, pageCitation],
      contextChunks: [
        {
          chunkId: 'chk_table',
          chunkIndex: 1,
          retrievalRepresentation: 'table',
          pageStart: 1,
          pageEnd: 1,
          section: 'Metadata',
          snippet: 'Miscellaneous metadata',
          retrievalScore: 0.2,
          retrievalRank: 0,
        },
        {
          chunkId: 'chk_hybrid',
          chunkIndex: 2,
          retrievalRepresentation: 'docling_hybrid',
          pageStart: 1,
          pageEnd: 1,
          section: 'Partial extraction',
          snippet: 'Partial extraction',
          retrievalScore: 0.4,
          retrievalRank: 1,
        },
        {
          chunkId: 'chk_page',
          chunkIndex: 3,
          retrievalRepresentation: 'page',
          pageStart: 1,
          pageEnd: 1,
          section: 'Page 1',
          snippet: 'Passport Number: X1234567 Name: Jane Doe Expiry Date: 01 Jan 2035',
          retrievalScore: 0.95,
          retrievalRank: 2,
        },
      ],
    });

    expect(expanded?.contextChunks?.map((chunk) => chunk.chunkId)).toEqual([
      'chk_page',
      'chk_hybrid',
      'chk_table',
    ]);

    const prompt = buildAnswerPrompt({
      question: 'What is the passport number and expiry date? And whose passport is this?',
      citations: expanded === null ? [] : [expanded],
      includeInlineCitations: false,
    });
    const pageIndex = prompt.indexOf('Passport Number: X1234567');
    const tableIndex = prompt.indexOf('Miscellaneous metadata');

    expect(prompt).toContain('Passport Number: X1234567');
    expect(prompt).toContain('Name: Jane Doe');
    expect(prompt).toContain('Expiry Date: 01 Jan 2035');
    expect(prompt).toContain('Page: page 1');
    expect(prompt).toContain('Representation: page');
    expect(pageIndex).toBeGreaterThan(-1);
    expect(tableIndex).toBeGreaterThan(-1);
    expect(pageIndex).toBeLessThan(tableIndex);
  });

  test('builds compare intent system prompts for guided follow-ups', () => {
    const prompt = buildGlobalIntentSystemPrompt('compare');

    expect(prompt).toContain('You are Arkivra, an AI assistant');
    expect(prompt).toContain('User intent: compare documents.');
    expect(prompt).toContain('Do not proceed until comparison targets are clear.');
  });

  test('formats follow-up assistant questions as two short lines with examples', () => {
    expect(
      formatFollowUpAssistantMessage({
        intent: 'extract',
        question: 'What kind of information should I extract?',
        examples: ['tax IDs', 'invoice numbers'],
      }),
    ).toBe('What kind of information should I extract?\nExamples: tax IDs or invoice numbers');
  });

  test('renders an explicit empty retrieval context', () => {
    expect(buildCitationContext([])).toBe('(no retrieved context)');
  });

  test('normalizes invalid stream-controller errors to a user-friendly retry message', () => {
    expect(
      normalizeChatGenerationError(new Error('Invalid state: Controller is already closed')),
    ).toBe('The chat response was interrupted before it finished. Please try again.');
    expect(normalizeChatGenerationError(new TypeError('ERR_INVALID_STATE'))).toBe(
      'The chat response was interrupted before it finished. Please try again.',
    );
  });

  test('detects whitespace-only model output as empty generated content', () => {
    expect(isEmptyGeneratedChatContent('')).toBe(true);
    expect(isEmptyGeneratedChatContent('  \n\t  ')).toBe(true);
    expect(isEmptyGeneratedChatContent('Answer')).toBe(false);
  });

  test('detects likely one-token truncated model output', () => {
    const metrics = {
      promptEvalCount: 4095,
      promptEvalDurationMs: null,
      evalCount: 1,
      evalDurationMs: null,
      totalDurationMs: 486,
      loadDurationMs: null,
      tokensPerSecond: 2.1,
      timeToFirstTokenMs: 451,
    };

    expect(isLikelyTruncatedSingleTokenAnswer({ content: 'Based', metrics })).toBe(true);
    expect(isLikelyTruncatedSingleTokenAnswer({ content: 'No', metrics: null })).toBe(false);
    expect(
      isLikelyTruncatedSingleTokenAnswer({
        content: 'No matching passport document was found.',
        metrics,
      }),
    ).toBe(false);
  });

  test('builds pending assistant messages with a status part for persisted refresh state', () => {
    const message = buildAssistantMessage({
      id: 'msg_pending',
      content: '',
      metadata: {
        conversationId: 'cht_1',
        generationStatus: 'pending',
        generationError: null,
      },
      citations: [],
      metrics: null,
    });

    expect(message).toMatchObject({
      id: 'msg_pending',
      role: 'assistant',
      metadata: {
        conversationId: 'cht_1',
        generationStatus: 'pending',
        generationError: null,
      },
      parts: [{ type: 'data-status', data: { label: 'generation' } }],
    });
  });

  test('maps citations to bounded normalized citation rows', () => {
    const rows = buildChatMessageCitationRows({
      conversationId: 'cht_1',
      messageId: 'msg_1',
      citations: [
        {
          ...citation,
          snippet: 'A'.repeat(900),
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: expect.stringMatching(/^cmc_/),
      conversationId: 'cht_1',
      messageId: 'msg_1',
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentVersionId: 'dvr_1',
      chunkId: 'chk_1',
      versionNumber: 1,
      pageStart: 2,
      pageEnd: 3,
      citationPrecision: 'page',
      locatorJson: {
        section: 'Retention',
        sectionPath: ['Records', 'Retention'],
        sourceElementIds: ['el_chunk_1', 'el_chunk_2'],
        tableSourceElementIds: ['el_table_1'],
        imageAssetIds: ['cas_1'],
        imageAssets: [
          {
            assetId: 'cas_1',
            sourceElementId: 'el_image_1',
            caption: 'Figure 1. Records retention timeline',
            pageNumber: 3,
          },
        ],
        boundingBoxes: [],
        assetType: 'table',
      },
    });
    expect(rows[0]?.snippet.length).toBeLessThanOrEqual(620);
  });

  test('bounds citations persisted into chat message JSON', () => {
    const [persisted] = sanitizeCitationsForMessagePersistence([
      {
        ...citation,
        snippet: 'B'.repeat(900),
        tablesHtml: ['<table><tr><td>source content</td></tr></table>'],
      },
    ]);

    expect(persisted?.snippet.length).toBeLessThanOrEqual(620);
    expect(persisted?.tablesHtml).toEqual([]);
  });

  test('builds hybrid retrieval arguments from pinned manifest versions', () => {
    expect(
      buildManifestHybridSearchArgs({
        manifestRows: [
          {
            vaultId: 'vlt_1',
            documentId: 'doc_1',
            documentVersionId: 'dvr_1',
            includedBy: 'document',
          },
          {
            vaultId: 'vlt_1',
            documentId: 'doc_1',
            documentVersionId: 'dvr_1',
            includedBy: 'document',
          },
          {
            vaultId: 'vlt_2',
            documentId: 'doc_2',
            documentVersionId: 'dvr_2',
            includedBy: 'vault',
          },
          {
            vaultId: 'vlt_3',
            documentId: 'doc_deleted',
            documentVersionId: null,
            includedBy: 'selection',
          },
        ],
        query: 'retention',
        limit: 8,
        candidateLimit: 120,
      }),
    ).toEqual({
      vaultIds: ['vlt_1', 'vlt_2'],
      documentVersionIds: ['dvr_1', 'dvr_2'],
      query: 'retention',
      limit: 8,
      candidateLimit: 120,
      mode: 'hybrid',
    });

    expect(
      buildManifestHybridSearchArgs({
        manifestRows: [
          {
            vaultId: 'vlt_3',
            documentId: 'doc_deleted',
            documentVersionId: null,
            includedBy: 'selection',
          },
        ],
        query: 'retention',
        limit: 8,
      }),
    ).toBeNull();
  });

  test('does not rematerialize already frozen empty manifests', () => {
    expect(shouldMaterializeConversationManifest({ contextFrozenAt: null })).toBe(true);
    expect(
      shouldMaterializeConversationManifest({
        contextFrozenAt: new Date('2026-05-05T10:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      getFrozenManifestContextAvailability({
        totalCount: 0,
        unavailableCount: 0,
      }),
    ).toMatchObject({
      status: 'source_document_deleted',
      readOnly: true,
    });
  });
});
