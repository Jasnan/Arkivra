import { describe, expect, it } from 'vitest';
import { embeddingIndexDocumentJobId } from './embedding-index.queue.js';

describe('embedding index queue', () => {
  it('builds document indexing job ids from document version ids', () => {
    expect(embeddingIndexDocumentJobId('eix_active', 'dvr_1')).toBe(
      'embedding-index-document-eix_active-dvr_1',
    );
  });
});
