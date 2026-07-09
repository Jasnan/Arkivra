import { describe, expect, test } from 'vitest';
import type { Citation } from '../search/search.types.js';
import type { ChatManifestRow } from './chat.core.js';
import type { ChatMessage } from './chat.types.js';
import {
  buildChatEffectiveRetrievalQuery,
  getContinuityManifestRows,
  getChatRetrievalTermsAfterFiltering,
  getChatRetrievalTermsBeforeFiltering,
  mergeChatContinuityCitations,
} from './chat.retrieval-query.js';

const manifest: ChatManifestRow[] = [
  {
    vaultId: 'vlt_1',
    documentId: 'doc_passport',
    documentVersionId: 'dvr_passport',
    includedBy: 'vault',
  },
  {
    vaultId: 'vlt_1',
    documentId: 'doc_invoice',
    documentVersionId: 'dvr_invoice',
    includedBy: 'vault',
  },
];

const passportCitation: Citation = {
  chunkId: 'chk_passport',
  documentId: 'doc_passport',
  documentVersionId: 'dvr_passport',
  versionNumber: 1,
  vaultId: 'vlt_1',
  vaultName: 'Personal',
  documentName: 'Mr_Been_passport.pdf',
  mimeType: 'application/pdf',
  pageStart: 1,
  pageEnd: 1,
  section: null,
  sectionPath: [],
  sourceElementIds: [],
  tableSourceElementIds: [],
  snippet: 'Passport number: X1234567. Expiry: 2028-04-01.',
  boundingBoxes: [],
  citationPrecision: 'page',
  assetType: 'text',
  tablesHtml: [],
  imageAssetIds: [],
  score: 0.7,
};

const invoiceCitation: Citation = {
  ...passportCitation,
  chunkId: 'chk_invoice',
  documentId: 'doc_invoice',
  documentVersionId: 'dvr_invoice',
  documentName: 'acme_invoice.pdf',
  snippet: 'Invoice number INV-123. Total amount 42.00.',
};

const unrelatedCitation: Citation = {
  ...passportCitation,
  chunkId: 'chk_unrelated',
  documentId: 'doc_unrelated',
  documentVersionId: 'dvr_unrelated',
  documentName: 'unrelated_identity_record.pdf',
  snippet: 'A separate identity record with a different reference number.',
  score: 0.05,
};

function userMessage(id: string, text: string): ChatMessage {
  return {
    id,
    role: 'user',
    metadata: {},
    parts: [{ type: 'text', text }],
  };
}

function assistantMessage(id: string, citations: Citation[]): ChatMessage {
  return {
    id,
    role: 'assistant',
    metadata: { citations },
    parts: [{ type: 'text', text: 'Answered from sources.' }],
  };
}

