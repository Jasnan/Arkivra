import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translateDocument } from './documents.api';

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
});
