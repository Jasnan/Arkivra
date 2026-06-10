import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteDocumentVersion,
  getBulkDocumentDeletionImpact,
  getDocumentDeletionImpact,
  getDocumentVersion,
  getDocumentVersionDeletionImpact,
  getDocumentVersionDownloadUrl,
  listDocumentVersionChunks,
  listDocumentVersions,
  restoreDocumentVersion,
  translateDocument,
} from './documents.api';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function translationResponse(sourceType: 'page-image' | 'area-image' | 'text') {
  return {
    translation: {
      targetLanguage: 'en',
      text: 'Translated',
      provider: 'ollama',
      model: 'gemma4:e4b',
      sourceType,
    },
  };
}

describe('documents api helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posts document translation requests with abort signals', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(translationResponse('text')));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const result = await translateDocument({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      targetLanguage: 'en',
      source: {
        type: 'text',
        pageNumber: 2,
        text: 'Hallo',
      },
      signal: controller.signal,
    });

    expect(result.translation.text).toBe('Translated');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/translations',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          targetLanguage: 'en',
          source: {
            type: 'text',
            pageNumber: 2,
            text: 'Hallo',
          },
        }),
      }),
    );
  });

  it('posts full-page translations as rendered page images', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(translationResponse('page-image')));
    vi.stubGlobal('fetch', fetchMock);

    await translateDocument({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      targetLanguage: 'en',
      source: {
        type: 'page-image',
        pageNumber: 4,
        imageBase64: 'full-page-png',
        mimeType: 'image/png',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/translations',
      expect.objectContaining({
        body: JSON.stringify({
          targetLanguage: 'en',
          source: {
            type: 'page-image',
            pageNumber: 4,
            imageBase64: 'full-page-png',
            mimeType: 'image/png',
          },
        }),
      }),
    );
  });

  it('posts selected visual-area translations as cropped images', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(translationResponse('area-image')));
    vi.stubGlobal('fetch', fetchMock);

    await translateDocument({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      targetLanguage: 'de',
      source: {
        type: 'area-image',
        pageNumber: 4,
        imageBase64: 'cropped-area-png',
        mimeType: 'image/png',
        rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/translations',
      expect.objectContaining({
        body: JSON.stringify({
          targetLanguage: 'de',
          source: {
            type: 'area-image',
            pageNumber: 4,
            imageBase64: 'cropped-area-png',
            mimeType: 'image/png',
            rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
          },
        }),
      }),
    );
  });

  it('calls version read and mutation endpoints', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/versions/dvr_1') && init?.method === undefined) {
        return jsonResponse({ version: { id: 'dvr_1', content: 'v1' } });
      }

      if (String(input).endsWith('/versions/dvr_1/restore')) {
        return jsonResponse({ version: { id: 'dvr_2', content: 'restored' } }, 201);
      }

      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      if (String(input).endsWith('/versions/dvr_1/chunks')) {
        return jsonResponse({ chunks: [] });
      }

      return jsonResponse({ versions: [{ id: 'dvr_1', versionNumber: 1 }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await listDocumentVersions({ vaultId: 'vlt_1', documentId: 'doc_1' });
    await getDocumentVersion({ vaultId: 'vlt_1', documentId: 'doc_1', versionId: 'dvr_1' });
    await listDocumentVersionChunks({ vaultId: 'vlt_1', documentId: 'doc_1', versionId: 'dvr_1' });
    await restoreDocumentVersion({ vaultId: 'vlt_1', documentId: 'doc_1', versionId: 'dvr_1' });
    await getDocumentVersionDeletionImpact({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      versionId: 'dvr_1',
      limit: 5,
    });
    await getDocumentDeletionImpact({
      vaultId: 'vlt_1',
      documentId: 'doc_1',
      includeDeleted: true,
      limit: 5,
    });
    await getBulkDocumentDeletionImpact({
      documents: [
        { vaultId: 'vlt_1', documentId: 'doc_1' },
        { vaultId: 'vlt_1', documentId: 'doc_2' },
      ],
      includeDeleted: true,
    });
    await deleteDocumentVersion({ vaultId: 'vlt_1', documentId: 'doc_1', versionId: 'dvr_1' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/versions',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/chunks',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/restore',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/deletion-impact?limit=5',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/deletion-impact?includeDeleted=true&limit=5',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/deletion-impact',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          documents: [
            { vaultId: 'vlt_1', documentId: 'doc_1' },
            { vaultId: 'vlt_1', documentId: 'doc_2' },
          ],
          includeDeleted: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vaults/vlt_1/documents/doc_1/versions/dvr_1',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
    expect(
      getDocumentVersionDownloadUrl({ vaultId: 'vlt_1', documentId: 'doc_1', versionId: 'dvr_1' }),
    ).toBe('/api/vaults/vlt_1/documents/doc_1/versions/dvr_1/download');
  });
});
