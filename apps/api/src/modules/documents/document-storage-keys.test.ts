import { describe, expect, test } from 'vitest';
import {
  documentVersionChunkAssetStorageKey,
  documentVersionChunkAssetStoragePrefix,
  documentVersionPagePreviewStorageKey,
  documentVersionPagePreviewStoragePrefix,
  documentVersionSourceStorageKey,
  legacyDocumentPagePreviewStorageKey,
  legacyDocumentPagePreviewStoragePrefix,
  legacyDocumentSourceStorageKey,
} from './document-storage-keys.js';

describe('document storage keys', () => {
  test('keeps legacy document-owned source keys available', () => {
    expect(
      legacyDocumentSourceStorageKey({
        vaultId: 'vlt_1',
        documentId: 'doc_1',
      }),
    ).toBe('vlt_1/doc_1');
  });

  test('builds version-owned source keys', () => {
    expect(
      documentVersionSourceStorageKey({
        vaultId: 'vlt_1',
        documentVersionId: 'dvr_1',
      }),
    ).toBe('vlt_1/dvr_1');
  });

  test('keeps legacy document-owned preview keys available', () => {
    expect(
      legacyDocumentPagePreviewStorageKey({
        documentId: 'doc_1',
        pageNumber: 7,
      }),
    ).toBe('previews/doc_1/pages/7.png');
    expect(legacyDocumentPagePreviewStoragePrefix('doc_1')).toBe('previews/doc_1');
  });

  test('builds version-owned preview keys', () => {
    expect(
      documentVersionPagePreviewStorageKey({
        documentVersionId: 'dvr_1',
        pageNumber: 7,
      }),
    ).toBe('previews/dvr_1/pages/7.png');
    expect(documentVersionPagePreviewStoragePrefix('dvr_1')).toBe('previews/dvr_1');
  });

  test('builds version-owned chunk asset keys under the version prefix', () => {
    expect(documentVersionChunkAssetStoragePrefix('dvr_1')).toBe('chunks/dvr_1');
    expect(
      documentVersionChunkAssetStorageKey({
        documentVersionId: 'dvr_1',
        assetPath: 'chunk-0/image-0.png',
      }),
    ).toBe('chunks/dvr_1/chunk-0/image-0.png');
  });

  test('rejects unsafe chunk asset subpaths', () => {
    for (const assetPath of [
      '',
      '/chunk-0/image-0.png',
      'chunk-0//image-0.png',
      '../image-0.png',
      'chunk-0\\image-0.png',
    ]) {
      expect(() =>
        documentVersionChunkAssetStorageKey({
          documentVersionId: 'dvr_1',
          assetPath,
        }),
      ).toThrow('Invalid storage asset path');
    }
  });
});