describe('chat effective retrieval query', () => {
  test('ambiguous follow-up uses the previous cited source as continuity context', () => {
    const query = buildChatEffectiveRetrievalQuery({
      latestUserMessage: 'When does it expire?',
      recentMessages: [
        userMessage('msg_u1', 'What is the passport number of Mr.Been?'),
        assistantMessage('msg_a1', [passportCitation]),
      ],
      manifest,
    });

    expect(query.followUpDetected).toBe(true);
    expect(query.effectiveRetrievalQuery).toContain('expire');
    expect(query.effectiveRetrievalQuery).toContain('passport');
    expect(query.effectiveRetrievalQuery).toContain('mr.been');
    expect(query.effectiveRetrievalQuery).toContain('mr_been_passport.pdf');
    expect(query.continuitySources).toEqual([
      {
        documentId: 'doc_passport',
        documentVersionId: 'dvr_passport',
        title: 'Mr_Been_passport.pdf',
        reason: 'previous_citation',
      },
    ]);
    expect(
      getContinuityManifestRows({
        manifestRows: manifest,
        continuitySources: query.continuitySources,
      }),
    ).toEqual([manifest[0]]);

    const merged = mergeChatContinuityCitations({
      retrievedCitations: [],
      continuityCitations: [passportCitation],
    });
    expect(merged.citations.map((citation) => citation.documentVersionId)).toEqual([
      'dvr_passport',
    ]);
    expect(merged.continuityCandidateChunkIds.has('chk_passport')).toBe(true);
  });

  test('ambiguous follow-up narrows multiple previous citations to the source matching the recent subject', () => {
    const multiSourceManifest: ChatManifestRow[] = [
      {
        vaultId: 'vlt_1',
        documentId: 'doc_unrelated',
        documentVersionId: 'dvr_unrelated',
        includedBy: 'vault',
      },
      {
        vaultId: 'vlt_1',
        documentId: 'doc_passport',
        documentVersionId: 'dvr_passport',
        includedBy: 'vault',
      },
    ];
    const query = buildChatEffectiveRetrievalQuery({
      latestUserMessage: 'When does it expire?',
      recentMessages: [
        userMessage('msg_u1', 'What is the passport number of Mr.Been?'),
        assistantMessage('msg_a1', [unrelatedCitation, passportCitation]),
      ],
      manifest: multiSourceManifest,
    });

    expect(query.followUpDetected).toBe(true);
    expect(query.continuitySources.map((source) => source.documentVersionId)).toEqual([
      'dvr_passport',
    ]);
    expect(query.effectiveRetrievalQuery).toContain('mr_been_passport.pdf');
    expect(query.effectiveRetrievalQuery).not.toContain('unrelated_identity_record.pdf');
    expect(
      getContinuityManifestRows({
        manifestRows: multiSourceManifest,
        continuitySources: query.continuitySources,
      }).map((row) => row.documentVersionId),
    ).toEqual(['dvr_passport']);

    const merged = mergeChatContinuityCitations({
      retrievedCitations: [unrelatedCitation],
      continuityCitations: [{ ...passportCitation, score: 0.04 }],
    });
    const boostedPassport = merged.citations.find(
      (citation) => citation.documentVersionId === 'dvr_passport',
    );
    expect(merged.boostedContinuityCandidateChunkIds.has('chk_passport')).toBe(true);
    expect(boostedPassport?.score).toBeGreaterThan(unrelatedCitation.score);
  });

  test('standalone topic change does not inherit an unrelated previous source', () => {
    const query = buildChatEffectiveRetrievalQuery({
      latestUserMessage: "Now check Sarah's passport",
      recentMessages: [
        userMessage('msg_u1', 'What is the passport number of Mr.Been?'),
        assistantMessage('msg_a1', [passportCitation]),
      ],
      manifest,
    });

    expect(query.followUpDetected).toBe(false);
    expect(query.continuitySources).toEqual([]);
    expect(query.effectiveRetrievalQuery).toContain('sarah');
    expect(query.effectiveRetrievalQuery).not.toContain('mr_b');
  });

  test('previous citations outside the current manifest are not used as continuity candidates', () => {
    const query = buildChatEffectiveRetrievalQuery({
      latestUserMessage: 'When does it expire?',
      recentMessages: [
        userMessage('msg_u1', 'What is the passport number of Mr.Been?'),
        assistantMessage('msg_a1', [passportCitation]),
      ],
      manifest: [
        {
          vaultId: 'vlt_1',
          documentId: 'doc_invoice',
          documentVersionId: 'dvr_invoice',
          includedBy: 'vault',
        },
      ],
    });

    expect(query.followUpDetected).toBe(true);
    expect(query.continuitySources).toEqual([]);
    expect(
      getContinuityManifestRows({
        manifestRows: manifest,
        continuitySources: query.continuitySources,
      }),
    ).toEqual([]);
  });

  test('weak FTS words are filtered from chat effective retrieval terms', () => {
    const before = getChatRetrievalTermsBeforeFiltering('When does it will expire?');
    const after = getChatRetrievalTermsAfterFiltering('When does it will expire?');
    const query = buildChatEffectiveRetrievalQuery({
      latestUserMessage: 'When does it will expire?',
      recentMessages: [
        userMessage('msg_u1', 'What is the passport number of Mr.Been?'),
        assistantMessage('msg_a1', [passportCitation]),
      ],
      manifest,
    });

    expect(before).toEqual(['when', 'does', 'it', 'will', 'expire']);
    expect(after).toEqual(['expire']);
    expect(query.ftsTermsAfterFiltering).toContain('expire');
    expect(query.ftsTermsAfterFiltering).not.toContain('does');
    expect(query.ftsTermsAfterFiltering).not.toContain('will');
  });

  test('longer conversations use only the bounded recent window and citations', () => {
    const oldCitation: Citation = {
      ...passportCitation,
      chunkId: 'chk_old',
      documentId: 'doc_old',
      documentVersionId: 'dvr_old',
      documentName: 'very_old_source.pdf',
    };
    const recentMessages: ChatMessage[] = [
      userMessage('msg_u0', 'Old question about Alpha archive'),
      assistantMessage('msg_a0', [oldCitation]),
      userMessage('msg_u1', 'Question about first recent topic'),
      assistantMessage('msg_a1', [passportCitation]),
      userMessage('msg_u2', 'Question about ACME invoice'),
      assistantMessage('msg_a2', [invoiceCitation]),
      userMessage('msg_u3', 'Question about Mr.Been passport'),
      assistantMessage('msg_a3', [passportCitation]),
    ];
    const query = buildChatEffectiveRetrievalQuery({
      latestUserMessage: 'What is the total amount?',
      recentMessages,
      manifest,
    });

    expect(query.followUpDetected).toBe(true);
    expect(query.retrievalHistoryWindow).toEqual({
      previousUserMessagesUsed: 2,
      previousAssistantMessagesUsed: 2,
      previousCitationTurnsUsed: 2,
    });
    expect(query.continuitySources.map((source) => source.documentVersionId)).toEqual([
      'dvr_passport',
      'dvr_invoice',
    ]);
    expect(query.effectiveRetrievalQuery).not.toContain('alpha');
    expect(query.effectiveRetrievalQuery).not.toContain('very_old_source');
  });
});
