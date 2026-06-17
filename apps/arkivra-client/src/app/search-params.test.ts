import { describe, expect, it } from 'vitest';
import {
  validateChatSearch,
  validateSearchRouteSearch,
  validateTransfersSearch,
  validateVaultWorkspaceSearch,
} from './search-params';

describe('route search param validation', () => {
  it('keeps valid search filters and drops invalid enum values', () => {
    expect(
      validateSearchRouteSearch({
        q: ' invoice ',
        vaultIds: 'vlt_1,vlt_2',
        tagIds: 'tag_1',
        dateFrom: '2026-04-01',
        sortBy: 'name_asc',
        searchMode: 'hybrid',
        source: 'search',
        ignored: 'value',
      }),
    ).toEqual({
      q: 'invoice',
      vaultIds: 'vlt_1,vlt_2',
      tagIds: 'tag_1',
      dateFrom: '2026-04-01',
      sortBy: 'name_asc',
      searchMode: 'hybrid',
      source: 'search',
    });

    expect(
      validateSearchRouteSearch({
        sortBy: 'updated_desc',
        searchMode: 'semantic',
        dateFrom: 'not-a-date',
        source: 'document',
      }),
    ).toEqual({});
  });

  it('keeps document workspace search return params and folder navigation state', () => {
    expect(
      validateVaultWorkspaceSearch({
        source: 'search',
        q: 'tax',
        vaultIds: 'vlt_1',
        tagIds: 'tag_1,tag_2',
        searchMode: 'keyword',
        folderId: 'fld_1',
      }),
    ).toEqual({
      source: 'search',
      q: 'tax',
      vaultIds: 'vlt_1',
      tagIds: 'tag_1,tag_2',
      searchMode: 'keyword',
      folderId: 'fld_1',
    });
  });

  it('validates chat and transfer search params', () => {
    expect(
      validateChatSearch({
        vaultId: ' vlt_1 ',
        documentId: 'doc_1',
        documentName: ' Paper.pdf ',
        extra: 'ignored',
      }),
    ).toEqual({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      documentName: 'Paper.pdf',
    });

    expect(
      validateTransfersSearch({
        vaultId: 'vlt_1',
        folderId: 'fld_1',
        locked: 'false',
      }),
    ).toEqual({
      vaultId: 'vlt_1',
      folderId: 'fld_1',
    });
  });
});
