import { describe, expect, it } from 'vitest';
import { buildTransferSections } from '../transfers-display';
import type { TransferItem } from '../uploads.types';

function transfer(overrides: Partial<TransferItem>): TransferItem {
  return {
    id: 'transfer_1',
    batchId: 'batch_1',
    sourceRootName: null,
    vaultId: 'vlt_1',
    folderId: null,
    relativePath: null,
    fileName: 'file.pdf',
    mimeType: 'application/pdf',
    size: 100,
    status: 'queued',
    progress: 0,
    bytesUploaded: 0,
    uploadedParts: [],
    partSize: null,
    partCount: null,
    retries: 0,
    error: null,
    uploadId: null,
    documentId: null,
    createdAt: 1,
    completedAt: null,
    ...overrides,
  };
}

describe('buildTransferSections', () => {
  it('lists directory uploads as flat file rows', () => {
    const sections = buildTransferSections([
      transfer({
        id: 'transfer_a',
        sourceRootName: 'Invoices',
        relativePath: 'Invoices/january.pdf',
        fileName: 'january.pdf',
        status: 'uploading',
        bytesUploaded: 50,
      }),
      transfer({
        id: 'transfer_b',
        sourceRootName: 'Invoices',
        relativePath: 'Invoices/february.pdf',
        fileName: 'february.pdf',
        status: 'queued',
      }),
      transfer({
        id: 'transfer_c',
        batchId: 'batch_2',
        sourceRootName: 'Archive',
        relativePath: 'Archive/done.pdf',
        fileName: 'done.pdf',
        status: 'completed',
        bytesUploaded: 100,
        progress: 100,
        completedAt: 2,
      }),
    ]);

    expect(sections.inProgress.map(item => item.name)).toEqual(['january.pdf', 'february.pdf']);
    expect(sections.inProgress.map(item => item.detail)).toEqual(['Invoices/january.pdf', 'Invoices/february.pdf']);
    expect(sections.inProgress.every(item => item.isDirectory === false)).toBe(true);
    expect(sections.success.map(item => item.name)).toEqual(['done.pdf']);
  });

  it('lists failed and successful files from a directory in their own sections', () => {
    const sections = buildTransferSections([
      transfer({
        id: 'transfer_a',
        sourceRootName: 'Taxes',
        relativePath: 'Taxes/2026/form.pdf',
        fileName: 'form.pdf',
        status: 'failed',
        error: 'Upload failed',
      }),
      transfer({
        id: 'transfer_b',
        sourceRootName: 'Taxes',
        relativePath: 'Taxes/2026/readme.txt',
        fileName: 'readme.txt',
        status: 'completed',
        bytesUploaded: 100,
        progress: 100,
      }),
    ]);

    expect(sections.success.map(item => item.name)).toEqual(['readme.txt']);
    expect(sections.failure).toHaveLength(1);
    expect(sections.failure[0]).toMatchObject({
      name: 'form.pdf',
      detail: 'Taxes/2026/form.pdf',
      mimeType: 'application/pdf',
      isDirectory: false,
      error: 'Upload failed',
    });
  });
});
