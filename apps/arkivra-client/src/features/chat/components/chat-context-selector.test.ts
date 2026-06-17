import { describe, expect, it } from 'vitest';
import {
  contextSnapshotFromDraft,
  getDraftContextSummary,
  groupDocumentSelectionItems,
  isDocumentCoveredByVault,
  normalizeDraftContext,
} from './chat-context-selector';
import type { SearchResultItem } from '@/features/search/search.types';

function searchResult({
  vaultId,
  vaultName,
  documentId,
  name,
}: {
  vaultId: string;
  vaultName: string;
  documentId: string;
  name: string;
}): SearchResultItem {
  return {
    vaultId,
    vaultName,
    documentId,
    name,
    originalName: name,
    originalSize: 1024,
    mimeType: 'application/pdf',
    createdAt: '2026-05-20T10:00:00.000Z',
    updatedAt: '2026-05-20T10:00:00.000Z',
    matchedChunksCount: 0,
    bestChunk: null,
  };
}

describe('chat context selectors', () => {
  it('deduplicates individual files covered by selected vaults', () => {
    const context = normalizeDraftContext({
      vaults: [{ vaultId: 'vlt_tax', name: 'Tax Documents' }],
      documents: [
        { vaultId: 'vlt_tax', documentId: 'doc_2018', name: 'bescheid_2018.pdf' },
        { vaultId: 'vlt_other', documentId: 'doc_contract', name: 'contract.pdf' },
      ],
    });

    expect(context).toEqual({
      vaults: [{ vaultId: 'vlt_tax', name: 'Tax Documents' }],
      documents: [{ vaultId: 'vlt_other', documentId: 'doc_contract', name: 'contract.pdf' }],
    });
  });

  it('summarizes vaults and standalone individual files separately', () => {
    expect(getDraftContextSummary({
      vaults: [{ vaultId: 'vlt_1' }, { vaultId: 'vlt_2' }],
      documents: [
        { vaultId: 'vlt_1', documentId: 'doc_in_vault' },
        { vaultId: 'vlt_3', documentId: 'doc_a' },
        { vaultId: 'vlt_4', documentId: 'doc_b' },
        { vaultId: 'vlt_5', documentId: 'doc_c' },
      ],
    })).toMatchObject({
      vaultCount: 2,
      individualFileCount: 3,
      itemCount: 5,
      label: '2 vaults and 3 individual files attached',
    });

    expect(getDraftContextSummary({
      vaults: [],
      documents: [
        { vaultId: 'vlt_3', documentId: 'doc_a' },
        { vaultId: 'vlt_4', documentId: 'doc_b' },
      ],
    }).label).toBe('2 files attached');

    expect(getDraftContextSummary({
      vaults: [{ vaultId: 'vlt_1' }],
      documents: [{ vaultId: 'vlt_1', documentId: 'doc_in_vault' }],
    }).label).toBe('1 vault attached');
  });

  it('prevents snapshots from double-counting files already included through vaults', () => {
    expect(contextSnapshotFromDraft({
      vaults: [{ vaultId: 'vlt_tax', name: 'Tax Documents' }],
      documents: [{ vaultId: 'vlt_tax', documentId: 'doc_2019', name: 'bescheid_2019.pdf' }],
    })).toEqual({
      type: 'vault',
      vaultId: 'vlt_tax',
      vaultName: 'Tax Documents',
    });
  });

  it('detects document picker rows covered by selected vault context', () => {
    expect(isDocumentCoveredByVault({
      vaults: [{ vaultId: 'vlt_tax' }],
      documents: [],
    }, {
      vaultId: 'vlt_tax',
    })).toBe(true);

    expect(isDocumentCoveredByVault({
      vaults: [{ vaultId: 'vlt_tax' }],
      documents: [],
    }, {
      vaultId: 'vlt_other',
    })).toBe(false);
  });

  it('groups document picker results by vault while preserving result order inside each vault', () => {
    const firstTaxDocument = searchResult({
      vaultId: 'vlt_tax',
      vaultName: 'Tax Documents',
      documentId: 'doc_2020',
      name: 'bescheid_2020.pdf',
    });
    const legalDocument = searchResult({
      vaultId: 'vlt_legal',
      vaultName: 'Legal',
      documentId: 'doc_contract',
      name: 'contract.pdf',
    });
    const secondTaxDocument = searchResult({
      vaultId: 'vlt_tax',
      vaultName: 'Tax Documents',
      documentId: 'doc_2018',
      name: 'bescheid_2018.pdf',
    });

    expect(groupDocumentSelectionItems([
      firstTaxDocument,
      legalDocument,
      secondTaxDocument,
    ])).toEqual([
      { type: 'vault', vaultId: 'vlt_tax', vaultName: 'Tax Documents', documentCount: 2 },
      { type: 'document', document: firstTaxDocument },
      { type: 'document', document: secondTaxDocument },
      { type: 'vault', vaultId: 'vlt_legal', vaultName: 'Legal', documentCount: 1 },
      { type: 'document', document: legalDocument },
    ]);
  });
});
